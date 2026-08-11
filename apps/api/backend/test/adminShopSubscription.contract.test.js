import assert from "node:assert/strict";
import test from "node:test";

import { serializeAdminShop } from "../src/controllers/admin.controller.js";
import { mapShopRow } from "../src/controllers/superAdmin.controller.js";

function shop(overrides = {}) {
  return {
    id: "shop_pro",
    name: "Pro Shop",
    owner: { name: "Owner", email: "owner@example.test" },
    subscriptionPlan: "PRO",
    subscriptionStatus: "ACTIVE",
    subscriptionBillingInterval: "MONTH",
    subscriptionCurrentPeriodEnd: null,
    ...overrides,
  };
}

for (const [surface, serialize] of [
  ["Admin Shop Management", serializeAdminShop],
  ["Super Admin Shop Management", mapShopRow],
]) {
  test(`${surface} serializes an ACTIVE PRO monthly shop as PRO / MONTH`, () => {
    const row = serialize(shop());
    assert.equal(row.id, "shop_pro");
    assert.equal(row.subscriptionPlan, "PRO");
    assert.equal(row.effectiveSubscriptionPlan, "PRO");
    assert.equal(row.storedSubscriptionPlan, "PRO");
    assert.equal(row.subscriptionStatus, "ACTIVE");
    assert.equal(row.subscriptionBillingInterval, "MONTH");
  });

  test(`${surface} explicitly serializes unusable paid state with the FREE fallback`, () => {
    const row = serialize(shop({ subscriptionStatus: "CANCELED" }));
    assert.equal(row.subscriptionPlan, "FREE");
    assert.equal(row.effectiveSubscriptionPlan, "FREE");
    assert.equal(row.storedSubscriptionPlan, "PRO");
    assert.equal(row.subscriptionStatus, "CANCELED");
    assert.equal(row.subscriptionBillingInterval, "MONTH");
  });
}
