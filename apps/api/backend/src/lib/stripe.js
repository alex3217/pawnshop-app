import Stripe from "stripe";
import {
  PAID_SELLER_PLAN_CODES,
  SELLER_PLAN_CODES,
  isPaidSellerPlanCode,
} from "../config/sellerPlans.js";

const STRIPE_API_VERSION = "2025-01-27.acacia";

const SELLER_PLAN_PRICE_ENV_MAP = Object.freeze({
  [SELLER_PLAN_CODES.PRO]: "STRIPE_PRICE_PRO",
  [SELLER_PLAN_CODES.PREMIUM]: "STRIPE_PRICE_PREMIUM",
  [SELLER_PLAN_CODES.ULTRA]: "STRIPE_PRICE_ULTRA",
});

const BUYER_PLAN_PRICE_ENV_MAP = Object.freeze({
  PLUS: "STRIPE_PRICE_BUYER_PLUS",
  PREMIUM: "STRIPE_PRICE_BUYER_PREMIUM",
  ULTRA: "STRIPE_PRICE_BUYER_ULTRA",
});

let stripeInstance = null;
let stripeInstanceKey = null;

function readEnv(name) {
  return String(process.env[name] || "").trim();
}

function isPlaceholder(value) {
  return !value || value.includes("REPLACE_ME");
}

function requireEnv(name) {
  const value = readEnv(name);

  if (isPlaceholder(value)) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}

function normalizePlanCode(planCode) {
  return String(planCode || "").trim().toUpperCase();
}

function getSellerPlanPriceEnvName(planCode) {
  const normalized = normalizePlanCode(planCode);

  if (!isPaidSellerPlanCode(normalized)) {
    throw new Error(`Unsupported seller paid plan: ${normalized || "(empty)"}`);
  }

  const envName = SELLER_PLAN_PRICE_ENV_MAP[normalized];

  if (!envName) {
    throw new Error(
      `Missing Stripe price env mapping for seller paid plan: ${normalized}`
    );
  }

  return envName;
}

function getBuyerPlanPriceEnvName(planCode) {
  const normalized = normalizePlanCode(planCode);
  const envName = BUYER_PLAN_PRICE_ENV_MAP[normalized];

  if (!envName) {
    throw new Error(`Unsupported buyer paid plan: ${normalized || "(empty)"}`);
  }

  return envName;
}

export function isStripeConfigured() {
  try {
    requireEnv("STRIPE_SECRET_KEY");
    requireEnv("STRIPE_PUBLISHABLE_KEY");
    return true;
  } catch {
    return false;
  }
}

export function isStripeWebhookConfigured() {
  try {
    requireEnv("STRIPE_WEBHOOK_SECRET");
    return true;
  } catch {
    return false;
  }
}

export function isStripePlanConfigured(planCode) {
  try {
    requireEnv(getSellerPlanPriceEnvName(planCode));
    return true;
  } catch {
    return false;
  }
}

export function isStripeBuyerPlanConfigured(planCode) {
  try {
    requireEnv(getBuyerPlanPriceEnvName(planCode));
    return true;
  } catch {
    return false;
  }
}

export function getStripe() {
  const secretKey = requireEnv("STRIPE_SECRET_KEY");

  if (!stripeInstance || stripeInstanceKey !== secretKey) {
    stripeInstance = new Stripe(secretKey, {
      apiVersion: STRIPE_API_VERSION,
    });
    stripeInstanceKey = secretKey;
  }

  return stripeInstance;
}

export function getStripeCurrency() {
  return readEnv("STRIPE_DEFAULT_CURRENCY").toLowerCase() || "usd";
}

export function getStripePublishableKey() {
  return requireEnv("STRIPE_PUBLISHABLE_KEY");
}

export function getSupportedPaidPlanCodes() {
  return [...PAID_SELLER_PLAN_CODES];
}

export function getSupportedPaidBuyerPlanCodes() {
  return Object.keys(BUYER_PLAN_PRICE_ENV_MAP);
}

export function getSubscriptionPriceId(planCode) {
  return requireEnv(getSellerPlanPriceEnvName(planCode));
}

export function getBuyerSubscriptionPriceId(planCode) {
  return requireEnv(getBuyerPlanPriceEnvName(planCode));
}

export function toAmountCents(amount) {
  const parsed = Number(amount);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid amount: ${amount}`);
  }

  return Math.round(parsed * 100);
}

export function mapStripeSubscriptionStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();

  switch (normalized) {
    case "trialing":
      return "TRIALING";

    case "active":
      return "ACTIVE";

    case "past_due":
      return "PAST_DUE";

    case "incomplete":
    case "paused":
      return "INCOMPLETE";

    case "incomplete_expired":
    case "canceled":
    case "cancelled":
    case "unpaid":
      return "CANCELED";

    default:
      return "ACTIVE";
  }
}