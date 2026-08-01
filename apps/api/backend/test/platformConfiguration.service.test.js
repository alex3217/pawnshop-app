import assert from "node:assert/strict";
import test from "node:test";
import {
  configurationPrefix,
  parseConfigurationValue,
  validatePlatformConfiguration,
} from "../src/services/platformConfiguration.service.js";

test("feature flags validate rollout and targeting", () => {
  const flag = validatePlatformConfiguration("feature-flags", {
    key: "Offers V2", displayName: "Offers V2", description: "Gradual release",
    environment: "production", enabled: true, rolloutPercentage: 25,
    targetRoles: ["OWNER"], targetPlans: ["PRO"],
  });
  assert.equal(flag.key, "offers-v2");
  assert.equal(flag.environment, "PRODUCTION");
  assert.equal(flag.rolloutPercentage, 25);
  assert.throws(() => validatePlatformConfiguration("feature-flags", { ...flag, rolloutPercentage: 101 }), /between 0 and 100/);
});

test("listing rules validate required values and seller plan overrides", () => {
  const rule = validatePlatformConfiguration("listing-rules", {
    key: "jewelry", displayName: "Jewelry", category: "JEWELRY",
    allowedConditions: ["GOOD"], allowedStatuses: ["ACTIVE"], listingLimit: 20,
    requiredFields: ["karat"], requiredPhotos: 2, moderationRequired: true,
    prohibitedItemControls: ["stolen"], planOverrides: { FREE: { listingLimit: 10 }, ULTRA: { listingLimit: 100 } },
  });
  assert.equal(rule.requiredPhotos, 2);
  assert.throws(() => validatePlatformConfiguration("listing-rules", { ...rule, planOverrides: { GOLD: {} } }), /Unsupported seller plan/);
  assert.throws(() => validatePlatformConfiguration("listing-rules", { ...rule, allowedConditions: [] }), /at least one/);
});

test("auction rules validate durations, increments, deadlines, and review controls", () => {
  const rule = validatePlatformConfiguration("auction-rules", {
    key: "default", displayName: "Default auctions", allowedDurations: [24, 48],
    minimumBidIncrementCents: 100, reservePriceAllowed: true, buyNowAllowed: true,
    antiSnipingWindowMinutes: 5, antiSnipingExtensionMinutes: 5,
    paymentDeadlineHours: 24, cancellationRules: "Admin approval required",
    moderationRequired: true, reviewRequired: true,
  });
  assert.deepEqual(rule.allowedDurations, [24, 48]);
  assert.throws(() => validatePlatformConfiguration("auction-rules", { ...rule, minimumBidIncrementCents: 0 }), /at least 1/);
});

test("reserved keys and persisted JSON preserve existing PlatformSetting storage", () => {
  assert.equal(configurationPrefix("feature-flags"), "platform.featureFlag.");
  const parsed = parseConfigurationValue({ id: "1", key: "platform.featureFlag.x", value: '{"key":"x"}', createdAt: new Date(0), updatedAt: new Date(1) });
  assert.equal(parsed.key, "x");
  assert.equal(parsed.storageKey, "platform.featureFlag.x");
  assert.throws(() => configurationPrefix("unknown"), /Unsupported/);
});
