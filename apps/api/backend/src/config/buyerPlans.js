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
    maxActiveShopRequests: toNumberOrNull(config.maxActiveShopRequests),
    maxMonthlyShopRequests: toNumberOrNull(config.maxMonthlyShopRequests),
    maxActiveMarketplaceListings: toNumberOrNull(config.maxActiveMarketplaceListings),
    maxMonthlyMarketplaceListings: toNumberOrNull(config.maxMonthlyMarketplaceListings),
    maxSellItemPhotos: toNumberOrNull(config.maxSellItemPhotos),
    maxSellRadiusMiles: toNumberOrNull(config.maxSellRadiusMiles),
    maxAiListingGenerationsPerMonth: toNumberOrNull(config.maxAiListingGenerationsPerMonth),
    wishListLimit: toNumberOrNull(config.wishListLimit),
    favoriteLimit: toNumberOrNull(config.favoriteLimit),
    comparisonLimit: toNumberOrNull(config.comparisonLimit),
    alertLevel: String(config.alertLevel || "basic").trim().toLowerCase(),
    notificationPriority: String(config.notificationPriority || "standard").trim().toLowerCase(),
    aiShoppingEnabled: Boolean(config.aiShoppingEnabled),
    aiShoppingMonthlyLimit: toNumberOrNull(config.aiShoppingMonthlyLimit),
    priceHistoryEnabled: Boolean(config.priceHistoryEnabled),
    advancedSearchEnabled: Boolean(config.advancedSearchEnabled),
    workspaceLevel: String(config.workspaceLevel || "fixed").trim().toLowerCase(),
    workspaceCustomizationEnabled: Boolean(config.workspaceCustomizationEnabled),
    collectionManagerEnabled: Boolean(config.collectionManagerEnabled),
    collectionItemLimit: toNumberOrNull(config.collectionItemLimit),
    marketIntelligenceLevel: String(config.marketIntelligenceLevel || "none").trim().toLowerCase(),
    conciergeEnabled: Boolean(config.conciergeEnabled),
    loyaltyEnabled: Boolean(config.loyaltyEnabled),
    referralRewardsEnabled: Boolean(config.referralRewardsEnabled),
    earlyInventoryAlertsEnabled: Boolean(config.earlyInventoryAlertsEnabled),
    exclusiveDealsLevel: String(config.exclusiveDealsLevel || "none").trim().toLowerCase(),
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
    maxSavedSearches: 10,
    maxWatchlistItems: 25,
    maxActiveShopRequests: 5,
    maxMonthlyShopRequests: 20,
    maxActiveMarketplaceListings: 3,
    maxMonthlyMarketplaceListings: 10,
    maxSellItemPhotos: 6,
    maxSellRadiusMiles: 25,
    maxAiListingGenerationsPerMonth: 3,
    wishListLimit: 1,
    favoriteLimit: 25,
    comparisonLimit: 3,
    alertLevel: "basic",
    notificationPriority: "standard",
    workspaceLevel: "fixed",
    instantAlerts: false,
    advancedAutoBid: false,
    premiumDealAccess: false,
    buyerFeeBps: 500,
    supportLevel: "standard",
    features: [
      "Browse items and auctions",
      "Bid on auctions",
      "Basic inquiries",
      "Up to 10 saved searches",
      "Up to 25 watchlist items",
      "5 active / 20 monthly shop requests",
      "3 active / 10 monthly marketplace listings",
      "6 photos and 25-mile selling radius",
      "3 AI listing generations per month",
    ],
  }),

  [BUYER_PLAN_CODES.PLUS]: createBuyerPlan({
    code: BUYER_PLAN_CODES.PLUS,
    label: "Plus",
    monthlyPriceCents: 699,
    yearlyPriceCents: 6900,
    maxSavedSearches: null,
    maxWatchlistItems: null,
    maxActiveShopRequests: 20,
    maxMonthlyShopRequests: 75,
    maxActiveMarketplaceListings: 15,
    maxMonthlyMarketplaceListings: 50,
    maxSellItemPhotos: 12,
    maxSellRadiusMiles: 50,
    maxAiListingGenerationsPerMonth: 30,
    wishListLimit: null,
    favoriteLimit: null,
    comparisonLimit: 10,
    alertLevel: "advanced",
    notificationPriority: "faster",
    priceHistoryEnabled: true,
    advancedSearchEnabled: true,
    workspaceLevel: "customizable",
    workspaceCustomizationEnabled: true,
    loyaltyEnabled: false,
    referralRewardsEnabled: false,
    exclusiveDealsLevel: "limited",
    instantAlerts: true,
    advancedAutoBid: false,
    premiumDealAccess: true,
    buyerFeeBps: 300,
    supportLevel: "priority",
    features: [
      "Instant price and auction alerts",
      "Unlimited saved searches",
      "Unlimited watchlist",
      "Premium deal alerts",
      "Priority support",
      "Lower buyer fee",
      "20 active / 75 monthly shop requests",
      "15 active / 50 monthly marketplace listings",
      "12 photos and 50-mile selling radius",
      "30 AI listing generations per month",
    ],
  }),

  [BUYER_PLAN_CODES.PREMIUM]: createBuyerPlan({
    code: BUYER_PLAN_CODES.PREMIUM,
    label: "Premium",
    monthlyPriceCents: 1299,
    yearlyPriceCents: 12900,
    maxSavedSearches: null,
    maxWatchlistItems: null,
    maxActiveShopRequests: 50,
    maxMonthlyShopRequests: 200,
    maxActiveMarketplaceListings: 50,
    maxMonthlyMarketplaceListings: 200,
    maxSellItemPhotos: 20,
    maxSellRadiusMiles: 100,
    maxAiListingGenerationsPerMonth: 100,
    wishListLimit: null,
    favoriteLimit: null,
    comparisonLimit: 25,
    alertLevel: "priority",
    notificationPriority: "priority",
    priceHistoryEnabled: true,
    advancedSearchEnabled: true,
    workspaceLevel: "advanced",
    workspaceCustomizationEnabled: true,
    collectionManagerEnabled: false,
    collectionItemLimit: 500,
    marketIntelligenceLevel: "none",
    loyaltyEnabled: false,
    referralRewardsEnabled: false,
    earlyInventoryAlertsEnabled: true,
    exclusiveDealsLevel: "member",
    instantAlerts: true,
    advancedAutoBid: true,
    premiumDealAccess: true,
    buyerFeeBps: 150,
    supportLevel: "priority",
    features: [
      "Unlimited saved searches",
      "Unlimited watchlist",
      "Advanced autobid tools",
      "Instant alerts",
      "Premium deal access",
      "Priority support",
      "Lowest buyer fee",
      "50 active / 200 monthly shop requests",
      "50 active / 200 monthly marketplace listings",
      "20 photos and 100-mile selling radius",
      "100 AI listing generations per month",
    ],
  }),

  [BUYER_PLAN_CODES.ULTRA]: createBuyerPlan({
    code: BUYER_PLAN_CODES.ULTRA,
    label: "Ultra",
    monthlyPriceCents: 2499,
    yearlyPriceCents: 24900,
    maxSavedSearches: null,
    maxWatchlistItems: null,
    maxActiveShopRequests: null,
    maxMonthlyShopRequests: null,
    maxActiveMarketplaceListings: 150,
    maxMonthlyMarketplaceListings: 500,
    maxSellItemPhotos: 30,
    maxSellRadiusMiles: 250,
    maxAiListingGenerationsPerMonth: 300,
    wishListLimit: null,
    favoriteLimit: null,
    comparisonLimit: null,
    alertLevel: "highest",
    notificationPriority: "highest",
    priceHistoryEnabled: true,
    advancedSearchEnabled: true,
    workspaceLevel: "advanced",
    workspaceCustomizationEnabled: true,
    collectionManagerEnabled: false,
    collectionItemLimit: null,
    marketIntelligenceLevel: "none",
    conciergeEnabled: false,
    loyaltyEnabled: false,
    referralRewardsEnabled: false,
    earlyInventoryAlertsEnabled: true,
    exclusiveDealsLevel: "vip",
    instantAlerts: true,
    advancedAutoBid: true,
    premiumDealAccess: true,
    buyerFeeBps: 50,
    supportLevel: "priority",
    features: [
      "Unlimited saved searches",
      "Unlimited watchlist",
      "Advanced autobid tools",
      "Earliest premium inventory access",
      "Priority support",
      "Lowest buyer fee",
      "Unlimited active and monthly shop requests",
      "150 active / 500 monthly marketplace listings",
      "30 photos and 250-mile selling radius",
      "300 AI listing generations per month",
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
