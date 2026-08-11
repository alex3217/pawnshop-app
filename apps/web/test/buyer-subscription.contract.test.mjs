import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../src/pages/BuyerSubscriptionPage.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../src/styles/buyer-subscription.css", import.meta.url), "utf8");
const api = await readFile(new URL("../src/services/buyerPlans.ts", import.meta.url), "utf8");

test("buyer membership renders lifecycle, interval, renewal, portal, and truthful plan actions", () => {
  assert.match(page, />Buyer Membership</);
  assert.match(page, /Billing interval/);
  assert.match(page, /Cancellation date/);
  assert.match(page, /Renewal date/);
  assert.match(page, /Manage billing/);
  for (const state of ["Current plan", "Upgrade", "Downgrade", "Temporarily unavailable"]) assert.match(page, new RegExp(state));
});

test("buyer plan readiness and price use the same interval-specific public API entry", () => {
  assert.match(page, /interval === "YEAR" \? plan\.yearlyPriceCents : plan\.monthlyPriceCents/);
  assert.match(page, /interval === "YEAR" \? plan\.yearlyCheckoutConfigured : plan\.monthlyCheckoutConfigured/);
  assert.match(page, /Displayed catalog prices are for comparison and cannot be purchased yet/);
  assert.doesNotMatch(api, /requiredEnvironmentVariable|stripeMonthlyPriceId|stripeYearlyPriceId/);
  assert.match(api, /unavailableIntervals: \("MONTH" \| "YEAR"\)\[\]/);
});

test("buyer plan cards are compact, responsive, and accessible near 390px", () => {
  assert.match(css, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /@media \(max-width:1050px\)[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media \(max-width:600px\)[\s\S]*grid-template-columns:1fr/);
  assert.match(css, /buyer-plan-action:disabled[\s\S]*color:#fff/);
  assert.match(css, /focus-visible|focus-within/);
  assert.match(page, /role="radiogroup"/);
  assert.match(page, /aria-disabled=/);
});

test("buyer membership uses explicit billing capability and renders implemented usage and every benefit", () => {
  assert.match(page, /subscription\.canManageBilling/);
  assert.match(page, /subscription\.canManageSubscription/);
  assert.doesNotMatch(page, /storedPlan !== "FREE"/);
  assert.match(page, /Usage and limits/);
  assert.match(page, /Saved searches/);
  assert.match(page, /Watchlist items/);
  assert.match(page, /plan\.features\.map/);
  assert.doesNotMatch(page, /features\.slice/);
});
