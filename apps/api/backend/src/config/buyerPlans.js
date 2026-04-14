export const BUYER_PLAN_CODES = Object.freeze({
  FREE: "FREE",
  PLUS: "PLUS",
  PREMIUM: "PREMIUM",
  ULTRA: "ULTRA",
});

export const BUYER_SUBSCRIPTION_STATUSES = Object.freeze({
  ACTIVE: "ACTIVE",
  TRIALING: "TRIALING",
  PAST_DUE: "PAST_DUE",
  INCOMPLETE: "INCOMPLETE",
  CANCELED: "CANCELED",
});

export const DEFAULT_BUYER_PLAN = BUYER_PLAN_CODES.FREE;
export const DEFAULT_BUYER_SUBSCRIPTION_STATUS =
  BUYER_SUBSCRIPTION_STATUSES.ACTIVE;

export const PAID_BUYER_PLAN_CODES = Object.freeze([
  BUYER_PLAN_CODES.PLUS,
  BUYER_PLAN_CODES.PREMIUM,
  BUYER_PLAN_CODES.ULTRA,
]);

export const BUYER_PLAN_DISPLAY_ORDER = Object.freeze([
  BUYER_PLAN_CODES.FREE,
  BUYER_PLAN_CODES.PLUS,
  BUYER_PLAN_CODES.PREMIUM,
  BUYER_PLAN_CODES.ULTRA,
]);

const USABLE_BUYER_SUBSCRIPTION_STATUSES = Object.freeze(
  new Set([
    BUYER_SUBSCRIPTION_STATUSES.ACTIVE,
    BUYER_SUBSCRIPTION_STATUSES.TRIALING,
    BUYER_SUBSCRIPTION_STATUSES.PAST_DUE,
  ])
);

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function freezeFeatures(features) {
  return Object.freeze(
    (Array.isArray(features) ? features : [])
      .map((feature) => String(feature || "").trim())
      .filter(Boolean)
  );
}

function toNumberOrNull(value) {
  if (value === null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function createBuyerPlan(config) {
  return Object.freeze({
    code: normalizeCode(config.code),
    label: String(config.label || config.code || "").trim(),
    monthlyPriceCents: toNumberOrNull(config.monthlyPriceCents) ?? 0,
    yearlyPriceCents: toNumberOrNull(config.yearlyPriceCents) ?? 0,
    maxSavedSearches: toNumberOrNull(config.maxSavedSearches),
    maxWatchlistItems: toNumberOrNull(config.maxWatchlistItems),
    instantAlerts: Boolean(config.instantAlerts),
    advancedAutoBid: Boolean(config.advancedAutoBid),
    premiumDealAccess: Boolean(config.premiumDealAccess),
    buyerFeeBps: toNumberOrNull(config.buyerFeeBps) ?? 0,
    supportLevel: String(config.supportLevel || "standard").trim().toLowerCase(),
    features: freezeFeatures(config.features),
  });
}

export const BUYER_PLANS = Object.freeze({
  [BUYER_PLAN_CODES.FREE]: createBuyerPlan({
    code: BUYER_PLAN_CODES.FREE,
    label: "Free",
    monthlyPriceCents: 0,
    yearlyPriceCents: 0,
    maxSavedSearches: 5,
    maxWatchlistItems: 25,
    instantAlerts: false,
    advancedAutoBid: false,
    premiumDealAccess: false,
    buyerFeeBps: 500,
    supportLevel: "standard",
    features: [
      "Browse items and auctions",
      "Bid on auctions",
      "Basic inquiries",
      "Up to 5 saved searches",
      "Up to 25 watchlist items",
    ],
  }),

  [BUYER_PLAN_CODES.PLUS]: createBuyerPlan({
    code: BUYER_PLAN_CODES.PLUS,
    label: "Plus",
    monthlyPriceCents: 699,
    yearlyPriceCents: 6900,
    maxSavedSearches: 50,
    maxWatchlistItems: 250,
    instantAlerts: true,
    advancedAutoBid: false,
    premiumDealAccess: true,
    buyerFeeBps: 300,
    supportLevel: "priority",
    features: [
      "Instant price and auction alerts",
      "Up to 50 saved searches",
      "Up to 250 watchlist items",
      "Premium deal alerts",
      "Priority support",
      "Lower buyer fee",
    ],
  }),

  [BUYER_PLAN_CODES.PREMIUM]: createBuyerPlan({
    code: BUYER_PLAN_CODES.PREMIUM,
    label: "Premium",
    monthlyPriceCents: 1299,
    yearlyPriceCents: 12900,
    maxSavedSearches: null,
    maxWatchlistItems: null,
    instantAlerts: true,
    advancedAutoBid: true,
    premiumDealAccess: true,
    buyerFeeBps: 150,
    supportLevel: "concierge",
    features: [
      "Unlimited saved searches",
      "Unlimited watchlist",
      "Advanced autobid tools",
      "Instant alerts",
      "Premium deal access",
      "Concierge support",
      "Lowest buyer fee",
    ],
  }),

  [BUYER_PLAN_CODES.ULTRA]: createBuyerPlan({
    code: BUYER_PLAN_CODES.ULTRA,
    label: "Ultra",
    monthlyPriceCents: 2499,
    yearlyPriceCents: 24900,
    maxSavedSearches: null,
    maxWatchlistItems: null,
    instantAlerts: true,
    advancedAutoBid: true,
    premiumDealAccess: true,
    buyerFeeBps: 50,
    supportLevel: "white-glove",
    features: [
      "Unlimited saved searches",
      "Unlimited watchlist",
      "Advanced autobid tools",
      "Earliest premium inventory access",
      "AI valuation and deal scoring",
      "Collector and reseller tools",
      "Concierge support",
      "Lowest buyer fee",
    ],
  }),
});

export function isUnlimited(value) {
  return value === null;
}

export function isKnownBuyerPlanCode(plan) {
  return Boolean(BUYER_PLANS[normalizeCode(plan)]);
}

export function normalizeBuyerPlanCode(plan) {
  const normalized = normalizeCode(plan);
  return isKnownBuyerPlanCode(normalized) ? normalized : DEFAULT_BUYER_PLAN;
}

export function isPaidBuyerPlanCode(plan) {
  return PAID_BUYER_PLAN_CODES.includes(normalizeBuyerPlanCode(plan));
}

export function normalizeBuyerSubscriptionStatus(status) {
  const normalized = normalizeCode(status);
  return BUYER_SUBSCRIPTION_STATUSES[normalized]
    ? normalized
    : DEFAULT_BUYER_SUBSCRIPTION_STATUS;
}

export function isBuyerSubscriptionUsable(status) {
  return USABLE_BUYER_SUBSCRIPTION_STATUSES.has(
    normalizeBuyerSubscriptionStatus(status)
  );
}

export function getBuyerPlanConfig(plan) {
  return BUYER_PLANS[normalizeBuyerPlanCode(plan)];
}

export function listBuyerPlans() {
  return BUYER_PLAN_DISPLAY_ORDER.map((code) => BUYER_PLANS[code]);
}

export function buyerFeePercentFromBps(bps) {
  return Number((Number(bps || 0) / 100).toFixed(2));
}
