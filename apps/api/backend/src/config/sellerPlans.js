// File: apps/api/backend/src/config/sellerPlans.js

export const SELLER_PLAN_CODES = Object.freeze({
  FREE: "FREE",
  PRO: "PRO",
  PREMIUM: "PREMIUM",
  ULTRA: "ULTRA",
});

export const SUBSCRIPTION_STATUSES = Object.freeze({
  ACTIVE: "ACTIVE",
  TRIALING: "TRIALING",
  PAST_DUE: "PAST_DUE",
  INCOMPLETE: "INCOMPLETE",
  CANCELED: "CANCELED",
});

export const DEFAULT_SELLER_PLAN = SELLER_PLAN_CODES.FREE;
export const DEFAULT_SUBSCRIPTION_STATUS = SUBSCRIPTION_STATUSES.ACTIVE;

export const PAID_SELLER_PLAN_CODES = Object.freeze([
  SELLER_PLAN_CODES.PRO,
  SELLER_PLAN_CODES.PREMIUM,
  SELLER_PLAN_CODES.ULTRA,
]);

export const SELLER_PLAN_DISPLAY_ORDER = Object.freeze([
  SELLER_PLAN_CODES.FREE,
  SELLER_PLAN_CODES.PRO,
  SELLER_PLAN_CODES.PREMIUM,
  SELLER_PLAN_CODES.ULTRA,
]);

const USABLE_SUBSCRIPTION_STATUSES = Object.freeze(
  new Set([
    SUBSCRIPTION_STATUSES.ACTIVE,
    SUBSCRIPTION_STATUSES.TRIALING,
    SUBSCRIPTION_STATUSES.PAST_DUE,
  ])
);

export function createConfigError(message, details = {}) {
  const err = new Error(message);
  err.name = "SellerPlanConfigError";
  err.statusCode = 400;
  err.details = details;
  return err;
}

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeLabel(value, fallback = "") {
  return String(value || fallback || "").trim();
}

function freezeFeatures(features) {
  return Object.freeze(
    (Array.isArray(features) ? features : [])
      .map((feature) => String(feature || "").trim())
      .filter(Boolean)
  );
}

function toFiniteNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toNonNegativeIntegerOrNull(value, fieldName) {
  if (value === null) return null;

  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw createConfigError(`Invalid non-negative value for ${fieldName}`, {
      fieldName,
      value,
    });
  }

  return Math.floor(num);
}

function createSellerPlan(config) {
  const code = normalizeCode(config.code);
  const label = normalizeLabel(config.label, code);

  if (!code) {
    throw createConfigError("Seller plan code is required");
  }

  return Object.freeze({
    code,
    label,
    monthlyPriceCents:
      toNonNegativeIntegerOrNull(
        config.monthlyPriceCents,
        `${code}.monthlyPriceCents`
      ) ?? 0,
    yearlyPriceCents:
      toNonNegativeIntegerOrNull(
        config.yearlyPriceCents,
        `${code}.yearlyPriceCents`
      ) ?? 0,

    // null = unlimited
    maxActiveListings: toNonNegativeIntegerOrNull(
      config.maxActiveListings,
      `${code}.maxActiveListings`
    ),
    maxLocations: toNonNegativeIntegerOrNull(
      config.maxLocations,
      `${code}.maxLocations`
    ),
    maxStaffUsers: toNonNegativeIntegerOrNull(
      config.maxStaffUsers,
      `${code}.maxStaffUsers`
    ),

    canCreateAuctions: Boolean(config.canCreateAuctions),
    canFeatureListings: Boolean(config.canFeatureListings),
    analyticsLevel: normalizeLabel(
      config.analyticsLevel,
      "none"
    ).toLowerCase(),
    commissionBps:
      toNonNegativeIntegerOrNull(config.commissionBps, `${code}.commissionBps`) ??
      0,
    features: freezeFeatures(config.features),
  });
}

export const SELLER_PLANS = Object.freeze({
  [SELLER_PLAN_CODES.FREE]: createSellerPlan({
    code: SELLER_PLAN_CODES.FREE,
    label: "Free",
    monthlyPriceCents: 0,
    yearlyPriceCents: 0,
    maxActiveListings: 10,
    maxLocations: 1,
    maxStaffUsers: 1,
    canCreateAuctions: false,
    canFeatureListings: false,
    analyticsLevel: "none",
    commissionBps: 1200,
    features: [
      "Up to 10 active listings",
      "Basic shop profile",
      "Standard support",
    ],
  }),

  [SELLER_PLAN_CODES.PRO]: createSellerPlan({
    code: SELLER_PLAN_CODES.PRO,
    label: "Pro",
    monthlyPriceCents: 4900,
    yearlyPriceCents: 49000,
    maxActiveListings: 100,
    maxLocations: 1,
    maxStaffUsers: 3,
    canCreateAuctions: true,
    canFeatureListings: true,
    analyticsLevel: "basic",
    commissionBps: 900,
    features: [
      "Up to 100 active listings",
      "Auction creation",
      "Featured listings",
      "Basic analytics",
      "Lower commission rate",
    ],
  }),

  [SELLER_PLAN_CODES.PREMIUM]: createSellerPlan({
    code: SELLER_PLAN_CODES.PREMIUM,
    label: "Premium",
    monthlyPriceCents: 14900,
    yearlyPriceCents: 149000,
    maxActiveListings: null,
    maxLocations: 5,
    maxStaffUsers: 15,
    canCreateAuctions: true,
    canFeatureListings: true,
    analyticsLevel: "advanced",
    commissionBps: 600,
    features: [
      "Unlimited active listings",
      "Priority featured placement",
      "Advanced analytics",
      "Multi-location support",
      "Staff account support",
      "Lower commission rate",
    ],
  }),

  [SELLER_PLAN_CODES.ULTRA]: createSellerPlan({
    code: SELLER_PLAN_CODES.ULTRA,
    label: "Ultra",
    monthlyPriceCents: 29900,
    yearlyPriceCents: 299000,
    maxActiveListings: null,
    maxLocations: null,
    maxStaffUsers: null,
    canCreateAuctions: true,
    canFeatureListings: true,
    analyticsLevel: "enterprise",
    commissionBps: 400,
    features: [
      "Unlimited active listings",
      "Unlimited locations",
      "Unlimited staff users",
      "Auction creation",
      "Featured listings",
      "Priority featured placement",
      "Enterprise analytics",
      "Bulk inventory import",
      "Advanced scan/upload tools",
      "API integrations",
      "Dedicated support",
      "Lowest commission rate",
    ],
  }),
});

function getPlanIndex(plan) {
  return SELLER_PLAN_DISPLAY_ORDER.indexOf(normalizeSellerPlanCode(plan));
}

export function isUnlimited(value) {
  return value === null;
}

export function getSellerPlanCodes() {
  return [...SELLER_PLAN_DISPLAY_ORDER];
}

export function getPaidSellerPlanCodes() {
  return [...PAID_SELLER_PLAN_CODES];
}

export function getDefaultSellerPlanConfig() {
  return SELLER_PLANS[DEFAULT_SELLER_PLAN];
}

export function getHighestSellerPlanCode() {
  return SELLER_PLAN_DISPLAY_ORDER[SELLER_PLAN_DISPLAY_ORDER.length - 1];
}

export function isKnownSellerPlanCode(plan) {
  return Boolean(SELLER_PLANS[normalizeCode(plan)]);
}

export function normalizeSellerPlanCode(plan) {
  const normalized = normalizeCode(plan);
  return isKnownSellerPlanCode(normalized) ? normalized : DEFAULT_SELLER_PLAN;
}

export function assertKnownSellerPlanCode(plan) {
  const normalized = normalizeCode(plan);

  if (!normalized) {
    throw createConfigError("Seller plan is required", { plan });
  }

  if (!isKnownSellerPlanCode(normalized)) {
    throw createConfigError(`Unsupported seller plan: ${normalized}`, {
      plan: normalized,
      supportedPlans: getSellerPlanCodes(),
    });
  }

  return normalized;
}

export function isFreeSellerPlanCode(plan) {
  return normalizeSellerPlanCode(plan) === SELLER_PLAN_CODES.FREE;
}

export function isPaidSellerPlanCode(plan) {
  return PAID_SELLER_PLAN_CODES.includes(normalizeSellerPlanCode(plan));
}

export function assertPaidSellerPlanCode(plan) {
  const normalized = assertKnownSellerPlanCode(plan);

  if (!PAID_SELLER_PLAN_CODES.includes(normalized)) {
    throw createConfigError(`Seller plan is not billable: ${normalized}`, {
      plan: normalized,
      billablePlans: getPaidSellerPlanCodes(),
    });
  }

  return normalized;
}

export function getSellerPlanConfig(plan) {
  return SELLER_PLANS[normalizeSellerPlanCode(plan)];
}

export function getSellerPlanLabel(plan) {
  return getSellerPlanConfig(plan).label;
}

export function getSellerPlanRank(plan) {
  const index = getPlanIndex(plan);
  return index >= 0 ? index : 0;
}

export function isSellerPlanUpgrade(fromPlan, toPlan) {
  return getSellerPlanRank(toPlan) > getSellerPlanRank(fromPlan);
}

export function isSellerPlanDowngrade(fromPlan, toPlan) {
  return getSellerPlanRank(toPlan) < getSellerPlanRank(fromPlan);
}

export function compareSellerPlansByDisplayOrder(a, b) {
  return getSellerPlanRank(a) - getSellerPlanRank(b);
}

export function sortSellerPlansByDisplayOrder(plans = []) {
  return [...plans].sort((left, right) =>
    compareSellerPlansByDisplayOrder(left?.code, right?.code)
  );
}

export function isKnownSubscriptionStatus(status) {
  return Boolean(SUBSCRIPTION_STATUSES[normalizeCode(status)]);
}

export function normalizeSubscriptionStatus(status) {
  const normalized = normalizeCode(status);
  return isKnownSubscriptionStatus(normalized)
    ? normalized
    : DEFAULT_SUBSCRIPTION_STATUS;
}

export function assertKnownSubscriptionStatus(status) {
  const normalized = normalizeCode(status);

  if (!normalized) {
    throw createConfigError("Subscription status is required", { status });
  }

  if (!isKnownSubscriptionStatus(normalized)) {
    throw createConfigError(`Unsupported subscription status: ${normalized}`, {
      status: normalized,
      supportedStatuses: Object.values(SUBSCRIPTION_STATUSES),
    });
  }

  return normalized;
}

export function isSubscriptionUsable(status) {
  return USABLE_SUBSCRIPTION_STATUSES.has(normalizeSubscriptionStatus(status));
}

export function listSellerPlans() {
  return SELLER_PLAN_DISPLAY_ORDER.map((code) => SELLER_PLANS[code]);
}

export function listPaidSellerPlans() {
  return PAID_SELLER_PLAN_CODES.map((code) => SELLER_PLANS[code]);
}

export function commissionPercentFromBps(bps) {
  return Number((toFiniteNumber(bps, 0) / 100).toFixed(2));
}

export function annualSavingsFromPrices(monthlyPriceCents, yearlyPriceCents) {
  const monthly = toFiniteNumber(monthlyPriceCents, 0);
  const yearly = toFiniteNumber(yearlyPriceCents, 0);

  if (monthly <= 0 || yearly <= 0) return 0;

  const annualizedMonthly = monthly * 12;
  return Math.max(annualizedMonthly - yearly, 0);
}

export function getSellerPlanSummary(plan) {
  const config = getSellerPlanConfig(plan);

  return {
    ...config,
    commissionPercent: commissionPercentFromBps(config.commissionBps),
    annualSavingsCents: annualSavingsFromPrices(
      config.monthlyPriceCents,
      config.yearlyPriceCents
    ),
    isPaid: isPaidSellerPlanCode(config.code),
    isFree: isFreeSellerPlanCode(config.code),
    rank: getSellerPlanRank(config.code),
  };
}