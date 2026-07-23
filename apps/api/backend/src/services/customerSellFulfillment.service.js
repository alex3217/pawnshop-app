import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { appendMarketplaceTransactionEvent } from "./marketplaceTransactionEvent.service.js";

const WRITE_PERMISSION = "customer-sell:write";
const MAX_ATTEMPTS = 3;
const SHOP_ACTIONS = new Set(["RECEIVE_ITEM", "START_INSPECTION", "ACCEPT_ORIGINAL_PRICE", "PROPOSE_REVISED_PRICE", "REJECT_ITEM", "MARK_RETURNED"]);
const CUSTOMER_ACTIONS = new Set(["ACCEPT_REVISED_PRICE", "REFUSE_REVISED_PRICE", "ACKNOWLEDGE"]);
const IDENTITY_RESULTS = new Set(["NOT_CHECKED", "VERIFIED", "NOT_VERIFIED"]);
const TRANSITIONS = Object.freeze({
  RECEIVE_ITEM: ["AWAITING_HANDOFF", "ITEM_RECEIVED"],
  START_INSPECTION: ["ITEM_RECEIVED", "INSPECTION_PENDING"],
  ACCEPT_ORIGINAL_PRICE: ["INSPECTION_PENDING", "READY_FOR_PAYMENT"],
  PROPOSE_REVISED_PRICE: ["INSPECTION_PENDING", "REVISED_PRICE_AWAITING_CUSTOMER"],
  ACCEPT_REVISED_PRICE: ["REVISED_PRICE_AWAITING_CUSTOMER", "READY_FOR_PAYMENT"],
  REFUSE_REVISED_PRICE: ["REVISED_PRICE_AWAITING_CUSTOMER", "REJECTED_PENDING_RETURN"],
  REJECT_ITEM: ["INSPECTION_PENDING", "REJECTED_PENDING_RETURN"],
  MARK_RETURNED: ["REJECTED_PENDING_RETURN", "RETURNED"],
});

function workflowError(message, statusCode = 409, code = "CUSTOMER_SELL_WORKFLOW_CONFLICT") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

const clean = (value) => String(value ?? "").trim();
const upper = (value) => clean(value).toUpperCase();

function requiredText(value, field, max = 500) {
  const result = clean(value);
  if (!result) throw workflowError(`${field} is required`, 400, "CUSTOMER_SELL_INVALID_INPUT");
  if (result.length > max) throw workflowError(`${field} is too long`, 400, "CUSTOMER_SELL_INVALID_INPUT");
  return result;
}

function evidenceUrls(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 10) {
    throw workflowError("evidenceUrls must contain at most 10 URLs", 400, "CUSTOMER_SELL_INVALID_INPUT");
  }
  return value.map((url) => requiredText(url, "evidence URL", 2048));
}

export async function assertCustomerSellActor({ tx, fulfillment, actorUserId, actorRole, customerOnly = false }) {
  const user = await tx.user.findUnique({
    where: { id: actorUserId },
    select: { id: true, role: true, isActive: true },
  });
  if (!user?.isActive) throw workflowError("Forbidden", 403, "CUSTOMER_SELL_FORBIDDEN");
  const role = upper(actorRole || user.role);
  const admin = role === "ADMIN" || role === "SUPER_ADMIN";
  if (customerOnly) {
    if (!admin && fulfillment.customerId !== user.id) {
      throw workflowError("Only the submission owner may make this decision", 403, "CUSTOMER_SELL_CUSTOMER_REQUIRED");
    }
    return { user, role, kind: admin ? "ADMIN" : "CUSTOMER" };
  }

  const shop = await tx.pawnShop.findUnique({
    where: { id: fulfillment.shopId },
    select: { id: true, ownerId: true, isDeleted: true, subscriptionStatus: true },
  });
  if (!shop || shop.isDeleted || upper(shop.subscriptionStatus) !== "ACTIVE") {
    throw workflowError("The shop is inactive", 409, "CUSTOMER_SELL_SHOP_INACTIVE");
  }
  if (shop.ownerId !== fulfillment.acceptedShopOwnerId) {
    throw workflowError("Shop ownership changed after offer acceptance", 409, "CUSTOMER_SELL_STALE_OWNERSHIP");
  }
  if (admin || shop.ownerId === user.id) return { user, role, kind: admin ? "ADMIN" : "OWNER", shop };

  const staff = await tx.staff.findFirst({
    where: { shopId: shop.id, userId: user.id, status: "ACTIVE", permissions: { has: WRITE_PERMISSION } },
    select: { id: true },
  });
  if (!staff) throw workflowError("Forbidden", 403, "CUSTOMER_SELL_FORBIDDEN");
  return { user, role, kind: "STAFF", shop };
}

export const CUSTOMER_SELL_DETAIL_INCLUDE = Object.freeze({
  submission: { select: { id: true, buyerId: true, title: true, description: true, category: true, condition: true, images: true, intent: true, status: true } },
  submissionOffer: { select: { id: true, submissionId: true, shopId: true, ownerId: true, amount: true, status: true, message: true } },
  payment: { select: { id: true, method: true, status: true, amount: true, currency: true, referenceNumber: true, evidenceUrls: true, recordedByUserId: true, idempotencyKey: true, recordedAt: true, createdAt: true } },
  receipt: true,
  events: { select: { id: true, actorUserId: true, actorRole: true, eventType: true, fromStatus: true, toStatus: true, data: true, createdAt: true }, orderBy: { createdAt: "asc" } },
});

async function loadFulfillment(tx, transactionId) {
  const fulfillment = await tx.customerSellFulfillment.findUnique({
    where: { transactionId: clean(transactionId) },
    include: CUSTOMER_SELL_DETAIL_INCLUDE,
  });
  if (!fulfillment) throw workflowError("Customer sale fulfillment not found", 404, "CUSTOMER_SELL_NOT_FOUND");
  return fulfillment;
}

function transitionData(action, body, fulfillment, now) {
  const common = {
    lastActorUserId: body.actorUserId,
    transitionIdempotencyKey: body.idempotencyKey,
    version: { increment: 1 },
  };
  switch (action) {
    case "RECEIVE_ITEM":
      return { ...common, lifecycleStatus: "ITEM_RECEIVED", itemReceivedAt: now, intakeId: body.intakeId || null, evidenceUrls: evidenceUrls(body.evidenceUrls) };
    case "START_INSPECTION":
      return { ...common, lifecycleStatus: "INSPECTION_PENDING", inspectionStatus: "PENDING", inspectionStartedAt: now };
    case "ACCEPT_ORIGINAL_PRICE":
      return { ...common, lifecycleStatus: "READY_FOR_PAYMENT", inspectionStatus: "ACCEPTED_ORIGINAL_PRICE", finalAmount: fulfillment.originalAmount, observedCondition: clean(body.observedCondition) || null, verifiedSerial: clean(body.verifiedSerial) || null, identityVerificationResult: upper(body.identityVerificationResult || "NOT_CHECKED"), inspectedAt: now, readyForPaymentAt: now, evidenceUrls: evidenceUrls(body.evidenceUrls) };
    case "PROPOSE_REVISED_PRICE":
      return { ...common, lifecycleStatus: "REVISED_PRICE_AWAITING_CUSTOMER", inspectionStatus: "REVISED_PRICE_PROPOSED", finalAmount: new Prisma.Decimal(requiredText(body.finalAmount, "finalAmount", 32)), observedCondition: clean(body.observedCondition) || null, verifiedSerial: clean(body.verifiedSerial) || null, identityVerificationResult: upper(body.identityVerificationResult || "NOT_CHECKED"), mismatchReason: requiredText(body.mismatchReason, "mismatchReason"), inspectedAt: now, revisedPriceProposedAt: now, evidenceUrls: evidenceUrls(body.evidenceUrls) };
    case "ACCEPT_REVISED_PRICE":
      return { ...common, lifecycleStatus: "READY_FOR_PAYMENT", inspectionStatus: "REVISED_PRICE_ACCEPTED", customerDecidedAt: now, readyForPaymentAt: now };
    case "REFUSE_REVISED_PRICE":
      return { ...common, lifecycleStatus: "REJECTED_PENDING_RETURN", inspectionStatus: "REVISED_PRICE_REFUSED", customerDecidedAt: now, rejectedAt: now, rejectionReason: clean(body.reason) || "CUSTOMER_REFUSED_REVISED_PRICE" };
    case "REJECT_ITEM":
      return { ...common, lifecycleStatus: "REJECTED_PENDING_RETURN", inspectionStatus: "REJECTED", rejectionReason: requiredText(body.reason, "reason"), observedCondition: clean(body.observedCondition) || null, verifiedSerial: clean(body.verifiedSerial) || null, inspectedAt: now, rejectedAt: now, evidenceUrls: evidenceUrls(body.evidenceUrls) };
    case "MARK_RETURNED":
      return { ...common, lifecycleStatus: "RETURNED", returnedAt: now };
    default:
      throw workflowError("Unsupported customer sale operation", 400, "CUSTOMER_SELL_INVALID_ACTION");
  }
}

async function mutateOnce(options) {
  return (options.prismaClient || prisma).$transaction(async (tx) => {
    const fulfillment = await loadFulfillment(tx, options.transactionId);
    const action = upper(options.action);
    const customerOnly = CUSTOMER_ACTIONS.has(action);
    if (!customerOnly && !SHOP_ACTIONS.has(action)) throw workflowError("Unsupported customer sale operation", 400, "CUSTOMER_SELL_INVALID_ACTION");
    const actor = await assertCustomerSellActor({ tx, fulfillment, actorUserId: options.actorUserId, actorRole: options.actorRole, customerOnly });
    const key = requiredText(options.idempotencyKey, "idempotencyKey", 200);
    const prior = await tx.marketplaceTransactionEvent.findUnique({ where: { idempotencyKey: key }, select: { transactionId: true } });
    if (prior) return { fulfillment, reused: true };
    const [from, to] = TRANSITIONS[action];
    if (fulfillment.lifecycleStatus !== from) {
      throw workflowError(`Cannot ${action} from ${fulfillment.lifecycleStatus}`);
    }
    if (action === "PROPOSE_REVISED_PRICE" && new Prisma.Decimal(options.finalAmount).equals(fulfillment.originalAmount)) {
      throw workflowError("A revised price must differ from the original price", 400, "CUSTOMER_SELL_INVALID_REVISED_PRICE");
    }
    const now = new Date();
    if (action === "RECEIVE_ITEM" && options.intakeId) {
      const intake = await tx.itemIntake.findFirst({
        where: {
          id: options.intakeId,
          linkedSubmissionId: fulfillment.submissionId,
          shopId: fulfillment.shopId,
          customerId: fulfillment.customerId,
          destination: "CUSTOMER_SELL",
        },
        select: { id: true },
      });
      if (!intake) throw workflowError("Intake does not match this customer sale", 409, "CUSTOMER_SELL_INTAKE_MISMATCH");
    }
    if (["ACCEPT_ORIGINAL_PRICE", "PROPOSE_REVISED_PRICE"].includes(action)) {
      const identityResult = upper(options.identityVerificationResult || "NOT_CHECKED");
      if (!IDENTITY_RESULTS.has(identityResult)) {
        throw workflowError("Invalid identity verification result", 400, "CUSTOMER_SELL_INVALID_INPUT");
      }
    }
    const updated = await tx.customerSellFulfillment.updateMany({
      where: { id: fulfillment.id, version: fulfillment.version, lifecycleStatus: from },
      data: transitionData(action, { ...options, actorUserId: actor.user.id, idempotencyKey: key }, fulfillment, now),
    });
    if (updated.count !== 1) throw workflowError("Customer sale changed concurrently");
    if (action === "PROPOSE_REVISED_PRICE") {
      await tx.customerSellPayment.update({
        where: { fulfillmentId: fulfillment.id },
        data: { amount: new Prisma.Decimal(options.finalAmount) },
      });
    }
    await appendMarketplaceTransactionEvent({
      tx, transactionId: fulfillment.transactionId, fulfillmentId: fulfillment.id,
      actorUserId: actor.user.id, actorRole: actor.role, eventType: `CUSTOMER_SELL_${action}`,
      fromStatus: from, toStatus: to, idempotencyKey: key,
      data: { reason: clean(options.reason) || undefined },
    });
    return { fulfillment: await loadFulfillment(tx, options.transactionId), reused: false };
  }, { isolationLevel: "Serializable" });
}

export async function mutateCustomerSellFulfillment(options) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      return await mutateOnce(options);
    } catch (error) {
      const retryable = error?.code === "P2034" || error?.code === "P2002";
      if (!retryable || attempt === MAX_ATTEMPTS - 1) throw error;
    }
  }
}

export async function acknowledgeCustomerSell(options) {
  return (options.prismaClient || prisma).$transaction(async (tx) => {
    const fulfillment = await loadFulfillment(tx, options.transactionId);
    const actor = await assertCustomerSellActor({ tx, fulfillment, actorUserId: options.actorUserId, actorRole: options.actorRole, customerOnly: true });
    if (fulfillment.lifecycleStatus !== "COMPLETED") throw workflowError("Only completed sales can be acknowledged");
    if (fulfillment.customerAcknowledgedAt) return { fulfillment, reused: true };
    const now = new Date();
    await tx.customerSellFulfillment.update({ where: { id: fulfillment.id }, data: { customerAcknowledgedAt: now, lastActorUserId: actor.user.id, version: { increment: 1 } } });
    await appendMarketplaceTransactionEvent({ tx, transactionId: fulfillment.transactionId, fulfillmentId: fulfillment.id, actorUserId: actor.user.id, actorRole: actor.role, eventType: "CUSTOMER_SELL_CUSTOMER_ACKNOWLEDGED", fromStatus: "COMPLETED", toStatus: "COMPLETED", idempotencyKey: requiredText(options.idempotencyKey, "idempotencyKey", 200) });
    return { fulfillment: await loadFulfillment(tx, options.transactionId), reused: false };
  }, { isolationLevel: "Serializable" });
}

export { workflowError };
