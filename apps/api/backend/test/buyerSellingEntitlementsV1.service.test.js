import assert from "node:assert/strict";
import test from "node:test";
import { BUYER_PLANS } from "../src/config/buyerPlans.js";
import { assertBuyerSellingCapacity, buildBuyerEntitlements } from "../src/services/buyerEntitlements.service.js";

const expected = {
  FREE: [5, 20, 3, 10, 6, 25],
  PLUS: [20, 75, 15, 50, 12, 50],
  PREMIUM: [50, 200, 50, 200, 20, 100],
  ULTRA: [null, null, 150, 500, 30, 250],
};

test("every buyer plan exposes V1 selling and pawning limits", () => {
  for (const [code, values] of Object.entries(expected)) {
    const plan = BUYER_PLANS[code];
    assert.deepEqual([plan.maxActiveShopRequests, plan.maxMonthlyShopRequests, plan.maxActiveMarketplaceListings, plan.maxMonthlyMarketplaceListings, plan.maxSellItemPhotos, plan.maxSellRadiusMiles], values);
  }
});

test("Ultra shop requests remain unlimited while marketplace capacity is finite", () => {
  const result = buildBuyerEntitlements({ subscription: { plan: "ULTRA", status: "ACTIVE" }, counts: { activeShopRequests: 999, monthlyShopRequests: 999, activeMarketplaceListings: 999, monthlyMarketplaceListings: 999 } });
  assert.equal(result.usage.activeShopRequests.atLimit, false);
  assert.equal(result.usage.monthlyMarketplaceListings.limit, 500);
  assert.equal(result.usage.monthlyMarketplaceListings.atLimit, true);
});

test("an unusable paid plan falls back to Free selling limits", () => {
  const result = buildBuyerEntitlements({ subscription: { plan: "PREMIUM", status: "CANCELED" } });
  assert.equal(result.subscription.effectivePlan, "FREE");
  assert.equal(result.entitlements.maxActiveShopRequests, 5);
  assert.equal(result.coreCommerce.shopSubmissions, true);
});

function capacityClient({ activeShopRequests = 0, monthlyShopRequests = 0, activeMarketplaceListings = 0, monthlyMarketplaceListings = 0 } = {}) {
  let submissionCall = 0;
  let listingCall = 0;
  return {
    buyerSubscription: { findUnique: async () => null }, savedSearch: { count: async () => 0 }, watchlist: { count: async () => 0 },
    buyerItemSubmission: { count: async () => [activeShopRequests, monthlyShopRequests][submissionCall++] ?? 0 },
    marketplaceListing: { count: async () => [activeMarketplaceListings, monthlyMarketplaceListings][listingCall++] ?? 0 },
  };
}

test("photo and radius limits return the required error response details", async () => {
  for (const input of [{ photoCount: 7 }, { radiusMiles: 26 }]) {
    await assert.rejects(assertBuyerSellingCapacity("buyer", input, capacityClient()), (error) => {
      assert.equal(error.statusCode, 409); assert.equal(error.code, "BUYER_PLAN_LIMIT_REACHED");
      assert.deepEqual(Object.keys(error.details).sort(), ["displayName", "limit", "planCode", "remaining", "resource", "upgradePath", "used"].sort());
      return true;
    });
  }
});

test("shop, marketplace, and BOTH capacities are enforced before writes", async () => {
  await assert.rejects(assertBuyerSellingCapacity("buyer", { resources: ["activeShopRequests"] }, capacityClient({ activeShopRequests: 5 })), { code: "BUYER_PLAN_LIMIT_REACHED" });
  await assert.rejects(assertBuyerSellingCapacity("buyer", { resources: ["monthlyMarketplaceListings"] }, capacityClient({ monthlyMarketplaceListings: 10 })), { code: "BUYER_PLAN_LIMIT_REACHED" });
  await assert.rejects(assertBuyerSellingCapacity("buyer", { resources: ["activeShopRequests", "activeMarketplaceListings"] }, capacityClient({ activeMarketplaceListings: 3 })), { code: "BUYER_PLAN_LIMIT_REACHED" });
});
