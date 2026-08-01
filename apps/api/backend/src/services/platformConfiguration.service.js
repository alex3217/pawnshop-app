const PLANS = ["FREE", "PRO", "PREMIUM", "ULTRA"];
const AREAS = {
  "feature-flags": "featureFlag",
  "listing-rules": "listingRule",
  "auction-rules": "auctionRule",
};

function fail(message) {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
}

function text(value, label, required = true) {
  const result = String(value ?? "").trim();
  if (required && !result) fail(`${label} is required.`);
  return result;
}

function integer(value, label, minimum = 0) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < minimum) fail(`${label} must be an integer of at least ${minimum}.`);
  return result;
}

function stringList(value, label, required = false) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  const result = [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  if (required && !result.length) fail(`${label} must include at least one value.`);
  return result;
}

function planOverrides(value) {
  if (value == null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Plan overrides must be an object.");
  const result = {};
  for (const [plan, override] of Object.entries(value)) {
    if (!PLANS.includes(plan)) fail(`Unsupported seller plan: ${plan}.`);
    if (!override || typeof override !== "object" || Array.isArray(override)) fail(`${plan} override must be an object.`);
    result[plan] = override;
  }
  return result;
}

export function configurationPrefix(area) {
  const prefix = AREAS[area];
  if (!prefix) fail("Unsupported platform configuration area.");
  return `platform.${prefix}.`;
}

export function validatePlatformConfiguration(area, input, existing = null) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("Configuration must be a JSON object.");
  const common = {
    id: existing?.id || undefined,
    key: text(input.key ?? existing?.key, "Key").toLowerCase().replace(/[^a-z0-9._-]+/g, "-"),
    displayName: text(input.displayName ?? existing?.displayName, "Display name"),
    description: text(input.description ?? existing?.description, "Description", false),
    enabled: input.enabled === undefined ? existing?.enabled ?? true : Boolean(input.enabled),
    archived: input.archived === undefined ? existing?.archived ?? false : Boolean(input.archived),
    version: Number(existing?.version || 0) + 1,
  };

  if (area === "feature-flags") {
    const rolloutPercentage = Number(input.rolloutPercentage ?? existing?.rolloutPercentage ?? 100);
    if (!Number.isFinite(rolloutPercentage) || rolloutPercentage < 0 || rolloutPercentage > 100) fail("Rollout percentage must be between 0 and 100.");
    const environment = String(input.environment ?? existing?.environment ?? "PRODUCTION").toUpperCase();
    if (!["DEVELOPMENT", "STAGING", "PRODUCTION", "ALL"].includes(environment)) fail("Environment is invalid.");
    return { ...common, environment, rolloutPercentage, targetRoles: stringList(input.targetRoles ?? existing?.targetRoles ?? [], "Target roles"), targetPlans: stringList(input.targetPlans ?? existing?.targetPlans ?? [], "Target plans").map((plan) => plan.toUpperCase()) };
  }

  if (area === "listing-rules") {
    return {
      ...common,
      category: text(input.category ?? existing?.category ?? "ALL", "Category"),
      allowedConditions: stringList(input.allowedConditions ?? existing?.allowedConditions ?? [], "Allowed conditions", true),
      allowedStatuses: stringList(input.allowedStatuses ?? existing?.allowedStatuses ?? [], "Allowed statuses", true),
      listingLimit: integer(input.listingLimit ?? existing?.listingLimit ?? 0, "Listing limit"),
      requiredFields: stringList(input.requiredFields ?? existing?.requiredFields ?? [], "Required fields"),
      requiredPhotos: integer(input.requiredPhotos ?? existing?.requiredPhotos ?? 0, "Required photos"),
      moderationRequired: Boolean(input.moderationRequired ?? existing?.moderationRequired),
      prohibitedItemControls: stringList(input.prohibitedItemControls ?? existing?.prohibitedItemControls ?? [], "Prohibited-item controls"),
      planOverrides: planOverrides(input.planOverrides ?? existing?.planOverrides),
    };
  }

  const durations = stringList(input.allowedDurations ?? existing?.allowedDurations ?? [], "Allowed durations", true).map(Number);
  if (durations.some((duration) => !Number.isInteger(duration) || duration <= 0)) fail("Allowed durations must be positive whole hours.");
  return {
    ...common,
    allowedDurations: durations,
    minimumBidIncrementCents: integer(input.minimumBidIncrementCents ?? existing?.minimumBidIncrementCents ?? 1, "Minimum bid increment", 1),
    reservePriceAllowed: Boolean(input.reservePriceAllowed ?? existing?.reservePriceAllowed),
    reservePriceRequired: Boolean(input.reservePriceRequired ?? existing?.reservePriceRequired),
    buyNowAllowed: Boolean(input.buyNowAllowed ?? existing?.buyNowAllowed),
    buyNowEndsOnBid: Boolean(input.buyNowEndsOnBid ?? existing?.buyNowEndsOnBid),
    antiSnipingWindowMinutes: integer(input.antiSnipingWindowMinutes ?? existing?.antiSnipingWindowMinutes ?? 0, "Anti-sniping window"),
    antiSnipingExtensionMinutes: integer(input.antiSnipingExtensionMinutes ?? existing?.antiSnipingExtensionMinutes ?? 0, "Anti-sniping extension"),
    paymentDeadlineHours: integer(input.paymentDeadlineHours ?? existing?.paymentDeadlineHours ?? 1, "Payment deadline", 1),
    cancellationRules: text(input.cancellationRules ?? existing?.cancellationRules, "Cancellation rules"),
    moderationRequired: Boolean(input.moderationRequired ?? existing?.moderationRequired),
    reviewRequired: Boolean(input.reviewRequired ?? existing?.reviewRequired),
  };
}

export function parseConfigurationValue(row) {
  try {
    const value = JSON.parse(row.value || "{}");
    return { ...value, id: row.id, storageKey: row.key, createdAt: row.createdAt, updatedAt: row.updatedAt };
  } catch {
    return null;
  }
}
