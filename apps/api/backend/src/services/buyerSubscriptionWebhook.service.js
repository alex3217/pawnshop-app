import { prisma } from "../lib/prisma.js";
import { mapStripeSubscriptionStatus } from "../lib/stripe.js";

const TYPES = new Set(["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_succeeded", "invoice.payment_failed"]);
const PLANS = new Set(["PLUS", "PREMIUM", "ULTRA"]);
const precedence = { "invoice.payment_failed": 10, "invoice.paid": 20, "invoice.payment_succeeded": 20, "customer.subscription.created": 30, "customer.subscription.updated": 40, "customer.subscription.deleted": 50 };
const text = (value) => String(value && typeof value === "object" ? value.id || "" : value || "").trim();
const date = (seconds) => Number(seconds) > 0 ? new Date(Number(seconds) * 1000) : null;

function references(event) {
  const object = event.data.object;
  const subscription = event.type.startsWith("customer.subscription.") ? object : null;
  const details = object?.parent?.subscription_details || object?.subscription_details || {};
  const metadata = subscription?.metadata || details.metadata || {};
  return { object, subscription, metadata, userId: text(metadata.pawnloopUserId), subscriptionId: text(subscription?.id || object?.subscription || details.subscription), customerId: text(subscription?.customer || object?.customer), invoiceId: event.type.startsWith("invoice.") ? text(object?.id) : "" };
}

function isNewer(event, existing) {
  if (existing.stripeEventId === event.id) return false;
  if (!existing.stripeEventCreatedAt) return true;
  const difference = date(event.created).getTime() - new Date(existing.stripeEventCreatedAt).getTime();
  if (difference) return difference > 0;
  const precedenceDifference = (precedence[event.type] || 0) - (precedence[existing.stripeEventType] || 0);
  if (precedenceDifference) return precedenceDifference > 0;
  return event.id > String(existing.stripeEventId || "");
}

async function audit(prismaClient, event, subscription, applied, reasonCode) {
  if (!prismaClient.buyerSubscriptionEvent) return null;
  return prismaClient.buyerSubscriptionEvent.create({ data: {
    stripeEventId: event.id,
    buyerSubscriptionId: subscription.id,
    userId: subscription.userId,
    eventType: event.type,
    stripeEventCreatedAt: date(event.created) || new Date(),
    normalizedStatus: subscription.status,
    plan: subscription.plan,
    billingInterval: subscription.billingInterval || null,
    applied,
    reasonCode,
  } });
}

export async function syncBuyerSubscriptionEvent({ event, prismaClient = prisma }) {
  if (!event?.id || !TYPES.has(event.type)) return { handled: false, applied: false };
  if (prismaClient.buyerSubscriptionEvent) {
    const duplicateAudit = await prismaClient.buyerSubscriptionEvent.findUnique({ where: { stripeEventId: event.id } });
    if (duplicateAudit) return { handled: true, applied: duplicateAudit.applied, duplicate: true, audit: duplicateAudit };
  }
  const ref = references(event);
  let existing = ref.subscriptionId ? await prismaClient.buyerSubscription.findUnique({ where: { stripeSubscriptionId: ref.subscriptionId } }) : null;
  if (!existing && ref.userId && String(ref.metadata.billingProfile || "").toUpperCase() === "BUYER") existing = await prismaClient.buyerSubscription.findUnique({ where: { userId: ref.userId } });
  if (!existing && ref.userId && ref.subscription && String(ref.metadata.billingProfile || "").toUpperCase() === "BUYER") {
    const planCode = String(ref.metadata.planCode || "").toUpperCase();
    if (!PLANS.has(planCode)) return { handled: true, applied: false };
    existing = await prismaClient.buyerSubscription.create({ data: {
      userId: ref.userId, plan: planCode, status: "UNKNOWN",
      stripeCustomerId: ref.customerId || null,
      stripeSubscriptionId: ref.subscriptionId || null,
    } });
  }
  if (!existing) return { handled: false, applied: false };
  if (!isNewer(event, existing)) {
    const duplicate = existing.stripeEventId === event.id;
    const auditRow = await audit(prismaClient, event, existing, false, duplicate ? "DUPLICATE" : "OUT_OF_ORDER");
    return { handled: true, applied: false, duplicate, audit: auditRow };
  }
  const item = ref.subscription?.items?.data?.[0] || ref.object?.lines?.data?.[0] || null;
  const interval = String(item?.price?.recurring?.interval || "").toLowerCase();
  const planCode = String(ref.metadata.planCode || item?.price?.metadata?.planCode || "").toUpperCase();
  let status = ref.subscription ? mapStripeSubscriptionStatus(ref.subscription.status) : existing.status;
  if (event.type === "invoice.payment_failed") status = "PAST_DUE";
  if (["invoice.paid", "invoice.payment_succeeded"].includes(event.type) && existing.status !== "CANCELED") status = "ACTIVE";
  if (event.type === "customer.subscription.deleted") status = "CANCELED";
  const updated = await prismaClient.buyerSubscription.update({ where: { id: existing.id }, data: {
    ...(PLANS.has(planCode) ? { plan: planCode } : {}), status,
    ...(interval === "month" || interval === "year" ? { billingInterval: interval === "year" ? "YEAR" : "MONTH" } : {}),
    currentPeriodStart: date(ref.subscription?.current_period_start || item?.period?.start) || existing.currentPeriodStart,
    currentPeriodEnd: date(ref.subscription?.current_period_end || item?.period?.end) || existing.currentPeriodEnd,
    cancelAtPeriodEnd: ref.subscription ? Boolean(ref.subscription.cancel_at_period_end) : existing.cancelAtPeriodEnd,
    stripeCustomerId: ref.customerId || existing.stripeCustomerId,
    stripeSubscriptionId: ref.subscriptionId || existing.stripeSubscriptionId,
    stripePriceId: text(item?.price) || existing.stripePriceId,
    stripeLatestInvoiceId: ref.invoiceId || existing.stripeLatestInvoiceId,
    stripeEventCreatedAt: date(event.created), stripeEventId: event.id, stripeEventType: event.type,
    ...(status === "CANCELED" ? { canceledAt: date(ref.subscription?.canceled_at) || date(event.created) } : {}),
  } });
  const auditRow = await audit(prismaClient, event, updated, true, "APPLIED");
  return { handled: true, applied: true, subscription: updated, audit: auditRow };
}
