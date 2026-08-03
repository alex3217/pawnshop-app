import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { mapStripeSubscriptionStatus } from "../lib/stripe.js";
import { isPaidSellerPlanCode, SELLER_PLANS } from "../config/sellerPlans.js";

export const STRIPE_SUBSCRIPTION_WEBHOOK_TYPES = new Set([
  "invoice.paid",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

const STATE_SELECT = Object.freeze({
  id: true,
  ownerId: true,
  subscriptionPlan: true,
  subscriptionStatus: true,
  subscriptionBillingInterval: true,
  subscriptionCurrentPeriodEnd: true,
  subscriptionStartedAt: true,
  subscriptionCanceledAt: true,
  cancelAtPeriodEnd: true,
  stripeCustomerId: true,
  stripeSubscriptionId: true,
  stripePriceId: true,
  stripeLatestInvoiceId: true,
  stripeSubscriptionEventCreatedAt: true,
  stripeSubscriptionEventId: true,
  stripeSubscriptionEventType: true,
});

const EVENT_PRECEDENCE = Object.freeze({
  "invoice.payment_failed": 10,
  "invoice.paid": 20,
  "invoice.payment_succeeded": 20,
  "customer.subscription.created": 30,
  "customer.subscription.updated": 40,
  "customer.subscription.deleted": 50,
});

function text(value) {
  if (value && typeof value === "object") return String(value.id || "").trim();
  return String(value || "").trim();
}

function unixDate(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000)
    : null;
}

function jsonValue(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function subscriptionObject(event) {
  return event.type.startsWith("customer.subscription.")
    ? event.data.object
    : null;
}

function invoiceObject(event) {
  return event.type.startsWith("invoice.") ? event.data.object : null;
}

function eventReferences(event) {
  const subscription = subscriptionObject(event);
  const invoice = invoiceObject(event);
  const invoiceSubscriptionDetails =
    invoice?.parent?.subscription_details || invoice?.subscription_details || {};
  const metadata = subscription?.metadata || invoiceSubscriptionDetails.metadata || {};
  return {
    metadata,
    shopId: text(metadata.shopId),
    stripeCustomerId: text(subscription?.customer || invoice?.customer),
    stripeSubscriptionId: text(
      subscription?.id ||
      invoice?.subscription ||
      invoiceSubscriptionDetails.subscription,
    ),
    stripeInvoiceId: text(invoice?.id),
  };
}

async function findShop(client, references) {
  if (references.stripeSubscriptionId) {
    const shop = await client.pawnShop.findFirst({
      where: {
        stripeSubscriptionId: references.stripeSubscriptionId,
        isDeleted: false,
      },
      select: STATE_SELECT,
    });
    if (shop) return shop;
  }
  if (references.shopId) {
    const shop = await client.pawnShop.findFirst({
      where: { id: references.shopId, isDeleted: false },
      select: STATE_SELECT,
    });
    if (shop) return shop;
  }
  if (references.stripeCustomerId) {
    const shops = await client.pawnShop.findMany({
      where: { stripeCustomerId: references.stripeCustomerId, isDeleted: false },
      take: 2,
      select: STATE_SELECT,
    });
    if (shops.length === 1) return shops[0];
  }
  return null;
}

function lineDetails(invoice, metadata = {}) {
  const lines = Array.isArray(invoice?.lines?.data) ? invoice.lines.data : [];
  const line =
    lines.find((candidate) => text(candidate?.subscription)) ||
    lines.find((candidate) => candidate?.price) ||
    lines[0] ||
    null;
  const recurringInterval = String(line?.price?.recurring?.interval || "").toLowerCase();
  return {
    priceId: text(line?.price),
    periodStart: unixDate(line?.period?.start),
    periodEnd: unixDate(line?.period?.end),
    billingInterval:
      recurringInterval === "year"
        ? "YEAR"
        : recurringInterval === "month"
          ? "MONTH"
          : null,
    planCode: String(
      metadata.planCode ||
      line?.price?.metadata?.planCode ||
      line?.metadata?.planCode ||
      "",
    ).trim().toUpperCase(),
  };
}

function subscriptionDetails(subscription) {
  const item = subscription?.items?.data?.[0] || null;
  const recurringInterval = String(item?.price?.recurring?.interval || "").toLowerCase();
  return {
    priceId: text(item?.price),
    periodEnd: unixDate(subscription?.current_period_end || item?.current_period_end),
    billingInterval:
      recurringInterval === "year"
        ? "YEAR"
        : recurringInterval === "month"
          ? "MONTH"
          : null,
    planCode: String(
      subscription?.metadata?.planCode ||
      item?.price?.metadata?.planCode ||
      "",
    ).trim().toUpperCase(),
  };
}

function eventPatch(event, shop, references) {
  const subscription = subscriptionObject(event);
  const invoice = invoiceObject(event);
  const details = subscription
    ? subscriptionDetails(subscription)
    : lineDetails(invoice, references.metadata);
  const patch = {
    stripeCustomerId: references.stripeCustomerId || shop.stripeCustomerId,
    stripeSubscriptionId:
      references.stripeSubscriptionId || shop.stripeSubscriptionId,
    ...(references.stripeInvoiceId
      ? { stripeLatestInvoiceId: references.stripeInvoiceId }
      : {}),
    ...(details.priceId ? { stripePriceId: details.priceId } : {}),
    ...(details.billingInterval
      ? { subscriptionBillingInterval: details.billingInterval }
      : {}),
    ...(details.periodEnd
      ? { subscriptionCurrentPeriodEnd: details.periodEnd }
      : {}),
    ...(isPaidSellerPlanCode(details.planCode)
      ? { subscriptionPlan: details.planCode }
      : {}),
  };

  if (event.type === "invoice.paid" || event.type === "invoice.payment_succeeded") {
    patch.subscriptionStatus = "ACTIVE";
    patch.subscriptionCanceledAt = null;
    if (!shop.subscriptionStartedAt) {
      patch.subscriptionStartedAt = details.periodStart || unixDate(event.created) || new Date();
    }
  } else if (event.type === "invoice.payment_failed") {
    patch.subscriptionStatus = "PAST_DUE";
  } else {
    patch.subscriptionStatus = mapStripeSubscriptionStatus(subscription?.status);
    patch.cancelAtPeriodEnd = Boolean(subscription?.cancel_at_period_end);
    if (!shop.subscriptionStartedAt) {
      patch.subscriptionStartedAt = unixDate(subscription?.start_date);
    }
    if (
      event.type === "customer.subscription.deleted" ||
      patch.subscriptionStatus === "CANCELED"
    ) {
      patch.subscriptionStatus = "CANCELED";
      patch.subscriptionCanceledAt =
        unixDate(subscription?.canceled_at || subscription?.ended_at) ||
        unixDate(event.created) ||
        new Date();
      patch.cancelAtPeriodEnd = false;
    } else {
      patch.subscriptionCanceledAt = null;
    }
  }
  return patch;
}

function stateSnapshot(shop) {
  return {
    plan: shop.subscriptionPlan,
    status: shop.subscriptionStatus,
    billingInterval: shop.subscriptionBillingInterval,
    currentPeriodEnd: shop.subscriptionCurrentPeriodEnd,
    startedAt: shop.subscriptionStartedAt,
    canceledAt: shop.subscriptionCanceledAt,
    cancelAtPeriodEnd: shop.cancelAtPeriodEnd,
    stripeCustomerId: shop.stripeCustomerId,
    stripeSubscriptionId: shop.stripeSubscriptionId,
    stripePriceId: shop.stripePriceId,
    stripeLatestInvoiceId: shop.stripeLatestInvoiceId,
  };
}

function isNewer(eventCreatedAt, event, shop) {
  const lastAt = shop.stripeSubscriptionEventCreatedAt;
  if (!lastAt) return true;
  const timeDifference = eventCreatedAt.getTime() - new Date(lastAt).getTime();
  if (timeDifference !== 0) return timeDifference > 0;
  const precedenceDifference =
    (EVENT_PRECEDENCE[event.type] || 0) -
    (EVENT_PRECEDENCE[shop.stripeSubscriptionEventType] || 0);
  if (precedenceDifference !== 0) return precedenceDifference > 0;
  return event.id > String(shop.stripeSubscriptionEventId || "");
}

function canApplyToState(event, shop) {
  if (!event.type.startsWith("invoice.")) return true;
  return String(shop.subscriptionStatus || "").toUpperCase() !== "CANCELED";
}

function notificationFor(event, priorStatus, resultingStatus) {
  if (event.type === "invoice.payment_failed") {
    return {
      type: "SUBSCRIPTION_PAYMENT_FAILED",
      title: "Subscription payment failed",
      message:
        "We could not process your subscription payment. Update your billing method to avoid losing paid-plan access.",
    };
  }
  if (
    ["invoice.paid", "invoice.payment_succeeded"].includes(event.type) &&
    ["PAST_DUE", "INCOMPLETE"].includes(priorStatus)
  ) {
    return {
      type: "SUBSCRIPTION_PAYMENT_RECOVERED",
      title: "Subscription payment recovered",
      message: "Your subscription payment succeeded and paid-plan access is active.",
    };
  }
  if (event.type === "customer.subscription.deleted" || resultingStatus === "CANCELED") {
    return {
      type: "SUBSCRIPTION_CANCELED",
      title: "Subscription canceled",
      message: "Your paid subscription has ended and your shop now uses Free plan entitlements.",
    };
  }
  return null;
}

function isUniqueError(error) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function syncStripeSubscriptionEvent({
  event,
  prismaClient = prisma,
}) {
  if (!event?.id || !STRIPE_SUBSCRIPTION_WEBHOOK_TYPES.has(event.type)) {
    return { handled: false, applied: false };
  }

  const existing = await prismaClient.stripeSubscriptionBillingEvent.findUnique({
    where: { stripeEventId: event.id },
  });
  if (existing) return { handled: true, applied: existing.applied, duplicate: true };

  const references = eventReferences(event);
  const eventCreatedAt = unixDate(event.created) || new Date();

  try {
    return await prismaClient.$transaction(async (tx) => {
      const shop = await findShop(tx, references);
      if (!shop) {
        const error = new Error("Stripe subscription event could not be matched to a shop.");
        error.code = "STRIPE_SUBSCRIPTION_SHOP_NOT_FOUND";
        throw error;
      }

      if (typeof tx.$queryRaw === "function") {
        await tx.$queryRaw`SELECT "id" FROM "PawnShop" WHERE "id" = ${shop.id} FOR UPDATE`;
      }
      const lockedShop =
        (await tx.pawnShop.findUnique({ where: { id: shop.id }, select: STATE_SELECT })) ||
        shop;
      const previousState = stateSnapshot(lockedShop);
      const applied =
        isNewer(eventCreatedAt, event, lockedShop) &&
        canApplyToState(event, lockedShop);
      let resultingShop = lockedShop;

      if (applied) {
        const patch = eventPatch(event, lockedShop, references);
        resultingShop = await tx.pawnShop.update({
          where: { id: lockedShop.id },
          data: {
            ...patch,
            stripeSubscriptionEventCreatedAt: eventCreatedAt,
            stripeSubscriptionEventId: event.id,
            stripeSubscriptionEventType: event.type,
          },
          select: STATE_SELECT,
        });
        const notification = notificationFor(
          event,
          lockedShop.subscriptionStatus,
          resultingShop.subscriptionStatus,
        );
        if (notification) {
          await tx.notification.createMany({
            data: [{
              userId: lockedShop.ownerId,
              ...notification,
              actionUrl: "/owner/settings?section=subscription",
              dedupeKey: `stripe-subscription:${event.id}:${notification.type}`,
            }],
            skipDuplicates: true,
          });
        }
        if (["CANCELED", "INCOMPLETE"].includes(resultingShop.subscriptionStatus) && tx.item?.findMany) {
          const freeLimit = SELLER_PLANS.FREE.maxActiveListings;
          const activeItems = await tx.item.findMany({
            where: { pawnShopId: lockedShop.id, isDeleted: false, status: { in: ["AVAILABLE", "PENDING"] } },
            orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
            select: { id: true },
          });
          const excessIds = activeItems.slice(freeLimit).map((item) => item.id);
          if (excessIds.length) {
            await tx.item.updateMany({ where: { id: { in: excessIds } }, data: { status: "DRAFT" } });
            await tx.notification.createMany({ data: [{ userId: lockedShop.ownerId, type: "SELLER_LISTING_LIMIT_RECONCILED", title: "Choose your active products", message: `${excessIds.length} products were preserved as drafts because the Free plan allows ${freeLimit} active products.`, actionUrl: "/owner/items", dedupeKey: `seller-listing-reconcile:${event.id}` }], skipDuplicates: true });
          }
        }
      }

      const audit = await tx.stripeSubscriptionBillingEvent.create({
        data: {
          stripeEventId: event.id,
          eventType: event.type,
          stripeEventCreatedAt: eventCreatedAt,
          shopId: lockedShop.id,
          ownerUserId: lockedShop.ownerId,
          stripeCustomerId: references.stripeCustomerId || null,
          stripeSubscriptionId: references.stripeSubscriptionId || null,
          stripeInvoiceId: references.stripeInvoiceId || null,
          applied,
          previousState: jsonValue(previousState),
          resultingState: jsonValue(stateSnapshot(resultingShop)),
          payload: jsonValue(event.data.object),
        },
      });
      return { handled: true, applied, duplicate: false, audit };
    });
  } catch (error) {
    if (!isUniqueError(error)) throw error;
    const audit = await prismaClient.stripeSubscriptionBillingEvent.findUnique({
      where: { stripeEventId: event.id },
    });
    if (!audit) throw error;
    return { handled: true, applied: audit.applied, duplicate: true };
  }
}
