import assert from "node:assert/strict";
import test from "node:test";

import {
  assertAiListingAssistantAccess,
  assertAnalyticsAccess,
  assertFeatureEnabled,
  assertLocationCapacity,
  buildEntitlements,
  getEffectivePlanCode,
  resolveEffectiveSellerPlan,
} from "../src/services/sellerPlan.service.js";

function createTrialShop(subscriptionCurrentPeriodEnd) {
  return {
    id: "shop_trial_test",
    name: "Trial Test Shop",
    ownerId: "owner_trial_test",
    subscriptionPlan: "PRO",
    subscriptionStatus: "TRIALING",
    subscriptionCurrentPeriodEnd,
    cancelAtPeriodEnd: false,
  };
}

test("expired seller trial falls back to the FREE plan", () => {
  const shop = createTrialShop(
    new Date(Date.now() - 60_000),
  );

  assert.equal(getEffectivePlanCode(shop), "FREE");

  const entitlements = buildEntitlements(shop, 0);

  assert.equal(
    entitlements.subscription.storedPlan,
    "PRO",
  );
  assert.equal(
    entitlements.subscription.effectivePlan,
    "FREE",
  );
  assert.equal(
    entitlements.subscription.status,
    "TRIALING",
  );
  assert.equal(
    entitlements.subscription.isUsable,
    false,
  );
  assert.equal(
    entitlements.subscription.isFree,
    true,
  );
  assert.equal(
    entitlements.subscription.isPaid,
    false,
  );
  assert.equal(
    entitlements.limits.listingLimitSource,
    "PLAN",
  );
  assert.equal(entitlements.limits.maxActiveListings, 20);
  assert.equal(entitlements.limits.standardMaxActiveListings, 20);
  assert.equal(entitlements.limits.trialMaxActiveListings, 50);
});

test("unexpired seller trial retains its paid plan", () => {
  const shop = createTrialShop(
    new Date(Date.now() + 60_000),
  );

  assert.equal(getEffectivePlanCode(shop), "PRO");

  const entitlements = buildEntitlements(shop, 0);

  assert.equal(
    entitlements.subscription.effectivePlan,
    "PRO",
  );
  assert.equal(
    entitlements.subscription.status,
    "TRIALING",
  );
  assert.equal(
    entitlements.subscription.isUsable,
    true,
  );
  assert.equal(
    entitlements.subscription.isPaid,
    true,
  );
  assert.equal(
    entitlements.limits.listingLimitSource,
    "TRIAL",
  );
  assert.equal(entitlements.limits.maxActiveListings, 50);
  assert.equal(entitlements.limits.standardMaxActiveListings, 100);
  assert.equal(entitlements.limits.trialMaxActiveListings, 50);
});

test("active seller subscription is not expired by an old period date", () => {
  const shop = {
    ...createTrialShop(
      new Date(Date.now() - 60_000),
    ),
    subscriptionStatus: "ACTIVE",
  };

  assert.equal(getEffectivePlanCode(shop), "PRO");
});

test("FREE is effective without a paid subscription record", () => {
  assert.equal(getEffectivePlanCode({ subscriptionPlan: "FREE" }), "FREE");
  assert.equal(getEffectivePlanCode({}), "FREE");
});

test("active paid seller plans remain effective", () => {
  for (const subscriptionPlan of ["PRO", "PREMIUM", "ULTRA"]) {
    assert.equal(
      getEffectivePlanCode({ subscriptionPlan, subscriptionStatus: "ACTIVE" }),
      subscriptionPlan,
    );
  }
});

test("ACTIVE PRO monthly resolves one authoritative plan and interval", () => {
  assert.deepEqual(
    resolveEffectiveSellerPlan({
      subscriptionPlan: "PRO",
      subscriptionStatus: "ACTIVE",
      subscriptionBillingInterval: "MONTH",
    }),
    { storedPlan: "PRO", effectivePlan: "PRO", status: "ACTIVE", interval: "MONTH", isUsable: true },
  );
  const entitlements = buildEntitlements({
    id: "shop_pro",
    subscriptionPlan: "PRO",
    subscriptionStatus: "ACTIVE",
    subscriptionBillingInterval: "MONTH",
  }, 0);
  assert.equal(entitlements.subscription.effectivePlan, "PRO");
  assert.equal(entitlements.subscription.interval, "MONTH");
  assert.equal(entitlements.limits.maxActiveListings, 100);
  assert.equal(entitlements.features.canCreateAuctions, true);
  assert.equal(entitlements.billing.commissionBps, 900);
});

test("inactive paid subscriptions use the existing FREE fallback", () => {
  for (const subscriptionStatus of ["CANCELED", "INCOMPLETE"]) {
    assert.equal(
      getEffectivePlanCode({ subscriptionPlan: "PREMIUM", subscriptionStatus }),
      "FREE",
    );
  }
});

test("unknown seller plan values safely use the FREE fallback", () => {
  for (const subscriptionPlan of ["", "ENTERPRISE", null, undefined]) {
    assert.equal(
      getEffectivePlanCode({ subscriptionPlan, subscriptionStatus: "ACTIVE" }),
      "FREE",
    );
  }
});

test("paid auction entitlement allows PRO and rejects FREE or unusable paid fallback", () => {
  const pro = buildEntitlements({ id: "pro", subscriptionPlan: "PRO", subscriptionStatus: "ACTIVE" }, 0);
  assert.doesNotThrow(() => assertFeatureEnabled(pro, "canCreateAuctions", "disabled", "PLAN_AUCTIONS_DISABLED", "AUCTIONS_NOT_INCLUDED"));

  for (const shop of [
    { id: "free", subscriptionPlan: "FREE", subscriptionStatus: "ACTIVE" },
    { id: "canceled", subscriptionPlan: "PRO", subscriptionStatus: "CANCELED" },
  ]) {
    assert.throws(
      () => assertFeatureEnabled(buildEntitlements(shop, 0), "canCreateAuctions", "disabled", "PLAN_AUCTIONS_DISABLED", "AUCTIONS_NOT_INCLUDED"),
      (error) => error.code === "PLAN_AUCTIONS_DISABLED" && error.statusCode === 403,
    );
  }
});

test("location capacity allows below-limit, rejects at-limit, and uses FREE fallback", () => {
  const premium = buildEntitlements({ id: "premium", subscriptionPlan: "PREMIUM", subscriptionStatus: "ACTIVE" }, 0);
  assert.equal(assertLocationCapacity(premium, 4).usage.locationCount, 4);
  assert.throws(() => assertLocationCapacity(premium, 5), (error) => error.code === "PLAN_LOCATION_LIMIT_REACHED");

  const unusable = buildEntitlements({ id: "past-paid", subscriptionPlan: "PREMIUM", subscriptionStatus: "CANCELED" }, 0);
  assert.equal(unusable.subscription.effectivePlan, "FREE");
  assert.throws(() => assertLocationCapacity(unusable, 1), (error) => error.code === "PLAN_LOCATION_LIMIT_REACHED");
});

test("seller analytics levels allow paid analytics and deny FREE fallback", () => {
  const pro = buildEntitlements({ id: "pro", subscriptionPlan: "PRO", subscriptionStatus: "ACTIVE" }, 0);
  assert.equal(assertAnalyticsAccess(pro).features.analyticsLevel, "basic");
  assert.throws(
    () => assertAnalyticsAccess(buildEntitlements({ id: "free", subscriptionPlan: "FREE", subscriptionStatus: "ACTIVE" }, 0)),
    (error) => error.code === "PLAN_ANALYTICS_DISABLED",
  );
});

test("AI listing access follows the existing advanced scan/upload entitlement", () => {
  const ultra = buildEntitlements({ id: "ultra", subscriptionPlan: "ULTRA", subscriptionStatus: "ACTIVE" }, 0);
  assert.doesNotThrow(() => assertAiListingAssistantAccess(ultra));
  assert.throws(
    () => assertAiListingAssistantAccess(buildEntitlements({ id: "pro", subscriptionPlan: "PRO", subscriptionStatus: "ACTIVE" }, 0)),
    (error) => error.code === "PLAN_AI_LISTING_ASSISTANT_DISABLED",
  );
});
