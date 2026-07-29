import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { getStripe, toAmountCents } from "../lib/stripe.js";

const ACTIVE_REFUND_STATUSES = ["REQUESTED", "PENDING", "REQUIRES_ACTION", "SUCCEEDED"];
const WITHDRAWN_EVENT_TYPES = new Set([
  "charge.dispute.created",
  "charge.dispute.funds_withdrawn",
]);

export class StripeFinancialLifecycleError extends Error {
  constructor(message, statusCode = 400, code = "INVALID_REQUEST") {
    super(message);
    this.name = "StripeFinancialLifecycleError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function text(value) {
  return String(value ?? "").trim();
}

function required(value, name, max = 500) {
  const result = text(value);
  if (!result) {
    throw new StripeFinancialLifecycleError(`${name} is required`, 400, "INVALID_REQUEST");
  }
  return result.slice(0, max);
}

function positiveCents(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new StripeFinancialLifecycleError(
      "amountCents must be a positive integer",
      400,
      "INVALID_REFUND_AMOUNT",
    );
  }
  return value;
}

function currency(value) {
  return text(value || "USD").toUpperCase();
}

function stripeId(value) {
  if (value && typeof value === "object") return text(value.id);
  return text(value);
}

function unixDate(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null;
}

function refundStatus(value) {
  const normalized = text(value).toLowerCase();
  return ({
    pending: "PENDING",
    requires_action: "REQUIRES_ACTION",
    succeeded: "SUCCEEDED",
    failed: "FAILED",
    canceled: "CANCELED",
  })[normalized] || "PENDING";
}

function disputeStatus(value) {
  const normalized = text(value).toLowerCase().toUpperCase();
  return [
    "WARNING_NEEDS_RESPONSE",
    "WARNING_UNDER_REVIEW",
    "WARNING_CLOSED",
    "NEEDS_RESPONSE",
    "UNDER_REVIEW",
    "WON",
    "LOST",
    "PREVENTED",
  ].includes(normalized) ? normalized : "UNKNOWN";
}

function isUniqueError(error) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function buildRefundIdempotencyKey(refundId) {
  return `stripe-refund:v1:${createHash("sha256").update(required(refundId, "refundId", 200)).digest("hex")}`;
}

function refundRequestKey({ settlementId, marketplaceTransactionId, requesterId, requestKey }) {
  const target = settlementId
    ? `settlement:${settlementId}`
    : `marketplace:${marketplaceTransactionId}`;
  const raw = `${target}\0${required(requesterId, "requesterId", 200)}\0${required(requestKey, "Idempotency-Key", 255)}`;
  return `refund-request:v1:${createHash("sha256").update(raw).digest("hex")}`;
}

async function loadTarget({ settlementId, marketplaceTransactionId, prismaClient }) {
  if (Boolean(settlementId) === Boolean(marketplaceTransactionId)) {
    throw new StripeFinancialLifecycleError(
      "Exactly one of settlementId or marketplaceTransactionId is required",
      400,
      "INVALID_REFUND_TARGET",
    );
  }

  if (settlementId) {
    const row = await prismaClient.settlement.findUnique({
      where: { id: settlementId },
      include: {
        auction: { include: { shop: true } },
        offer: { include: { item: { include: { shop: true } } } },
      },
    });
    if (!row) throw new StripeFinancialLifecycleError("Settlement not found", 404, "SETTLEMENT_NOT_FOUND");
    if (!row.stripePaymentIntent || !["CHARGED", "REFUNDED", "DISPUTED"].includes(row.status)) {
      throw new StripeFinancialLifecycleError("Settlement is not refundable", 409, "SETTLEMENT_NOT_REFUNDABLE");
    }
    const shop = row.auction?.shop || row.offer?.item?.shop || null;
    const sellerUserId = row.auction?.shop?.ownerId || row.offer?.ownerId;
    return {
      kind: "settlement",
      row,
      settlementId: row.id,
      marketplaceTransactionId: null,
      paymentIntentId: row.stripePaymentIntent,
      buyerUserId: row.winnerUserId,
      sellerUserId,
      shopId: shop?.id || null,
      totalCents: Number(row.grossAmountCents) || toAmountCents(row.finalPrice),
      sellerProceedsCents: Number(row.sellerNetCents) || toAmountCents(row.finalPrice),
      currency: currency(row.currency),
    };
  }

  const row = await prismaClient.marketplaceTransaction.findUnique({
    where: { id: marketplaceTransactionId },
  });
  if (!row) {
    throw new StripeFinancialLifecycleError(
      "Marketplace transaction not found",
      404,
      "MARKETPLACE_TRANSACTION_NOT_FOUND",
    );
  }
  if (!row.paymentIntentId || !["PAID", "FULFILLING", "COMPLETED", "REFUNDED", "DISPUTED"].includes(row.status)) {
    throw new StripeFinancialLifecycleError(
      "Marketplace transaction is not refundable",
      409,
      "MARKETPLACE_TRANSACTION_NOT_REFUNDABLE",
    );
  }
  const totalCents = toAmountCents(row.totalAmount);
  return {
    kind: "marketplace",
    row,
    settlementId: null,
    marketplaceTransactionId: row.id,
    paymentIntentId: row.paymentIntentId,
    buyerUserId: row.buyerUserId,
    sellerUserId: row.sellerUserId,
    shopId: row.sellerShopId,
    totalCents,
    sellerProceedsCents: Math.max(0, totalCents - toAmountCents(row.platformFee)),
    currency: currency(row.currency),
  };
}

async function recoveryState({ target, prismaClient }) {
  if (!target.shopId) {
    return { transferAlreadySent: false, recoveryRequirement: "NONE" };
  }
  const paid = await prismaClient.sellerPayout.findFirst({
    where: {
      shopId: target.shopId,
      sellerUserId: target.sellerUserId,
      status: "PAID",
      paidAt: { not: null },
    },
    select: { id: true },
  });
  return paid
    ? { transferAlreadySent: true, recoveryRequirement: "PLATFORM_RECOVERY_REQUIRED" }
    : { transferAlreadySent: false, recoveryRequirement: "NONE" };
}

async function appendRefundAudit(tx, { refund, eventType, actorUserId, stripeEventId, reason, snapshot }) {
  try {
    await tx.stripeRefundAuditEvent.create({
      data: {
        refundId: refund.id,
        eventType,
        actorUserId: actorUserId || null,
        stripeEventId: stripeEventId || null,
        reason: reason || null,
        snapshot,
      },
    });
  } catch (error) {
    if (!isUniqueError(error)) throw error;
  }
}

function sellerDebitCents({ target, refundedBeforeCents, refundedAfterCents }) {
  const before = Math.floor((target.sellerProceedsCents * refundedBeforeCents) / target.totalCents);
  const after = refundedAfterCents >= target.totalCents
    ? target.sellerProceedsCents
    : Math.floor((target.sellerProceedsCents * refundedAfterCents) / target.totalCents);
  return Math.max(0, after - before);
}

async function createRefundDebit(tx, { refund, target, refundedBeforeCents, refundedAfterCents }) {
  if (!target.shopId) return null;
  const amountCents = sellerDebitCents({ target, refundedBeforeCents, refundedAfterCents });
  if (amountCents <= 0) return null;
  return tx.sellerBalanceLedger.upsert({
    where: { refundId: refund.id },
    update: {},
    create: {
      refundId: refund.id,
      settlementId: target.settlementId,
      marketplaceTransactionId: target.marketplaceTransactionId,
      idempotencyKey: `refund-debit:${refund.id}`,
      sellerUserId: target.sellerUserId,
      shopId: target.shopId,
      type: "REFUND_DEBIT",
      status: "AVAILABLE",
      amountCents,
      currency: target.currency,
      availableAt: new Date(),
      description: "Compensating seller debit for Stripe refund",
      metadata: {
        stripeRefundId: refund.stripeRefundId,
        refundAmountCents: refund.amountCents,
        originalFinancialHistoryPreserved: true,
      },
    },
  });
}

async function updateRefundedTarget(tx, target, totalSucceededCents) {
  const fullyRefunded = totalSucceededCents >= target.totalCents;
  if (target.kind === "settlement") {
    if (fullyRefunded) {
      await tx.settlement.updateMany({
        where: { id: target.settlementId, status: { in: ["CHARGED", "DISPUTED", "REFUNDED"] } },
        data: { status: "REFUNDED" },
      });
    }
    return;
  }
  const previousMetadata =
    target.row.metadata && typeof target.row.metadata === "object" && !Array.isArray(target.row.metadata)
      ? target.row.metadata
      : {};
  await tx.marketplaceTransaction.updateMany({
    where: {
      id: target.marketplaceTransactionId,
      status: { in: ["PAID", "FULFILLING", "COMPLETED", "DISPUTED", "REFUNDED"] },
    },
    data: {
      ...(fullyRefunded ? { status: "REFUNDED" } : {}),
      metadata: {
        ...previousMetadata,
        refunds: { refundedAmountCents: totalSucceededCents, fullyRefunded },
      },
    },
  });
}

export async function requestStripeRefund({
  settlementId,
  marketplaceTransactionId,
  amountCents,
  reason,
  requesterId,
  requestKey,
  prismaClient = prisma,
  stripeClient,
} = {}) {
  const requestedAmount = positiveCents(amountCents);
  const safeReason = required(reason, "reason", 500);
  const key = refundRequestKey({ settlementId, marketplaceTransactionId, requesterId, requestKey });
  const existing = await prismaClient.stripeRefund.findUnique({ where: { idempotencyKey: key } });
  if (existing) return { refund: existing, created: false };

  const target = await loadTarget({ settlementId, marketplaceTransactionId, prismaClient });
  if (target.currency !== "USD") {
    throw new StripeFinancialLifecycleError("Only USD refunds are supported", 400, "INVALID_CURRENCY");
  }
  const recovery = await recoveryState({ target, prismaClient });

  let localRefund;
  try {
    localRefund = await prismaClient.$transaction(async (tx) => {
      if (target.settlementId) {
        await tx.$queryRaw`SELECT "id" FROM "Settlement" WHERE "id" = ${target.settlementId} FOR UPDATE`;
      } else {
        await tx.$queryRaw`SELECT "id" FROM "MarketplaceTransaction" WHERE "id" = ${target.marketplaceTransactionId} FOR UPDATE`;
      }
      const aggregate = await tx.stripeRefund.aggregate({
        where: {
          ...(target.settlementId
            ? { settlementId: target.settlementId }
            : { marketplaceTransactionId: target.marketplaceTransactionId }),
          status: { in: ACTIVE_REFUND_STATUSES },
        },
        _sum: { amountCents: true },
      });
      const alreadyRefundedCents = Number(aggregate._sum.amountCents || 0);
      if (requestedAmount > target.totalCents - alreadyRefundedCents) {
        throw new StripeFinancialLifecycleError(
          "Refund exceeds the remaining refundable amount",
          409,
          "REFUND_EXCEEDS_REMAINING",
        );
      }
      const refund = await tx.stripeRefund.create({
        data: {
          idempotencyKey: key,
          settlementId: target.settlementId,
          marketplaceTransactionId: target.marketplaceTransactionId,
          paymentIntentId: target.paymentIntentId,
          buyerUserId: target.buyerUserId,
          sellerUserId: target.sellerUserId,
          shopId: target.shopId,
          requestedByUserId: required(requesterId, "requesterId", 200),
          amountCents: requestedAmount,
          currency: target.currency,
          reason: safeReason,
          ...recovery,
        },
      });
      await appendRefundAudit(tx, {
        refund,
        eventType: "REFUND_REQUESTED",
        actorUserId: requesterId,
        reason: safeReason,
        snapshot: {
          amountCents: requestedAmount,
          currency: target.currency,
          remainingBeforeCents: target.totalCents - alreadyRefundedCents,
          ...recovery,
        },
      });
      return refund;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (isUniqueError(error)) {
      const raced = await prismaClient.stripeRefund.findUnique({
        where: { idempotencyKey: key },
      });
      if (raced) return { refund: raced, created: false };
    }
    throw error;
  }

  const stripe = stripeClient || getStripe();
  try {
    const stripeRefund = await stripe.refunds.create(
      {
        payment_intent: target.paymentIntentId,
        amount: requestedAmount,
        reason: "requested_by_customer",
        metadata: {
          refundRecordId: localRefund.id,
          settlementId: target.settlementId || "",
          marketplaceTransactionId: target.marketplaceTransactionId || "",
          requestedByUserId: requesterId,
          auditReason: safeReason,
        },
      },
      { idempotencyKey: buildRefundIdempotencyKey(localRefund.id) },
    );
    const refund = await syncStripeRefundEvent({
      stripeRefund,
      eventType: `refund.${text(stripeRefund.status) === "failed" ? "failed" : "created"}`,
      prismaClient,
    });
    return { refund: refund.refund, created: true };
  } catch (error) {
    await prismaClient.$transaction(async (tx) => {
      const refund = await tx.stripeRefund.update({
        where: { id: localRefund.id },
        data: {
          status: "FAILED",
          failedAt: new Date(),
          failureCode: text(error?.code || error?.type).slice(0, 100) || "stripe_error",
          failureMessage: text(error?.message).slice(0, 500) || "Stripe refund failed",
        },
      });
      await appendRefundAudit(tx, {
        refund,
        eventType: "REFUND_SUBMISSION_FAILED",
        actorUserId: requesterId,
        reason: safeReason,
        snapshot: {
          failureCode: refund.failureCode,
          failureMessage: refund.failureMessage,
        },
      });
    });
    throw new StripeFinancialLifecycleError(
      "Stripe refund could not be submitted",
      502,
      "STRIPE_REFUND_FAILED",
    );
  }
}

async function targetForRefundRecord(refund, prismaClient) {
  return loadTarget({
    settlementId: refund.settlementId,
    marketplaceTransactionId: refund.marketplaceTransactionId,
    prismaClient,
  });
}

export async function syncStripeRefundEvent({
  stripeRefund,
  eventType,
  stripeEventId,
  prismaClient = prisma,
} = {}) {
  const refundId = required(stripeRefund?.id, "Stripe refund id", 255);
  const recordId = text(stripeRefund?.metadata?.refundRecordId);
  let record = recordId
    ? await prismaClient.stripeRefund.findUnique({ where: { id: recordId } })
    : null;
  if (!record) {
    record = await prismaClient.stripeRefund.findUnique({ where: { stripeRefundId: refundId } });
  }
  if (!record) {
    const paymentIntentId = stripeId(stripeRefund?.payment_intent);
    const settlement = paymentIntentId
      ? await prismaClient.settlement.findUnique({ where: { stripePaymentIntent: paymentIntentId } })
      : null;
    const marketplace = !settlement && paymentIntentId
      ? await prismaClient.marketplaceTransaction.findUnique({ where: { paymentIntentId } })
      : null;
    if (!settlement && !marketplace) return { handled: false, reason: "PAYMENT_NOT_FOUND" };
    const target = await loadTarget({
      settlementId: settlement?.id,
      marketplaceTransactionId: marketplace?.id,
      prismaClient,
    });
    const recovery = await recoveryState({ target, prismaClient });
    record = await prismaClient.stripeRefund.upsert({
      where: { stripeRefundId: refundId },
      update: {},
      create: {
        stripeRefundId: refundId,
        idempotencyKey: `stripe-originated:${refundId}`,
        settlementId: target.settlementId,
        marketplaceTransactionId: target.marketplaceTransactionId,
        paymentIntentId: target.paymentIntentId,
        chargeId: stripeId(stripeRefund?.charge) || null,
        buyerUserId: target.buyerUserId,
        sellerUserId: target.sellerUserId,
        shopId: target.shopId,
        requestedByUserId: target.sellerUserId,
        amountCents: positiveCents(Number(stripeRefund?.amount)),
        currency: currency(stripeRefund?.currency),
        reason: text(stripeRefund?.metadata?.auditReason) || "Stripe-originated refund",
        stripeReason: text(stripeRefund?.reason) || null,
        ...recovery,
      },
    });
  }

  const target = await targetForRefundRecord(record, prismaClient);
  const nextStatus = eventType === "refund.failed" ? "FAILED" : refundStatus(stripeRefund?.status);
  const previousStatus = record.status;
  const result = await prismaClient.$transaction(async (tx) => {
    if (stripeEventId) {
      const prior = await tx.stripeRefundAuditEvent.findUnique({ where: { stripeEventId } });
      if (prior) return { refund: record, idempotent: true };
    }
    const updated = await tx.stripeRefund.update({
      where: { id: record.id },
      data: {
        stripeRefundId: refundId,
        chargeId: stripeId(stripeRefund?.charge) || record.chargeId,
        stripeReason: text(stripeRefund?.reason) || record.stripeReason,
        status: nextStatus,
        failureCode: text(stripeRefund?.failure_reason) || null,
        failureMessage: nextStatus === "FAILED"
          ? text(stripeRefund?.failure_reason) || "Stripe refund failed"
          : null,
        succeededAt: nextStatus === "SUCCEEDED" ? new Date() : record.succeededAt,
        failedAt: nextStatus === "FAILED" ? new Date() : null,
      },
    });
    await appendRefundAudit(tx, {
      refund: updated,
      eventType,
      stripeEventId,
      reason: updated.reason,
      snapshot: {
        stripeRefundId: refundId,
        previousStatus,
        status: nextStatus,
        amountCents: updated.amountCents,
        failureReason: text(stripeRefund?.failure_reason) || null,
      },
    });
    if (nextStatus === "SUCCEEDED" && previousStatus !== "SUCCEEDED") {
      const previous = await tx.stripeRefund.aggregate({
        where: {
          ...(target.settlementId
            ? { settlementId: target.settlementId }
            : { marketplaceTransactionId: target.marketplaceTransactionId }),
          status: "SUCCEEDED",
          id: { not: updated.id },
        },
        _sum: { amountCents: true },
      });
      const before = Number(previous._sum.amountCents || 0);
      await createRefundDebit(tx, {
        refund: updated,
        target,
        refundedBeforeCents: before,
        refundedAfterCents: before + updated.amountCents,
      });
      await updateRefundedTarget(tx, target, before + updated.amountCents);
    }
    return { refund: updated, idempotent: previousStatus === nextStatus };
  });
  return { handled: true, ...result };
}

async function targetFromDispute(dispute, prismaClient) {
  const paymentIntentId = stripeId(dispute?.payment_intent);
  const chargeId = stripeId(dispute?.charge);
  const existing = await prismaClient.stripeDispute.findUnique({
    where: { stripeDisputeId: required(dispute?.id, "Stripe dispute id", 255) },
  });
  if (existing) {
    const target = await loadTarget({
      settlementId: existing.settlementId,
      marketplaceTransactionId: existing.marketplaceTransactionId,
      prismaClient,
    });
    return { existing, target, paymentIntentId: paymentIntentId || existing.paymentIntentId, chargeId };
  }
  const settlement = paymentIntentId
    ? await prismaClient.settlement.findUnique({ where: { stripePaymentIntent: paymentIntentId } })
    : null;
  const marketplace = !settlement && paymentIntentId
    ? await prismaClient.marketplaceTransaction.findUnique({ where: { paymentIntentId } })
    : null;
  if (!settlement && !marketplace) return null;
  return {
    existing: null,
    target: await loadTarget({
      settlementId: settlement?.id,
      marketplaceTransactionId: marketplace?.id,
      prismaClient,
    }),
    paymentIntentId,
    chargeId,
  };
}

async function createDisputeLedgerEntry(tx, { dispute, target, type, suffix }) {
  if (!target.shopId) return null;
  return tx.sellerBalanceLedger.upsert({
    where: { idempotencyKey: `dispute:${dispute.id}:${suffix}` },
    update: {},
    create: {
      disputeId: dispute.id,
      settlementId: target.settlementId,
      marketplaceTransactionId: target.marketplaceTransactionId,
      idempotencyKey: `dispute:${dispute.id}:${suffix}`,
      sellerUserId: target.sellerUserId,
      shopId: target.shopId,
      type,
      status: "AVAILABLE",
      amountCents: Math.min(dispute.amountCents, target.sellerProceedsCents),
      currency: dispute.currency,
      availableAt: new Date(),
      description: type === "REFUND_DEBIT"
        ? "Compensating seller debit for Stripe dispute"
        : "Seller credit for reinstated Stripe dispute funds",
      metadata: {
        stripeDisputeId: dispute.stripeDisputeId,
        originalFinancialHistoryPreserved: true,
      },
    },
  });
}

export async function syncStripeDisputeEvent({
  dispute,
  eventType,
  stripeEventId,
  prismaClient = prisma,
} = {}) {
  const resolved = await targetFromDispute(dispute, prismaClient);
  if (!resolved) return { handled: false, reason: "PAYMENT_NOT_FOUND" };
  const { target } = resolved;
  const recovery = await recoveryState({ target, prismaClient });
  return prismaClient.$transaction(async (tx) => {
    const prior = await tx.stripeDisputeEvent.findUnique({ where: { stripeEventId } });
    if (prior) return { handled: true, idempotent: true };
    const status = disputeStatus(dispute?.status);
    const fundsWithdrawn =
      eventType === "charge.dispute.funds_reinstated"
        ? false
        : (resolved.existing?.fundsWithdrawn || WITHDRAWN_EVENT_TYPES.has(eventType));
    const stored = await tx.stripeDispute.upsert({
      where: { stripeDisputeId: dispute.id },
      update: {
        status,
        paymentIntentId: resolved.paymentIntentId || null,
        chargeId: resolved.chargeId,
        reason: required(dispute?.reason || "unknown", "dispute reason", 200),
        fundsWithdrawn,
        fundsReinstated:
          eventType === "charge.dispute.funds_reinstated" || resolved.existing?.fundsReinstated || false,
        evidenceDueAt: unixDate(dispute?.evidence_details?.due_by),
        closedAt: eventType === "charge.dispute.closed" ? new Date() : resolved.existing?.closedAt,
        ...recovery,
      },
      create: {
        stripeDisputeId: dispute.id,
        settlementId: target.settlementId,
        marketplaceTransactionId: target.marketplaceTransactionId,
        paymentIntentId: resolved.paymentIntentId || null,
        chargeId: required(resolved.chargeId, "Stripe charge id", 255),
        buyerUserId: target.buyerUserId,
        sellerUserId: target.sellerUserId,
        shopId: target.shopId,
        amountCents: positiveCents(Number(dispute?.amount)),
        currency: currency(dispute?.currency),
        reason: required(dispute?.reason || "unknown", "dispute reason", 200),
        status,
        fundsWithdrawn,
        fundsReinstated: eventType === "charge.dispute.funds_reinstated",
        evidenceDueAt: unixDate(dispute?.evidence_details?.due_by),
        closedAt: eventType === "charge.dispute.closed" ? new Date() : null,
        ...recovery,
      },
    });
    await tx.stripeDisputeEvent.create({
      data: {
        disputeId: stored.id,
        stripeEventId: required(stripeEventId, "Stripe event id", 255),
        eventType,
        snapshot: {
          status,
          amountCents: stored.amountCents,
          fundsWithdrawn,
          fundsReinstated: stored.fundsReinstated,
          ...recovery,
        },
      },
    });
    if (WITHDRAWN_EVENT_TYPES.has(eventType)) {
      await createDisputeLedgerEntry(tx, { dispute: stored, target, type: "REFUND_DEBIT", suffix: "withdrawn" });
    }
    if (eventType === "charge.dispute.funds_reinstated") {
      await createDisputeLedgerEntry(tx, { dispute: stored, target, type: "REVERSAL_CREDIT", suffix: "reinstated" });
    }
    if (target.kind === "settlement") {
      await tx.settlement.updateMany({
        where: { id: target.settlementId, status: { in: ["CHARGED", "DISPUTED"] } },
        data: { status: status === "WON" || status === "PREVENTED" ? "CHARGED" : "DISPUTED" },
      });
    } else {
      await tx.marketplaceTransaction.updateMany({
        where: {
          id: target.marketplaceTransactionId,
          status: { in: ["PAID", "FULFILLING", "COMPLETED", "DISPUTED"] },
        },
        data: { status: status === "WON" || status === "PREVENTED" ? "PAID" : "DISPUTED" },
      });
    }
    return { handled: true, idempotent: false, dispute: stored };
  });
}
