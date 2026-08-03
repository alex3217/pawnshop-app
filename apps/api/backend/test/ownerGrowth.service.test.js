import assert from "node:assert/strict";
import test from "node:test";
import { assertQrCampaignCapacity, buildEntitlements } from "../src/services/sellerPlan.service.js";
import { calculateResourceUsage, calculateShopHealth, SHOP_HEALTH_CALCULATION_VERSION } from "../src/services/businessGrowth.service.js";

const shop = { id: "shop-1", name: "Test Shop", ownerId: "owner-1", subscriptionPlan: "PREMIUM", subscriptionStatus: "ACTIVE", subscriptionCurrentPeriodEnd: null, cancelAtPeriodEnd: false };
const premium = { code: "PREMIUM", label: "Premium", isPaid: true, maxActiveListings: null, trialMaxActiveListings: 50, maxLocations: 5, maxStaffUsers: 15, canCreateAuctions: true, canFeatureListings: true, analyticsLevel: "advanced", commissionBps: 600 };

test("PREMIUM remains the internal seller code and displays as Plus", () => {
  const result = buildEntitlements(shop, 12, premium);
  assert.equal(result.subscription.storedPlan, "PREMIUM");
  assert.equal(result.subscription.effectivePlan, "PREMIUM");
  assert.equal(result.subscription.label, "Plus");
  assert.equal(result.billing.commissionBps, 600);
});

test("seller entitlement resolver represents implemented and planned capabilities", () => {
  const result = buildEntitlements(shop, 12, premium);
  assert.equal(result.limits.maxLocations, 5);
  assert.equal(result.limits.maxStaffUsers, 15);
  assert.equal(result.limits.qrCampaignLimit, null);
  assert.equal(result.features.businessGrowthLevel, "advanced");
  assert.ok(result.implementation.enforced.includes("qrCampaigns"));
  assert.ok(result.implementation.planned.includes("benchmarking"));
});

test("usage calculations are explicit for finite and unlimited resources", () => {
  assert.deepEqual(calculateResourceUsage(8, 10), { used: 8, limit: 10, unlimited: false, remaining: 2, atLimit: false, nearLimit: true });
  assert.deepEqual(calculateResourceUsage(20, null), { used: 20, limit: null, unlimited: true, remaining: null, atLimit: false, nearLimit: false });
});

test("QR campaign limit rejects capacity overflow", () => {
  const free = buildEntitlements({ ...shop, subscriptionPlan: "FREE" }, 1, { code: "FREE", label: "Free", maxActiveListings: 20, trialMaxActiveListings: 50, maxLocations: 1, maxStaffUsers: 1, maxItemPhotos: 8, maxAiListingGenerationsPerMonth: 3, commissionBps: 1200 });
  assert.equal(free.limits.qrCampaignLimit, 1);
  assert.throws(() => assertQrCampaignCapacity(free, 1), (error) => error.code === "PLAN_QR_CAMPAIGN_LIMIT_REACHED");
});

test("Shop Health is deterministic, explainable, and versioned", () => {
  const input = { description: "A complete storefront", address: "1 Main", city: "Austin", state: "TX", zip: "78701", addressComplete: true, hours: "9-5", phone: "555-0100", slug: "test", activeListings: 2, withoutPhotos: 1, shortDescriptions: 0, staleListings: 0, pendingOffers: 1, defaultCampaign: true, activeCampaigns: 1, placementCampaigns: 0, subscriptionUsable: true, subscriptionStatus: "ACTIVE", onboardingCompletedAt: new Date(), stripeReady: true };
  const first = calculateShopHealth(input); const second = calculateShopHealth(input);
  assert.deepEqual(first, second);
  assert.equal(first.maximum, 100);
  assert.equal(first.calculationVersion, SHOP_HEALTH_CALCULATION_VERSION);
  assert.ok(first.score >= 0 && first.score <= 100);
  assert.ok(first.missingItems.some((item) => item.check === "photos"));
  assert.ok(first.recommendedActions.includes("Add photos to every active listing."));
});
