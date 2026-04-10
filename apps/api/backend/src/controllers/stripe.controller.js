import { prisma } from "../lib/prisma.js";
import { assertPaidSellerPlanCode } from "../config/sellerPlans.js";
import {
  getStripe,
  getStripeCurrency,
  getSubscriptionPriceId,
  getStripePublishableKey,
  mapStripeSubscriptionStatus,
  toAmountCents,
} from "../lib/stripe.js";

const PI_REUSABLE_STATUSES = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "processing",
]);

function errorResponse(res, err, fallback = "Internal Server Error") {
  const status = Number(err?.statusCode) || Number(err?.status) || 500;
  const message = err?.message || fallback;
  return res.status(status).json({ error: message });
}

function createHttpError(message, statusCode = 500, details = undefined) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (details !== undefined) err.details = details;
  return err;
}

function normalizeId(value) {
  return String(value || "").trim();
}

function normalizePlanCode(value) {
  return String(value || "").trim().toUpperCase();
}

function getRequestUser(req) {
  const user = req?.user;
  if (!user || typeof user !== "object") {
    throw createHttpError("Unauthorized", 401);
  }
  return user;
}

function getRequestUserId(req) {
  const user = getRequestUser(req);
  return String(user.sub || user.id || "").trim();
}

function isAdminRequest(req) {
  const user = getRequestUser(req);
  return String(user.role || "").toUpperCase() === "ADMIN";
}

function assertAbsoluteHttpUrl(value, fieldName) {
  const raw = String(value || "").trim();
  if (!raw) {
    throw createHttpError(`Missing ${fieldName}`, 400);
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw createHttpError(`Invalid ${fieldName}`, 400);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw createHttpError(`${fieldName} must use http or https`, 400);
  }

  return parsed.toString();
}

function unixToIsoOrNull(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

function isFinalPaymentIntentStatus(status) {
  return ["succeeded", "canceled"].includes(String(status || ""));
}

function mapShopSubscriptionUpdateFromStripeSubscription(
  subscription,
  fallbackPlanCode
) {
  const metadata = subscription?.metadata || {};
  const normalizedPlan = normalizePlanCode(metadata.planCode || fallbackPlanCode);

  return {
    subscriptionPlan: normalizedPlan || undefined,
    subscriptionStatus: mapStripeSubscriptionStatus(subscription?.status),
    stripeSubscriptionId: subscription?.id ? String(subscription.id) : null,
    stripeCustomerId: subscription?.customer ? String(subscription.customer) : null,
    subscriptionCurrentPeriodEnd: unixToIsoOrNull(
      subscription?.current_period_end
    ),
    cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
  };
}

async function ensureShopAccess(req, shopId) {
  const safeShopId = normalizeId(shopId);
  if (!safeShopId) {
    throw createHttpError("Missing shop id", 400);
  }

  const shop = await prisma.pawnShop.findUnique({
    where: { id: safeShopId },
    select: {
      id: true,
      name: true,
      ownerId: true,
      isDeleted: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      subscriptionPlan: true,
      subscriptionStatus: true,
      cancelAtPeriodEnd: true,
      subscriptionCurrentPeriodEnd: true,
    },
  });

  if (!shop || shop.isDeleted) {
    throw createHttpError("Shop not found", 404);
  }

  const requesterId = getRequestUserId(req);
  if (!isAdminRequest(req) && shop.ownerId !== requesterId) {
    throw createHttpError("Forbidden", 403);
  }

  return shop;
}

async function ensureSettlementAccess(req, settlementId) {
  const safeSettlementId = normalizeId(settlementId);
  if (!safeSettlementId) {
    throw createHttpError("Missing settlement id", 400);
  }

  const settlement = await prisma.settlement.findUnique({
    where: { id: safeSettlementId },
  });

  if (!settlement) {
    throw createHttpError("Settlement not found", 404);
  }

  const requesterId = getRequestUserId(req);
  if (!isAdminRequest(req) && settlement.winnerUserId !== requesterId) {
    throw createHttpError("Forbidden", 403);
  }

  return settlement;
}

async function ensureStripeCustomerForShop(stripe, shop) {
  if (shop.stripeCustomerId) {
    return String(shop.stripeCustomerId);
  }

  const customer = await stripe.customers.create({
    metadata: {
      shopId: String(shop.id),
      ownerId: String(shop.ownerId),
    },
    name: shop.name || "PawnShop Seller",
  });

  const stripeCustomerId = String(customer.id);

  await prisma.pawnShop.update({
    where: { id: shop.id },
    data: { stripeCustomerId },
  });

  return stripeCustomerId;
}

async function tryReuseSettlementPaymentIntent(stripe, settlement) {
  const existingPaymentIntentId = normalizeId(settlement?.stripePaymentIntent);
  if (!existingPaymentIntentId) return null;

  try {
    const existingIntent = await stripe.paymentIntents.retrieve(
      existingPaymentIntentId
    );

    if (!existingIntent) return null;

    if (existingIntent.status === "succeeded") {
      await prisma.settlement.update({
        where: { id: settlement.id },
        data: {
          status: "CHARGED",
          stripePaymentIntent: String(existingIntent.id),
        },
      });

      return {
        reused: true,
        finalized: true,
        paymentIntent: existingIntent,
      };
    }

    if (PI_REUSABLE_STATUSES.has(existingIntent.status)) {
      return {
        reused: true,
        finalized: false,
        paymentIntent: existingIntent,
      };
    }

    if (isFinalPaymentIntentStatus(existingIntent.status)) {
      return null;
    }

    return {
      reused: true,
      finalized: false,
      paymentIntent: existingIntent,
    };
  } catch {
    return null;
  }
}

export async function getStripeConfig(_req, res) {
  try {
    return res.json({
      success: true,
      publishableKey: getStripePublishableKey(),
      currency: getStripeCurrency(),
    });
  } catch (err) {
    return errorResponse(res, err, "Failed to load Stripe config");
  }
}

export async function createSubscriptionCheckoutSession(req, res) {
  try {
    getRequestUser(req);

    const shopId = normalizeId(req?.body?.shopId);
    const planCode = assertPaidSellerPlanCode(req?.body?.planCode);
    const successUrl = assertAbsoluteHttpUrl(
      req?.body?.successUrl,
      "successUrl"
    );
    const cancelUrl = assertAbsoluteHttpUrl(req?.body?.cancelUrl, "cancelUrl");

    if (!shopId || !planCode) {
      return res.status(400).json({
        error: "Missing shopId, planCode, successUrl, or cancelUrl",
      });
    }

    const shop = await ensureShopAccess(req, shopId);
    const stripe = getStripe();
    const stripeCustomerId = await ensureStripeCustomerForShop(stripe, shop);
    const priceId = getSubscriptionPriceId(planCode);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      client_reference_id: shop.id,
      metadata: {
        shopId: shop.id,
        planCode,
        ownerId: shop.ownerId,
      },
      subscription_data: {
        metadata: {
          shopId: shop.id,
          planCode,
          ownerId: shop.ownerId,
        },
      },
    });

    return res.status(201).json({
      success: true,
      url: session.url,
      sessionId: session.id,
      customerId: stripeCustomerId,
      planCode,
    });
  } catch (err) {
    return errorResponse(
      res,
      err,
      "Failed to create subscription checkout session"
    );
  }
}

export async function createSettlementPaymentIntent(req, res) {
  try {
    getRequestUser(req);

    const settlementId = normalizeId(req?.params?.id);
    const settlement = await ensureSettlementAccess(req, settlementId);

    if (String(settlement.status || "").toUpperCase() === "CHARGED") {
      return res.status(400).json({ error: "Settlement already charged" });
    }

    const stripe = getStripe();
    const reused = await tryReuseSettlementPaymentIntent(stripe, settlement);

    if (reused?.paymentIntent) {
      const intent = reused.paymentIntent;

      if (reused.finalized) {
        return res.status(200).json({
          success: true,
          paymentIntentId: intent.id,
          clientSecret: intent.client_secret || null,
          amount: intent.amount,
          currency: intent.currency,
          reused: true,
          settlementStatus: "CHARGED",
        });
      }

      return res.status(200).json({
        success: true,
        paymentIntentId: intent.id,
        clientSecret: intent.client_secret || null,
        amount: intent.amount,
        currency: intent.currency,
        reused: true,
      });
    }

    const amount = toAmountCents(settlement.finalPrice);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw createHttpError("Settlement amount must be greater than zero", 400);
    }

    const intent = await stripe.paymentIntents.create({
      amount,
      currency: getStripeCurrency(),
      automatic_payment_methods: { enabled: true },
      metadata: {
        settlementId: settlement.id,
        auctionId: String(settlement.auctionId || ""),
        winnerUserId: String(settlement.winnerUserId || ""),
      },
    });

    await prisma.settlement.update({
      where: { id: settlement.id },
      data: { stripePaymentIntent: intent.id },
    });

    return res.status(201).json({
      success: true,
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      amount,
      currency: getStripeCurrency(),
      reused: false,
    });
  } catch (err) {
    return errorResponse(res, err, "Failed to create settlement payment intent");
  }
}

export async function handleStripeWebhook(req, res) {
  try {
    const stripe = getStripe();
    const signature = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!signature || !webhookSecret || webhookSecret.includes("REPLACE_ME")) {
      return res.status(400).json({ error: "Stripe webhook is not configured" });
    }

    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(req.body || "");
    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret
    );

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const shopId = normalizeId(session?.metadata?.shopId);
        const planCode = normalizePlanCode(session?.metadata?.planCode);
        const stripeCustomerId = session?.customer ? String(session.customer) : null;
        const stripeSubscriptionId = session?.subscription
          ? String(session.subscription)
          : null;

        if (shopId && planCode) {
          let subscriptionStatus = "ACTIVE";
          let subscriptionCurrentPeriodEnd = null;
          let cancelAtPeriodEnd = false;

          if (stripeSubscriptionId) {
            try {
              const subscription = await stripe.subscriptions.retrieve(
                stripeSubscriptionId
              );
              subscriptionStatus = mapStripeSubscriptionStatus(subscription?.status);
              subscriptionCurrentPeriodEnd = unixToIsoOrNull(
                subscription?.current_period_end
              );
              cancelAtPeriodEnd = Boolean(subscription?.cancel_at_period_end);
            } catch (err) {
              console.warn(
                "[stripe.webhook] failed to retrieve subscription after checkout.session.completed",
                {
                  stripeSubscriptionId,
                  message: err?.message || String(err),
                }
              );
            }
          }

          await prisma.pawnShop.update({
            where: { id: shopId },
            data: {
              subscriptionPlan: planCode,
              subscriptionStatus,
              stripeCustomerId,
              stripeSubscriptionId,
              subscriptionCurrentPeriodEnd,
              cancelAtPeriodEnd,
            },
          });
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const stripeSubscriptionId = normalizeId(subscription?.id);
        const shopIdFromMetadata = normalizeId(subscription?.metadata?.shopId);
        const planFromMetadata = normalizePlanCode(subscription?.metadata?.planCode);
        const patch = mapShopSubscriptionUpdateFromStripeSubscription(
          subscription,
          planFromMetadata
        );

        if (stripeSubscriptionId) {
          const updated = await prisma.pawnShop.updateMany({
            where: { stripeSubscriptionId },
            data: patch,
          });

          if (updated.count > 0) {
            break;
          }
        }

        if (shopIdFromMetadata) {
          await prisma.pawnShop.updateMany({
            where: { id: shopIdFromMetadata },
            data: patch,
          });
        }
        break;
      }

      case "payment_intent.succeeded": {
        const pi = event.data.object;
        const settlementId = normalizeId(pi?.metadata?.settlementId);

        if (settlementId) {
          await prisma.settlement.update({
            where: { id: settlementId },
            data: {
              status: "CHARGED",
              stripePaymentIntent: String(pi.id),
            },
          });
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        const settlementId = normalizeId(pi?.metadata?.settlementId);

        if (settlementId) {
          await prisma.settlement.update({
            where: { id: settlementId },
            data: {
              status: "FAILED",
              stripePaymentIntent: String(pi.id),
            },
          });
        }
        break;
      }

      default:
        break;
    }

    return res.json({ received: true });
  } catch (err) {
    console.error("[stripe.webhook] error", err);
    return res.status(400).json({ error: err?.message || "Webhook failed" });
  }
}