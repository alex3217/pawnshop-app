import { prisma } from "../lib/prisma.js";
import { createSettlementCreditLedgerEntry } from "../services/payouts/settlementLedger.service.js";
import { assertPaidSellerPlanCode } from "../config/sellerPlans.js";
import {
  createValidatedSellerSubscriptionCheckoutSession,
  normalizeSellerBillingInterval,
} from "../services/stripeSubscriptionPrice.service.js";

import {
  finalizeMarketplacePaymentSucceeded,
  recordMarketplacePaymentFailed,
} from "../services/marketplaceTransactionPaymentWebhook.service.js";
import {
  getStripe,
  getStripeCurrency,
  getStripePublishableKey,
  mapStripeSubscriptionStatus,
  toAmountCents,
} from "../lib/stripe.js";
import {
  syncStripeConnectAccountUpdated,
} from "../services/stripeConnect.service.js";
import { syncPayoutTransferEvent } from "../services/payouts/payoutRequest.service.js";
import { syncStripeConnectedAccountPayoutEvent } from "../services/payouts/stripeConnectedAccountPayout.service.js";
import {
  requestStripeRefund,
  syncStripeDisputeEvent,
  syncStripeRefundEvent,
} from "../services/stripeRefundDispute.service.js";
import {
  syncStripeSubscriptionEvent,
} from "../services/stripeSubscriptionWebhook.service.js";
import { createBuyerSubscriptionCheckout } from "../services/buyerSubscriptionCheckout.service.js";
import { syncBuyerSubscriptionEvent } from "../services/buyerSubscriptionWebhook.service.js";
import { validateStripeConnectReturnUrl } from "../services/stripeConnect.service.js";

const PI_REUSABLE_STATUSES = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "processing",
]);

function errorResponse(res, err, fallback = "Internal Server Error") {
  const status =
    Number(err?.statusCode) ||
    Number(err?.status) ||
    500;

  const message = err?.message || fallback;

  return res.status(status).json({
    error: message,
    ...(err?.code ? { code: err.code } : {}),
    ...(err?.details
      ? { details: err.details }
      : {}),
  });
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
  return ["ADMIN", "SUPER_ADMIN"].includes(String(user.role || "").toUpperCase());
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
    const planCode =
      assertPaidSellerPlanCode(
        req?.body?.planCode
      );

    const billingInterval =
      normalizeSellerBillingInterval(
        req?.body?.billingInterval || "MONTH"
      );

    const requestedSuccessUrl = validateStripeConnectReturnUrl(
      req?.body?.successUrl,
      "successUrl"
    );

    const requestedCancelUrl = validateStripeConnectReturnUrl(
      req?.body?.cancelUrl,
      "cancelUrl"
    );
    const successUrl = requestedSuccessUrl;
    const cancelUrl = requestedCancelUrl;
    const requestId = normalizeId(req.headers["idempotency-key"]);
    if (!requestId) throw createHttpError("A valid Idempotency-Key header is required.", 400);

    if (!shopId || !planCode) {
      return res.status(400).json({
        error:
          "Missing shopId, planCode, successUrl, or cancelUrl",
      });
    }

    const shop =
      await ensureShopAccess(req, shopId);

    const stripe = getStripe();

    const stripeCustomerId =
      await ensureStripeCustomerForShop(
        stripe,
        shop
      );

    const {
      session,
      config: priceConfig,
    } =
      await createValidatedSellerSubscriptionCheckoutSession({
        stripe,
        planCode,
        billingInterval,
        checkoutParams: {
          mode: "subscription",
          customer: stripeCustomerId,
          success_url: successUrl,
          cancel_url: cancelUrl,
          allow_promotion_codes: true,
          billing_address_collection: "auto",
          client_reference_id: shop.id,
          metadata: {
            shopId: shop.id,
            planCode,
            billingInterval,
            ownerId: shop.ownerId,
          },
          subscription_data: {
            metadata: {
              shopId: shop.id,
              planCode,
              billingInterval,
              ownerId: shop.ownerId,
            },
          },
        },
        checkoutOptions: { idempotencyKey: `seller-subscription:${shop.id}:${planCode}:${billingInterval}:${requestId}` },
      });

    return res.status(201).json({
      success: true,
      url: session.url,
      sessionId: session.id,
      customerId: stripeCustomerId,
      planCode,
      billingInterval,
      priceId: priceConfig.priceId,
      amountCents:
        priceConfig.amountCents,
      currency: priceConfig.currency,
    });
  } catch (err) {
    return errorResponse(
      res,
      err,
      "Failed to create subscription checkout session"
    );
  }
}

async function updateSellerCancellation(req, res, cancelAtPeriodEnd) {
  try {
    const shop = await ensureShopAccess(req, req.params?.id);
    if (!shop.stripeSubscriptionId) throw createHttpError("No Stripe paid subscription is configured for this shop.", 409);
    const stripe = getStripe();
    const subscription = await stripe.subscriptions.update(shop.stripeSubscriptionId, { cancel_at_period_end: cancelAtPeriodEnd });
    if (normalizeId(subscription?.id) !== normalizeId(shop.stripeSubscriptionId) || (shop.stripeCustomerId && normalizeId(subscription?.customer) !== normalizeId(shop.stripeCustomerId))) throw createHttpError("Stripe returned a subscription that does not belong to this shop.", 409);
    await prisma.pawnShop.update({ where: { id: shop.id }, data: { cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end), subscriptionCurrentPeriodEnd: subscription.current_period_end ? new Date(Number(subscription.current_period_end) * 1000) : shop.subscriptionCurrentPeriodEnd } });
    return res.json({ success: true, pendingWebhookSync: true, shopId: shop.id, cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end), currentPeriodEnd: subscription.current_period_end ? new Date(Number(subscription.current_period_end) * 1000).toISOString() : shop.subscriptionCurrentPeriodEnd, effectivePlan: shop.subscriptionPlan });
  } catch (err) {
    return errorResponse(res, err, cancelAtPeriodEnd ? "Failed to schedule subscription cancellation" : "Failed to resume subscription");
  }
}

export async function cancelSellerSubscriptionAtPeriodEnd(req, res) { return updateSellerCancellation(req, res, true); }
export async function resumeSellerSubscription(req, res) { return updateSellerCancellation(req, res, false); }

export async function createBuyerSubscriptionCheckoutSession(req, res) {
  try {
    const userId = getRequestUserId(req);
    const requestedSuccessUrl = validateStripeConnectReturnUrl(req.body?.successUrl, "successUrl");
    const requestedCancelUrl = validateStripeConnectReturnUrl(req.body?.cancelUrl, "cancelUrl");
    const successOrigin = new URL(requestedSuccessUrl).origin;
    const cancelOrigin = new URL(requestedCancelUrl).origin;
    const successUrl = `${successOrigin}/buyer/subscription?checkout=success`;
    const cancelUrl = `${cancelOrigin}/buyer/subscription?checkout=canceled`;
    const requestId = req.headers["idempotency-key"];
    if (typeof requestId !== "string") throw createHttpError("A valid Idempotency-Key header is required.", 400);
    const result = await createBuyerSubscriptionCheckout({
      userId,
      input: req.body,
      successUrl,
      cancelUrl,
      requestId,
    });
    return res.status(201).json({ success: true, ...result });
  } catch (err) {
    return errorResponse(res, err, "Failed to create buyer subscription checkout session");
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
        offerId: String(settlement.offerId || ""),
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

export async function createStripeRefund(req, res) {
  try {
    const requesterId = getRequestUserId(req);
    const result = await requestStripeRefund({
      settlementId: normalizeId(req?.body?.settlementId) || undefined,
      marketplaceTransactionId:
        normalizeId(req?.body?.marketplaceTransactionId) || undefined,
      amountCents: req?.body?.amountCents,
      reason: req?.body?.reason,
      requesterId,
      requestKey: req.headers["idempotency-key"],
    });
    return res.status(result.created ? 201 : 200).json({
      success: true,
      created: result.created,
      refund: result.refund,
    });
  } catch (err) {
    return errorResponse(res, err, "Failed to create Stripe refund");
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
      case "refund.created":
      case "refund.updated":
      case "refund.failed": {
        await syncStripeRefundEvent({
          stripeRefund: event.data.object,
          eventType: event.type,
          stripeEventId: event.id,
          prismaClient: prisma,
        });
        break;
      }
      case "charge.dispute.created":
      case "charge.dispute.updated":
      case "charge.dispute.funds_withdrawn":
      case "charge.dispute.funds_reinstated":
      case "charge.dispute.closed": {
        const dispute = event.data.object;
        if (!dispute.payment_intent && dispute.charge) {
          const charge = await stripe.charges.retrieve(
            typeof dispute.charge === "object" ? dispute.charge.id : dispute.charge,
          );
          dispute.payment_intent = charge?.payment_intent || null;
        }
        await syncStripeDisputeEvent({
          dispute,
          eventType: event.type,
          stripeEventId: event.id,
          prismaClient: prisma,
        });
        break;
      }
      case "transfer.created":
      case "transfer.updated":
      case "transfer.reversed": {
        await syncPayoutTransferEvent({
          transfer: event.data.object,
          eventType: event.type,
          prismaClient: prisma,
        });
        break;
      }
      case "account.updated": {
        await syncStripeConnectAccountUpdated({
          account: event.data.object,
          prismaClient: prisma,
        });
        break;
      }

      case "checkout.session.completed": {
        const session = event.data.object;
        if (session?.mode === "setup" && session?.setup_intent) {
          const setupIntent = await stripe.setupIntents.retrieve(String(session.setup_intent));
          const customerId = session?.customer ? String(session.customer) : null;
          const consentId = normalizeId(session?.metadata?.paymentMethodConsentId);
          const pending = consentId ? await prisma.paymentMethodConsent.findUnique({ where: { id: consentId } }) : null;
          const setupCustomerId = setupIntent?.customer ? String(setupIntent.customer) : null;
          const expectedShopId = normalizeId(session?.metadata?.pawnShopId);
          const expectedUserId = normalizeId(session?.metadata?.pawnloopUserId);
          if (!pending || pending.stripeCustomerId !== customerId || setupCustomerId !== customerId || pending.userId !== expectedUserId || normalizeId(pending.shopId) !== expectedShopId || (pending.stripeCheckoutSessionId && pending.stripeCheckoutSessionId !== String(session.id))) throw new Error("Stripe setup consent ownership verification failed");
          if (pending.status !== "PENDING") {
            if (pending.stripeCheckoutSessionId === String(session.id) && pending.stripeSetupIntentId === String(setupIntent.id)) break;
            throw new Error("Stripe setup consent was already finalized by a different event");
          }
          if (setupIntent.payment_method) {
            const method = await stripe.paymentMethods.retrieve(String(setupIntent.payment_method));
            if (String(method?.customer || "") !== customerId) throw new Error("Stripe setup payment method ownership verification failed");
          }
          await prisma.paymentMethodConsent.updateMany({ where: { id: pending.id, status: "PENDING" }, data: { stripeCheckoutSessionId: String(session.id), stripeSetupIntentId: String(setupIntent.id), stripeMandateId: setupIntent.mandate ? String(setupIntent.mandate) : null, paymentMethodId: setupIntent.payment_method ? String(setupIntent.payment_method) : null, status: setupIntent.status === "succeeded" ? "ACTIVE" : "FAILED" } });
          break;
        }
        const shopId = normalizeId(session?.metadata?.shopId);
        const planCode = normalizePlanCode(session?.metadata?.planCode);
        const stripeCustomerId = session?.customer ? String(session.customer) : null;
        const stripeSubscriptionId = session?.subscription
          ? String(session.subscription)
          : null;

        if (shopId && planCode && stripeCustomerId && stripeSubscriptionId) {
          assertPaidSellerPlanCode(planCode);
          const shop = await prisma.pawnShop.findUnique({
            where: { id: shopId },
            select: { id: true, ownerId: true, isDeleted: true, stripeCustomerId: true },
          });
          const ownerId = normalizeId(session?.metadata?.ownerId);
          if (!shop || shop.isDeleted || !ownerId || ownerId !== normalizeId(shop.ownerId)) {
            throw new Error("Stripe seller Checkout metadata does not identify an authorized shop owner");
          }
          if (shop.stripeCustomerId && normalizeId(shop.stripeCustomerId) !== stripeCustomerId) {
            throw new Error("Stripe seller Checkout customer does not belong to the selected shop");
          }

          const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
          const subscriptionMetadata = subscription?.metadata || {};
          if (
            normalizeId(subscription?.customer) !== stripeCustomerId ||
            normalizeId(subscriptionMetadata.shopId) !== shopId ||
            normalizeId(subscriptionMetadata.ownerId) !== ownerId ||
            normalizePlanCode(subscriptionMetadata.planCode) !== planCode
          ) {
            throw new Error("Stripe seller subscription ownership verification failed");
          }

          await prisma.pawnShop.update({
            where: { id: shopId },
            data: {
              subscriptionPlan: planCode,
              subscriptionStatus: mapStripeSubscriptionStatus(subscription?.status),
              stripeCustomerId,
              stripeSubscriptionId,
              subscriptionCurrentPeriodEnd: unixToIsoOrNull(subscription?.current_period_end),
              cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
            },
          });
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "invoice.paid":
      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const buyerResult = await syncBuyerSubscriptionEvent({ event, prismaClient: prisma });
        if (buyerResult.handled) break;
        await syncStripeSubscriptionEvent({ event, prismaClient: prisma });
        break;
      }

      case "payment_intent.succeeded": {
        const pi = event.data.object;

        const marketplaceTransactionId =
          normalizeId(
            pi?.metadata
              ?.marketplaceTransactionId
          );

        if (marketplaceTransactionId) {
          await finalizeMarketplacePaymentSucceeded({
            paymentIntent: pi,
            prismaClient: prisma,
          });

          break;
        }

        const settlementId =
          normalizeId(
            pi?.metadata?.settlementId
          );

        if (settlementId) {
          await prisma.$transaction(async (tx) => {
            const chargedAt = new Date();

            await tx.settlement.update({
              where: { id: settlementId },
              data: {
                status: "CHARGED",
                stripePaymentIntent: String(pi.id),
                chargedAt,
                failedAt: null,
                failureMessage: null,
              },
            });

            await createSettlementCreditLedgerEntry({
              settlementId,
              availableAt: chargedAt,
              prismaClient: tx,
            });
          });
        }

        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object;

        const marketplaceTransactionId =
          normalizeId(
            pi?.metadata
              ?.marketplaceTransactionId
          );

        if (marketplaceTransactionId) {
          await recordMarketplacePaymentFailed({
            paymentIntent: pi,
            prismaClient: prisma,
          });

          break;
        }

        const settlementId =
          normalizeId(
            pi?.metadata?.settlementId
          );

        if (settlementId) {
          await prisma.settlement.update({
            where: { id: settlementId },
            data: {
              status: "FAILED",
              stripePaymentIntent: String(pi.id),
              failedAt: new Date(),
              failureMessage:
                pi?.last_payment_error?.message ||
                pi?.last_payment_error?.decline_code ||
                "Payment failed",
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

export async function handleStripeConnectWebhook(req, res) {
  try {
    const stripe = getStripe();
    const signature = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

    if (!signature || !webhookSecret || webhookSecret.includes("REPLACE_ME")) {
      return res.status(400).json({ error: "Stripe Connect webhook is not configured" });
    }

    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(req.body || "");
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    const connectedPayoutTypes = new Set([
      "payout.created",
      "payout.updated",
      "payout.paid",
      "payout.failed",
    ]);

    if (connectedPayoutTypes.has(event.type)) {
      await syncStripeConnectedAccountPayoutEvent({ event, prismaClient: prisma });
    }

    return res.json({ received: true });
  } catch (err) {
    console.error("[stripe.connect-webhook] error", err);
    return res.status(400).json({ error: err?.message || "Connect webhook failed" });
  }
}
