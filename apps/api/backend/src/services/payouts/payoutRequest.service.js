import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { getStripe } from "../../lib/stripe.js";

const USD = "USD";
const RESERVATION_STATUS = "AVAILABLE";
const RELEASED_STATUS = "REVERSED";

export class PayoutRequestError extends Error {
  constructor(message, statusCode, code) {
    super(message);
    this.name = "PayoutRequestError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function clean(value) {
  return String(value ?? "").trim();
}

function required(value, name) {
  const result = clean(value);
  if (!result) throw new PayoutRequestError(`${name} is required`, 400, "INVALID_REQUEST");
  return result;
}

function amount(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new PayoutRequestError("amountCents must be a positive integer", 400, "INVALID_AMOUNT");
  }
  return value;
}

export function getMinimumPayoutCents() {
  const configured = Number(process.env.SELLER_PAYOUT_MINIMUM_CENTS || 1000);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : 1000;
}

export function normalizePayoutIdempotencyKey(rawKey, requesterId) {
  const key = required(rawKey, "Idempotency-Key");
  if (key.length > 255) {
    throw new PayoutRequestError("Idempotency-Key is too long", 400, "INVALID_IDEMPOTENCY_KEY");
  }
  return `payout:${createHash("sha256").update(`${required(requesterId, "requesterId")}\0${key}`).digest("hex")}`;
}

function normalizeCurrency(value) {
  const currency = clean(value || USD).toUpperCase();
  if (currency !== USD) {
    throw new PayoutRequestError("Only USD payouts are supported", 400, "INVALID_CURRENCY");
  }
  return currency;
}

function samePayload(payout, input) {
  return payout.shopId === input.shopId &&
    payout.amountCents === input.amountCents &&
    payout.currency === input.currency &&
    payout.requestedByUserId === input.requesterId;
}

function assertReplay(payout, input) {
  if (!samePayload(payout, input)) {
    throw new PayoutRequestError(
      "Idempotency-Key was already used for a different payout request",
      409,
      "IDEMPOTENCY_CONFLICT",
    );
  }
  return { payout, created: false, minimumPayoutCents: getMinimumPayoutCents() };
}

function isUniqueError(error) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function createPayoutRequest({
  shopId,
  amountCents,
  currency = USD,
  requesterId,
  idempotencyKey,
  requestNote,
  prismaClient = prisma,
} = {}) {
  const input = {
    shopId: required(shopId, "shopId"),
    amountCents: amount(amountCents),
    currency: normalizeCurrency(currency),
    requesterId: required(requesterId, "requesterId"),
    idempotencyKey: normalizePayoutIdempotencyKey(idempotencyKey, requesterId),
    requestNote: clean(requestNote).slice(0, 500) || null,
  };
  const minimum = getMinimumPayoutCents();
  if (input.amountCents < minimum) {
    throw new PayoutRequestError(`Minimum payout is ${minimum} cents`, 400, "BELOW_MINIMUM");
  }
  if (clean(process.env.STRIPE_CONNECT_ENABLED).toLowerCase() !== "true") {
    throw new PayoutRequestError("Stripe Connect payouts are unavailable", 503, "CONNECT_UNAVAILABLE");
  }

  const existing = await prismaClient.sellerPayout.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) return assertReplay(existing, input);

  try {
    return await prismaClient.$transaction(async (tx) => {
      // Lock one stable shop row before recalculating. Concurrent requests for
      // the same shop therefore serialize on PostgreSQL.
      await tx.$queryRaw`SELECT "id" FROM "PawnShop" WHERE "id" = ${input.shopId} FOR UPDATE`;
      const shop = await tx.pawnShop.findFirst({
        where: { id: input.shopId, isDeleted: false },
        select: {
          id: true, ownerId: true, stripeConnectAccountId: true,
          stripeConnectDetailsSubmitted: true, stripeConnectPayoutsEnabled: true,
        },
      });
      if (!shop) throw new PayoutRequestError("Shop not found", 404, "SHOP_NOT_FOUND");
      if (!shop.stripeConnectAccountId || !shop.stripeConnectDetailsSubmitted) {
        throw new PayoutRequestError("Stripe Connect setup is incomplete", 409, "CONNECT_INCOMPLETE");
      }
      if (!shop.stripeConnectPayoutsEnabled) {
        throw new PayoutRequestError("Stripe has not enabled payouts for this shop", 409, "PAYOUTS_DISABLED");
      }

      const replay = await tx.sellerPayout.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (replay) return assertReplay(replay, input);

      const aggregate = await tx.sellerBalanceLedger.aggregate({
        where: { shopId: shop.id, sellerUserId: shop.ownerId, currency: input.currency, status: "AVAILABLE" },
        _sum: { amountCents: true },
      });
      const debits = await tx.sellerBalanceLedger.aggregate({
        where: {
          shopId: shop.id, sellerUserId: shop.ownerId, currency: input.currency,
          status: "AVAILABLE", type: { in: ["PAYOUT_DEBIT", "REFUND_DEBIT", "ADJUSTMENT_DEBIT"] },
        },
        _sum: { amountCents: true },
      });
      const availableCents = Number(aggregate._sum.amountCents || 0) - 2 * Number(debits._sum.amountCents || 0);
      if (input.amountCents > availableCents) {
        throw new PayoutRequestError("Payout exceeds the available balance", 409, "INSUFFICIENT_BALANCE");
      }

      const payout = await tx.sellerPayout.create({
        data: {
          sellerUserId: shop.ownerId, shopId: shop.id, status: "PENDING",
          amountCents: input.amountCents, currency: input.currency, provider: "STRIPE_TRANSFER",
          idempotencyKey: input.idempotencyKey, requestedByUserId: input.requesterId,
          requestNote: input.requestNote,
        },
      });
      // AVAILABLE is the reserving state: it reduces available funds immediately.
      // It remains AVAILABLE after payment; cancellation/failure changes it to
      // REVERSED so the amount becomes requestable again.
      await tx.sellerBalanceLedger.create({
        data: {
          payoutId: payout.id, sellerUserId: shop.ownerId, shopId: shop.id,
          type: "PAYOUT_DEBIT", status: RESERVATION_STATUS,
          amountCents: input.amountCents, currency: input.currency,
          availableAt: new Date(), description: "Reserved for owner payout request",
          metadata: { payoutStatus: "PENDING" },
        },
      });
      return { payout, created: true, minimumPayoutCents: minimum };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  } catch (error) {
    if (isUniqueError(error)) {
      const raced = await prismaClient.sellerPayout.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (raced) return assertReplay(raced, input);
    }
    throw error;
  }
}

export async function cancelPayoutRequest({
  shopId, payoutId, requesterId, cancellationReason, prismaClient = prisma,
} = {}) {
  const safeShopId = required(shopId, "shopId");
  const safePayoutId = required(payoutId, "payoutId");
  return prismaClient.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "SellerPayout" WHERE "id" = ${safePayoutId} FOR UPDATE`;
    const payout = await tx.sellerPayout.findUnique({ where: { id: safePayoutId } });
    if (!payout || payout.shopId !== safeShopId) {
      throw new PayoutRequestError("Payout not found", 404, "PAYOUT_NOT_FOUND");
    }
    if (payout.status === "CANCELED") return payout;
    if (payout.status !== "PENDING") {
      throw new PayoutRequestError("Only pending payouts can be canceled", 409, "PAYOUT_NOT_CANCELABLE");
    }
    const updated = await tx.sellerPayout.update({
      where: { id: payout.id },
      data: {
        status: "CANCELED", canceledAt: new Date(),
        cancellationReason: clean(cancellationReason).slice(0, 500) || "Canceled by requester",
        reviewedByUserId: required(requesterId, "requesterId"), reviewedAt: new Date(),
      },
    });
    await tx.sellerBalanceLedger.updateMany({
      where: { payoutId: payout.id, type: "PAYOUT_DEBIT", status: RESERVATION_STATUS },
      data: { status: RELEASED_STATUS, metadata: { payoutStatus: "CANCELED", reservationReleased: true } },
    });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function permanentStripeFailure(error) {
  return ["StripeCardError", "StripeInvalidRequestError", "StripePermissionError", "StripeAuthenticationError"].includes(error?.type);
}

export async function processPayoutRequest({
  shopId, payoutId, reviewerId, prismaClient = prisma, stripe,
} = {}) {
  if (clean(process.env.STRIPE_CONNECT_ENABLED).toLowerCase() !== "true") {
    throw new PayoutRequestError("Stripe Connect payouts are unavailable", 503, "CONNECT_UNAVAILABLE");
  }
  const stripeClient = stripe || getStripe();
  const safeShopId = required(shopId, "shopId");
  const safePayoutId = required(payoutId, "payoutId");
  const claimed = await prismaClient.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "SellerPayout" WHERE "id" = ${safePayoutId} FOR UPDATE`;
    const payout = await tx.sellerPayout.findUnique({
      where: { id: safePayoutId },
      include: { shop: { select: { stripeConnectAccountId: true } } },
    });
    if (!payout || payout.shopId !== safeShopId) throw new PayoutRequestError("Payout not found", 404, "PAYOUT_NOT_FOUND");
    if (!payout.shop.stripeConnectAccountId) {
      throw new PayoutRequestError("Stripe Connect setup is incomplete", 409, "CONNECT_INCOMPLETE");
    }
    if (["TRANSFERRED", "PAID"].includes(payout.status)) return payout;
    if (payout.status === "PROCESSING" && payout.stripeTransferId) return payout;
    if (payout.status === "PROCESSING") return payout;
    if (payout.status !== "PENDING") throw new PayoutRequestError("Payout cannot be processed", 409, "PAYOUT_NOT_PROCESSABLE");
    return tx.sellerPayout.update({
      where: { id: payout.id },
      data: { status: "PROCESSING", processingAt: new Date(), reviewedByUserId: reviewerId, reviewedAt: new Date() },
      include: { shop: { select: { stripeConnectAccountId: true } } },
    });
  });
  if (["TRANSFERRED", "PAID"].includes(claimed.status) || claimed.stripeTransferId) return claimed;

  try {
    const transfer = await stripeClient.transfers.create({
      amount: claimed.amountCents,
      currency: claimed.currency.toLowerCase(),
      destination: claimed.shop.stripeConnectAccountId,
      metadata: { payoutId: claimed.id, shopId: claimed.shopId },
    }, { idempotencyKey: `seller-payout:${claimed.id}` });
    return await prismaClient.sellerPayout.update({
      where: { id: claimed.id },
      data: {
        status: "TRANSFERRED", stripeTransferId: String(transfer.id),
        failureCode: null, failureMessage: null,
      },
    });
  } catch (error) {
    const permanent = permanentStripeFailure(error);
    await prismaClient.$transaction(async (tx) => {
      await tx.sellerPayout.update({
        where: { id: claimed.id },
        data: permanent ? {
          status: "FAILED", failedAt: new Date(),
          failureCode: clean(error?.code || error?.type).slice(0, 100) || "stripe_error",
          failureMessage: clean(error?.message).slice(0, 500) || "Stripe transfer failed",
        } : {
          status: "PENDING", processingAt: null,
          failureCode: "temporary_provider_error",
          failureMessage: "Stripe transfer could not be submitted; retry processing",
        },
      });
      if (permanent) {
        await tx.sellerBalanceLedger.updateMany({
          where: { payoutId: claimed.id, type: "PAYOUT_DEBIT", status: RESERVATION_STATUS },
          data: { status: RELEASED_STATUS, metadata: { payoutStatus: "FAILED", reservationReleased: true } },
        });
      }
    });
    throw new PayoutRequestError(
      permanent ? "Stripe rejected the transfer" : "Stripe is temporarily unavailable",
      permanent ? 422 : 503,
      permanent ? "TRANSFER_FAILED" : "PROVIDER_UNAVAILABLE",
    );
  }
}

export async function syncPayoutTransferEvent({ transfer, eventType, prismaClient = prisma } = {}) {
  const transferId = clean(transfer?.id);
  const payoutId = clean(transfer?.metadata?.payoutId);
  if (!transferId && !payoutId) return { matched: false };
  const matches = [];
  if (transferId) matches.push({ stripeTransferId: transferId });
  if (payoutId) matches.push({ id: payoutId });
  const payout = await prismaClient.sellerPayout.findFirst({
    where: { OR: matches },
  });
  if (!payout) return { matched: false };
  if (eventType === "transfer.reversed" && payout.status !== "FAILED") {
    await prismaClient.$transaction([
      prismaClient.sellerPayout.update({
        where: { id: payout.id },
        data: { status: "FAILED", failedAt: new Date(), failureCode: "transfer_reversed", failureMessage: "Stripe transfer was reversed" },
      }),
      prismaClient.sellerBalanceLedger.updateMany({
        where: { payoutId: payout.id, type: "PAYOUT_DEBIT", status: RESERVATION_STATUS },
        data: { status: RELEASED_STATUS, metadata: { payoutStatus: "FAILED", reservationReleased: true } },
      }),
    ]);
  }
  return { matched: true };
}
