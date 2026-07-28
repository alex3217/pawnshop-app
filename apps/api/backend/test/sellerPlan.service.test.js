import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEntitlements,
  getEffectivePlanCode,
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
  assert.equal(entitlements.limits.maxActiveListings, 25);
  assert.equal(entitlements.limits.standardMaxActiveListings, 25);
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
