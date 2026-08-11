import assert from "node:assert/strict";
import test from "node:test";
import { getBuyerStripePriceEnvName, readBuyerStripePriceConfiguration, validateBuyerStripePriceConfiguration } from "../src/config/buyerPlanStripePrices.js";
import { serializeBuyerPlanCatalog } from "../src/controllers/buyerPlans.controller.js";

const configured = {
  STRIPE_PRICE_BUYER_PLUS_MONTHLY: "price_plus_month",
  STRIPE_PRICE_BUYER_PLUS_YEARLY: "price_plus_year",
  STRIPE_PRICE_BUYER_PREMIUM_MONTHLY: "price_premium_month",
  STRIPE_PRICE_BUYER_PREMIUM_YEARLY: "price_premium_year",
  STRIPE_PRICE_BUYER_ULTRA_MONTHLY: "price_ultra_month",
  STRIPE_PRICE_BUYER_ULTRA_YEARLY: "price_ultra_year",
};

test("buyer Stripe configuration maps every paid plan and interval", () => {
  assert.equal(getBuyerStripePriceEnvName("PLUS", "MONTH"), "STRIPE_PRICE_BUYER_PLUS_MONTHLY");
  assert.equal(getBuyerStripePriceEnvName("ULTRA", "YEAR"), "STRIPE_PRICE_BUYER_ULTRA_YEARLY");
  assert.deepEqual(readBuyerStripePriceConfiguration(configured).PREMIUM, { MONTH: "price_premium_month", YEAR: "price_premium_year" });
  assert.deepEqual(validateBuyerStripePriceConfiguration(configured), { valid: true, missingEnvironmentVariables: [] });
});

test("buyer Stripe configuration fails closed and reports exact missing names", () => {
  const result = validateBuyerStripePriceConfiguration({ ...configured, STRIPE_PRICE_BUYER_PREMIUM_YEARLY: "" });
  assert.equal(result.valid, false);
  assert.deepEqual(result.missingEnvironmentVariables, ["STRIPE_PRICE_BUYER_PREMIUM_YEARLY"]);
});

test("legacy single-price variables cannot make an interval ready", () => {
  const result = readBuyerStripePriceConfiguration({ STRIPE_PRICE_BUYER_PLUS: "price_legacy" });
  assert.equal(result.PLUS.MONTH, null);
  assert.equal(result.PLUS.YEAR, null);
});

test("public catalog keeps price, interval, and readiness aligned without exposing Price IDs", () => {
  const [plan] = serializeBuyerPlanCatalog([{
    code: "PLUS", label: "Plus", isFree: false,
    monthlyPriceCents: 699, yearlyPriceCents: 6900,
    stripeMonthlyPriceId: "price_plus_month", stripeYearlyPriceId: null,
  }]);
  assert.equal(plan.monthlyPriceCents, 699);
  assert.equal(plan.monthlyCheckoutConfigured, true);
  assert.equal(plan.yearlyPriceCents, 6900);
  assert.equal(plan.yearlyCheckoutConfigured, false);
  assert.deepEqual(plan.unavailableIntervals, ["YEAR"]);
  assert.equal("stripeMonthlyPriceId" in plan, false);
  assert.equal("stripeYearlyPriceId" in plan, false);
  assert.equal("requiredEnvironmentVariable" in JSON.parse(JSON.stringify(plan)), false);
  assert.doesNotMatch(JSON.stringify(plan), /price_plus|STRIPE_PRICE/);
});
