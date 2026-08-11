import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { SELLER_PLANS } from "../src/config/sellerPlans.js";

test("authoritative seller prices and FREE/trial limits match billing policy", () => {
  assert.deepEqual(Object.keys(SELLER_PLANS), ["FREE", "PRO", "PREMIUM", "ULTRA"]);
  assert.deepEqual([SELLER_PLANS.FREE.monthlyPriceCents, SELLER_PLANS.PRO.monthlyPriceCents, SELLER_PLANS.PREMIUM.monthlyPriceCents, SELLER_PLANS.ULTRA.monthlyPriceCents], [0, 4900, 14900, 29900]);
  assert.deepEqual([SELLER_PLANS.FREE.yearlyPriceCents, SELLER_PLANS.PRO.yearlyPriceCents, SELLER_PLANS.PREMIUM.yearlyPriceCents, SELLER_PLANS.ULTRA.yearlyPriceCents], [0, 49000, 149000, 299000]);
  assert.equal(SELLER_PLANS.FREE.maxActiveListings, 20);
  assert.equal(SELLER_PLANS.FREE.trialMaxActiveListings, 50);
});

test("seller-plan mutations are SUPER_ADMIN protected, impact-aware, concurrent-safe, assigned-plan safe, transactional, and audited", async () => {
  const routes = await readFile(new URL("../src/routes/superAdmin.routes.js", import.meta.url), "utf8");
  const controller = await readFile(new URL("../src/controllers/superAdmin.controller.js", import.meta.url), "utf8");
  const auth = routes.indexOf("router.use(authRequired, requireRole(...SUPER_ADMIN_ROLES))");
  assert.ok(routes.indexOf("/plans/seller/:code/impact") > auth);
  assert.ok(routes.lastIndexOf("/plans/seller/:code/validate-stripe") > auth);
  assert.ok(routes.indexOf("/plans/seller/:code\"") > auth);
  const section = controller.slice(controller.indexOf("export async function previewSuperAdminSellerPlanImpact"), controller.indexOf("export async function getSuperAdminBuyerPlans"));
  assert.match(section, /affectedShops/);
  assert.match(section, /expectedVersion/);
  assert.match(section, /grandfatherExisting/);
  assert.match(section, /scheduledMigrationAt/);
  assert.match(section, /prisma\.\$transaction/);
  assert.match(section, /UPDATE_SELLER_PLAN/);
  assert.match(controller, /function validateStripeReference/);
  assert.match(controller, /must be a valid/);
  assert.match(section, /Active paid seller plans require monthly and yearly Stripe Price IDs/);
  assert.match(section, /stripeReferencesConfigured/);
  assert.match(section, /Future seller-plan scheduling is not enabled\. No changes were made\./);
  assert.match(section, /validateSellerPlanStripeReferences/);
  assert.match(section, /configuredProductId/);
});
