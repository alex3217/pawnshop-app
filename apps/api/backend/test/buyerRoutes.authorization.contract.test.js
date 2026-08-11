import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const stripeRoutes = await readFile(new URL("../src/routes/stripe.routes.js", import.meta.url), "utf8");
const planRoutes = await readFile(new URL("../src/routes/buyerPlans.routes.js", import.meta.url), "utf8");
const planController = await readFile(new URL("../src/controllers/buyerPlans.controller.js", import.meta.url), "utf8");
const stripeController = await readFile(new URL("../src/controllers/stripe.controller.js", import.meta.url), "utf8");
const savedSearchesController = await readFile(new URL("../src/controllers/savedSearches.controller.js", import.meta.url), "utf8");
const watchlistController = await readFile(new URL("../src/controllers/watchlist.controller.js", import.meta.url), "utf8");

test("buyer checkout requires auth and intentionally permits only consumer and admin", () => { assert.match(stripeRoutes, /"\/checkout\/buyer-subscription"[\s\S]*authRequired[\s\S]*requireRole\("CONSUMER", "ADMIN"\)/); assert.doesNotMatch(stripeRoutes.match(/"\/checkout\/buyer-subscription"[\s\S]{0,250}/)?.[0] || "", /OWNER|SUPER_ADMIN/); });
test("billing portal remains limited to authenticated supported roles", () => assert.match(stripeRoutes, /"\/billing-portal", authRequired, requireRole\("CONSUMER", "OWNER"\)/));
test("direct consumer buyer-plan mutation stays forbidden", () => { assert.match(planRoutes, /router\.put\([\s\S]*requireRole\(\.\.\.BUYER_ROLES\)/); assert.match(planController, /req\?\.user\?\.role === "CONSUMER"/); assert.match(planRoutes, /router\.delete\([\s\S]*requireRole\(\.\.\.ADMIN_ROLES\)/); });
test("public plan catalog exposes checkout availability without Stripe Price IDs", () => {
  assert.match(planController, /monthlyCheckoutConfigured,[\s\S]*yearlyCheckoutConfigured,/);
  assert.match(planController, /stripeMonthlyPriceId, stripeYearlyPriceId, \.\.\.plan/);
  assert.doesNotMatch(planController, /requiredEnvironmentVariable|STRIPE_PRICE_BUYER/);
});
test("buyer checkout return paths are server-created from the validated request origin", () => {
  const checkoutController = stripeController.match(/export async function createBuyerSubscriptionCheckoutSession[\s\S]*?^}/m)?.[0] || "";
  assert.match(checkoutController, /req\.get\?\.\("origin"\)/);
  assert.match(checkoutController, /validateStripeConnectReturnUrl/);
  assert.doesNotMatch(checkoutController, /req\.body\?\.(?:successUrl|cancelUrl)/);
});
test("cancel and resume are authenticated buyer operations without a path user id", () => {
  for (const path of ["cancel-at-period-end", "resume"]) {
    const route = planRoutes.match(new RegExp(`"/buyer-plans/mine/${path}"[\\s\\S]{0,220}`))?.[0] || "";
    assert.match(route, /authRequired/);
    assert.match(route, /requireRole\(\.\.\.BUYER_ROLES\)/);
    assert.doesNotMatch(route, /:userId/);
  }
});
test("buyer resource creation enforces subscription capacity before writing", () => {
  const savedSearchCreate = savedSearchesController.match(/export async function addSavedSearch[\s\S]*?^}/m)?.[0] || "";
  const watchlistCreate = watchlistController.match(/export async function addToWatchlist[\s\S]*?^}/m)?.[0] || "";
  assert.match(savedSearchCreate, /createSavedSearchWithinCapacity\(\{ userId, query \}\)/);
  assert.match(watchlistCreate, /addWatchlistItemWithinCapacity\(\{[\s\S]*userId,[\s\S]*itemId/);
});
