import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { getStripe } from "../lib/stripe.js";
import {
  assertStripePriceMatchesBillingConfig,
} from "./stripeSubscriptionPrice.service.js";
import { getBuyerPlanCatalog } from "./platformPricingCatalog.service.js";

const INTERVALS = new Set(["MONTH", "YEAR"]);
const PAID_PLANS = new Set(["PLUS", "PREMIUM", "ULTRA"]);
const REPLACEMENT_CHECKOUT_STATUSES = new Set(["CANCELED", "INCOMPLETE_EXPIRED"]);

function httpError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

export function normalizeBuyerCheckoutInput(input) {
  const planCode = String(input?.planCode || "").trim().toUpperCase();
  const rawInterval = String(input?.billingInterval || "MONTH").trim().toUpperCase();
  const billingInterval = rawInterval === "MONTHLY" ? "MONTH" : rawInterval === "YEARLY" || rawInterval === "ANNUAL" ? "YEAR" : rawInterval;
  if (planCode === "FREE") throw httpError("Free does not require Stripe Checkout.", 400, "BUYER_FREE_CHECKOUT_NOT_ALLOWED");
  if (!PAID_PLANS.has(planCode)) throw httpError("Invalid paid buyer plan.", 400, "BUYER_PLAN_INVALID");
  if (!INTERVALS.has(billingInterval)) throw httpError("Invalid billing interval.", 400, "BUYER_BILLING_INTERVAL_INVALID");
  return { planCode, billingInterval };
}

export function deriveBuyerCheckoutIdempotencyKey({ userId, planCode, billingInterval, incomingKey }) {
  const normalizedKey = String(incomingKey || "").trim();
  if (normalizedKey.length < 16 || normalizedKey.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(normalizedKey)) {
    throw httpError("A valid Idempotency-Key header is required.", 400, "BUYER_IDEMPOTENCY_KEY_INVALID");
  }
  const digest = crypto.createHash("sha256").update(normalizedKey).digest("hex").slice(0, 32);
  return `buyer-subscription:${userId}:${planCode}:${billingInterval}:${digest}`;
}

export function selectBuyerCheckoutConfig(catalog, planCode, billingInterval) {
  const plan = catalog.find((entry) => entry.code === planCode);
  if (!plan) throw httpError("Buyer plan is unavailable.", 400, "BUYER_PLAN_NOT_FOUND");
  const yearly = billingInterval === "YEAR";
  const amountCents = Number(yearly ? plan.yearlyPriceCents : plan.monthlyPriceCents);
  const priceId = String(yearly ? plan.stripeYearlyPriceId || "" : plan.stripeMonthlyPriceId || "").trim();
  if (!priceId) throw httpError("This plan is not configured for Stripe billing.", 503, "BUYER_STRIPE_PRICE_NOT_CONFIGURED");
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw httpError("This plan has invalid pricing.", 503, "BUYER_PLAN_AMOUNT_INVALID");
  return {
    planCode,
    billingInterval,
    amountCents,
    priceId,
    currency: String(plan.currency || "USD").toLowerCase(),
    expectedStripeInterval: yearly ? "year" : "month",
  };
}

async function ensureBuyerCustomer(stripe, user, prismaClient) {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name,
    metadata: { pawnloopUserId: user.id, billingProfile: "BUYER" },
  }, { idempotencyKey: `pawnloop-buyer-customer-${user.id}` });
  await prismaClient.user.update({ where: { id: user.id }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

export async function createBuyerSubscriptionCheckout({
  userId,
  input,
  successUrl,
  cancelUrl,
  requestId,
  prismaClient = prisma,
  stripeClient = null,
  stripeSecretKey = process.env.STRIPE_SECRET_KEY,
  catalog = null,
}) {
  const { planCode, billingInterval } = normalizeBuyerCheckoutInput(input);
  const user = await prismaClient.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, stripeCustomerId: true },
  });
  if (!user) throw httpError("Buyer not found.", 404, "BUYER_NOT_FOUND");
  const existingSubscription = await prismaClient.buyerSubscription.findUnique({
    where: { userId },
    select: { status: true, stripeSubscriptionId: true },
  });
  if (
    existingSubscription?.stripeSubscriptionId
    && !REPLACEMENT_CHECKOUT_STATUSES.has(existingSubscription.status)
  ) {
    throw httpError(
      "An existing paid buyer subscription must be changed through subscription management.",
      409,
      "BUYER_SUBSCRIPTION_ALREADY_EXISTS",
    );
  }
  const planCatalog = catalog || await getBuyerPlanCatalog();
  const config = selectBuyerCheckoutConfig(planCatalog, planCode, billingInterval);
  const stripe = stripeClient || getStripe();
  const price = await stripe.prices.retrieve(config.priceId);
  assertStripePriceMatchesBillingConfig(price, config, stripeSecretKey);
  const customerId = await ensureBuyerCustomer(stripe, user, prismaClient);
  const idempotencyKey = deriveBuyerCheckoutIdempotencyKey({ userId, planCode, billingInterval, incomingKey: requestId });
  const metadata = { pawnloopUserId: userId, planCode, billingInterval, billingProfile: "BUYER" };
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: userId,
    allow_promotion_codes: true,
    line_items: [{ price: config.priceId, quantity: 1 }],
    metadata,
    subscription_data: { metadata },
  }, { idempotencyKey });
  if (!session?.url) {
    throw httpError("Stripe Checkout did not return a redirect URL.", 502, "BUYER_CHECKOUT_URL_MISSING");
  }
  return { url: session.url, sessionId: session.id };
}
