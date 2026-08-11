import { PAID_BUYER_PLAN_CODES } from "./buyerPlans.js";

export const BUYER_BILLING_INTERVALS = Object.freeze(["MONTH", "YEAR"]);

export const BUYER_STRIPE_PRICE_ENV_MAP = Object.freeze({
  PLUS: Object.freeze({
    MONTH: "STRIPE_PRICE_BUYER_PLUS_MONTHLY",
    YEAR: "STRIPE_PRICE_BUYER_PLUS_YEARLY",
  }),
  PREMIUM: Object.freeze({
    MONTH: "STRIPE_PRICE_BUYER_PREMIUM_MONTHLY",
    YEAR: "STRIPE_PRICE_BUYER_PREMIUM_YEARLY",
  }),
  ULTRA: Object.freeze({
    MONTH: "STRIPE_PRICE_BUYER_ULTRA_MONTHLY",
    YEAR: "STRIPE_PRICE_BUYER_ULTRA_YEARLY",
  }),
});

const text = (value) => String(value || "").trim();

export function getBuyerStripePriceEnvName(planCode, billingInterval) {
  const plan = text(planCode).toUpperCase();
  const interval = text(billingInterval).toUpperCase();
  const envName = BUYER_STRIPE_PRICE_ENV_MAP[plan]?.[interval];
  if (!envName) throw new Error(`Unsupported buyer Stripe offering: ${plan || "(empty)"}/${interval || "(empty)"}`);
  return envName;
}

export function readBuyerStripePriceConfiguration(env = process.env) {
  return Object.fromEntries(PAID_BUYER_PLAN_CODES.map((planCode) => [
    planCode,
    Object.fromEntries(BUYER_BILLING_INTERVALS.map((interval) => {
      const envName = getBuyerStripePriceEnvName(planCode, interval);
      const value = text(env[envName]);
      return [interval, value && !/replace_me/i.test(value) ? value : null];
    })),
  ]));
}

export function validateBuyerStripePriceConfiguration(env = process.env) {
  const configuration = readBuyerStripePriceConfiguration(env);
  const missingEnvironmentVariables = [];
  for (const planCode of PAID_BUYER_PLAN_CODES) {
    for (const interval of BUYER_BILLING_INTERVALS) {
      if (!configuration[planCode][interval]) {
        missingEnvironmentVariables.push(getBuyerStripePriceEnvName(planCode, interval));
      }
    }
  }
  return { valid: missingEnvironmentVariables.length === 0, missingEnvironmentVariables };
}
