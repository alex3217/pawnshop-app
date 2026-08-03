import { prisma } from "../lib/prisma.js";
import {
  BUYER_PLAN_CODES,
  getBuyerPlanConfig,
  isBuyerSubscriptionUsable,
  normalizeBuyerPlanCode,
} from "../config/buyerPlans.js";

const RESOURCE_LIMITS = Object.freeze({
  savedSearches: "maxSavedSearches",
  watchlistItems: "maxWatchlistItems",
  activeShopRequests: "maxActiveShopRequests",
  monthlyShopRequests: "maxMonthlyShopRequests",
  activeMarketplaceListings: "maxActiveMarketplaceListings",
  monthlyMarketplaceListings: "maxMonthlyMarketplaceListings",
  aiListingGenerations: "maxAiListingGenerationsPerMonth",
});

export const ACTIVE_SHOP_REQUEST_STATUSES = Object.freeze(["SUBMITTED", "REVIEWING", "OFFERED", "NEEDS_INFO"]);
export const ACTIVE_MARKETPLACE_LISTING_STATUSES = Object.freeze(["DRAFT", "ACTIVE", "RESERVED", "PAUSED"]);
const SHOP_CHANNEL_INTENTS = Object.freeze(["SHOP_OFFERS", "BOTH", "PAWN_OFFERS"]);

const IMPLEMENTATION_STATUS = Object.freeze({
  savedSearches: true,
  watchlist: true,
  defaultWishList: true,
  namedWishLists: false,
  comparisons: false,
  aiShopping: false,
  collections: false,
  marketIntelligence: false,
  conciergeWorkflow: false,
  loyalty: false,
  referralRewards: false,
});

function limitUsage(used, limit) {
  const unlimited = limit === null;
  return {
    used,
    limit,
    unlimited,
    remaining: unlimited ? null : Math.max(Number(limit || 0) - used, 0),
    atLimit: !unlimited && used >= Number(limit || 0),
  };
}

function effectivePlan(subscription) {
  const storedPlan = normalizeBuyerPlanCode(subscription?.plan || "FREE");
  if (storedPlan === BUYER_PLAN_CODES.FREE) return BUYER_PLAN_CODES.FREE;
  return isBuyerSubscriptionUsable(subscription?.status)
    ? storedPlan
    : BUYER_PLAN_CODES.FREE;
}

export function buildBuyerEntitlements({ subscription = null, counts = {} } = {}) {
  const storedPlan = normalizeBuyerPlanCode(subscription?.plan || "FREE");
  const effectivePlanCode = effectivePlan(subscription);
  const plan = getBuyerPlanConfig(effectivePlanCode);

  return {
    subscription: {
      id: subscription?.id || null,
      storedPlan,
      effectivePlan: effectivePlanCode,
      displayName: plan.label,
      status: subscription?.status || "ACTIVE",
      billingInterval: subscription?.billingInterval || null,
      currentPeriodStart: subscription?.currentPeriodStart || null,
      currentPeriodEnd: subscription?.currentPeriodEnd || null,
      cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd),
      isPaid: effectivePlanCode !== BUYER_PLAN_CODES.FREE,
    },
    entitlements: {
      savedSearchLimit: plan.maxSavedSearches,
      maxActiveShopRequests: plan.maxActiveShopRequests,
      maxMonthlyShopRequests: plan.maxMonthlyShopRequests,
      maxActiveMarketplaceListings: plan.maxActiveMarketplaceListings,
      maxMonthlyMarketplaceListings: plan.maxMonthlyMarketplaceListings,
      maxSellItemPhotos: plan.maxSellItemPhotos,
      maxSellRadiusMiles: plan.maxSellRadiusMiles,
      maxAiListingGenerationsPerMonth: plan.maxAiListingGenerationsPerMonth,
      wishListLimit: plan.wishListLimit,
      favoriteLimit: plan.favoriteLimit,
      comparisonLimit: plan.comparisonLimit,
      alertLevel: plan.alertLevel,
      notificationPriority: plan.notificationPriority,
      aiShoppingEnabled: plan.aiShoppingEnabled,
      aiShoppingMonthlyLimit: plan.aiShoppingMonthlyLimit,
      priceHistoryEnabled: plan.priceHistoryEnabled,
      advancedSearchEnabled: plan.advancedSearchEnabled,
      workspaceLevel: plan.workspaceLevel,
      workspaceCustomizationEnabled: plan.workspaceCustomizationEnabled,
      collectionManagerEnabled: plan.collectionManagerEnabled,
      collectionItemLimit: plan.collectionItemLimit,
      marketIntelligenceLevel: plan.marketIntelligenceLevel,
      conciergeEnabled: plan.conciergeEnabled,
      loyaltyEnabled: plan.loyaltyEnabled,
      referralRewardsEnabled: plan.referralRewardsEnabled,
      earlyInventoryAlertsEnabled: plan.earlyInventoryAlertsEnabled,
      exclusiveDealsLevel: plan.exclusiveDealsLevel,
      supportLevel: plan.supportLevel,
    },
    usage: {
      savedSearches: limitUsage(Number(counts.savedSearches || 0), plan.maxSavedSearches),
      watchlistItems: limitUsage(Number(counts.watchlistItems || 0), plan.maxWatchlistItems),
      activeShopRequests: limitUsage(Number(counts.activeShopRequests || 0), plan.maxActiveShopRequests),
      monthlyShopRequests: limitUsage(Number(counts.monthlyShopRequests || 0), plan.maxMonthlyShopRequests),
      activeMarketplaceListings: limitUsage(Number(counts.activeMarketplaceListings || 0), plan.maxActiveMarketplaceListings),
      monthlyMarketplaceListings: limitUsage(Number(counts.monthlyMarketplaceListings || 0), plan.maxMonthlyMarketplaceListings),
      aiListingGenerations: limitUsage(Number(counts.aiListingGenerations || 0), plan.maxAiListingGenerationsPerMonth),
      wishLists: limitUsage(Number(counts.wishLists || 0), plan.wishListLimit),
      comparisons: limitUsage(Number(counts.comparisons || 0), plan.comparisonLimit),
      collectionItems: limitUsage(Number(counts.collectionItems || 0), plan.collectionItemLimit),
      aiRequests: limitUsage(Number(counts.aiRequests || 0), plan.aiShoppingMonthlyLimit),
      activeAlerts: Number(counts.activeAlerts || 0),
      referralRewards: 0,
      loyaltyPoints: 0,
    },
    implementation: IMPLEMENTATION_STATUS,
    coreCommerce: {
      browse: true,
      buyNow: true,
      offers: true,
      auctions: true,
      orderTracking: true,
      paymentMethods: true,
      shopSubmissions: true,
      marketplaceSelling: true,
    },
  };
}

export async function getBuyerEntitlementsForUser(userId, prismaClient = prisma) {
  const subscription = await prismaClient.buyerSubscription.findUnique({ where: { userId } });
  const effectivePlanCode = effectivePlan(subscription);
  const now = new Date();
  const calendarStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const paidPeriodStart = effectivePlanCode !== BUYER_PLAN_CODES.FREE && subscription?.currentPeriodStart
    ? new Date(subscription.currentPeriodStart)
    : null;
  const monthlyStart = paidPeriodStart && !Number.isNaN(paidPeriodStart.getTime()) ? paidPeriodStart : calendarStart;
  const count = (model, args) => model?.count ? model.count(args) : Promise.resolve(0);
  const [savedSearches, watchlistItems, activeShopRequests, monthlyShopRequests, activeMarketplaceListings, monthlyMarketplaceListings, aiListingGenerations] = await Promise.all([
    count(prismaClient.savedSearch, { where: { userId } }),
    count(prismaClient.watchlist, { where: { userId } }),
    count(prismaClient.buyerItemSubmission, { where: { buyerId: userId, intent: { in: SHOP_CHANNEL_INTENTS }, status: { in: ACTIVE_SHOP_REQUEST_STATUSES } } }),
    count(prismaClient.buyerItemSubmission, { where: { buyerId: userId, intent: { in: SHOP_CHANNEL_INTENTS }, createdAt: { gte: monthlyStart } } }),
    count(prismaClient.marketplaceListing, { where: { sellerUserId: userId, listingType: { in: ["CUSTOMER_TO_CUSTOMER", "CUSTOMER_TO_SHOP"] }, status: { in: ACTIVE_MARKETPLACE_LISTING_STATUSES } } }),
    count(prismaClient.marketplaceListing, { where: { sellerUserId: userId, listingType: { in: ["CUSTOMER_TO_CUSTOMER", "CUSTOMER_TO_SHOP"] }, createdAt: { gte: monthlyStart } } }),
    count(prismaClient.aiListingGeneration, { where: { userId, createdAt: { gte: monthlyStart } } }),
  ]);
  return buildBuyerEntitlements({
    subscription,
    counts: {
      savedSearches,
      watchlistItems,
      activeShopRequests,
      monthlyShopRequests,
      activeMarketplaceListings,
      monthlyMarketplaceListings,
      aiListingGenerations,
      wishLists: watchlistItems > 0 ? 1 : 0,
      activeAlerts: savedSearches,
    },
  });
}

export async function assertBuyerResourceCapacity(userId, resource, prismaClient = prisma) {
  const limitKey = RESOURCE_LIMITS[resource];
  if (!limitKey) throw new Error(`Unknown buyer entitlement resource: ${resource}`);
  const entitlements = await getBuyerEntitlementsForUser(userId, prismaClient);
  const usage = entitlements.usage[resource];
  if (usage?.atLimit) {
    const error = new Error(
      `You have reached the ${entitlements.subscription.displayName} plan limit of ${usage.limit} ${resource === "savedSearches" ? "saved searches" : "watchlist items"}. Upgrade for a higher limit and additional buyer tools.`,
    );
    error.statusCode = 409;
    error.code = "BUYER_PLAN_LIMIT_REACHED";
    error.details = {
      resource,
      planCode: entitlements.subscription.effectivePlan,
      displayName: entitlements.subscription.displayName,
      used: usage.used,
      limit: usage.limit,
      remaining: usage.remaining,
      upgradePath: "/buyer/subscription",
    };
    throw error;
  }
  return entitlements;
}

export function createBuyerPlanLimitError(entitlements, resource, used, limit) {
  const error = new Error(`You have reached the ${entitlements.subscription.displayName} plan limit for ${resource}.`);
  error.statusCode = 409;
  error.code = "BUYER_PLAN_LIMIT_REACHED";
  error.details = { resource, planCode: entitlements.subscription.effectivePlan, displayName: entitlements.subscription.displayName, used, limit, remaining: limit === null ? null : Math.max(limit - used, 0), upgradePath: "/buyer/subscription" };
  return error;
}

export async function assertBuyerSellingCapacity(userId, { resources = [], photoCount, radiusMiles } = {}, prismaClient = prisma) {
  const entitlements = await getBuyerEntitlementsForUser(userId, prismaClient);
  for (const resource of resources) {
    const usage = entitlements.usage[resource];
    if (usage?.atLimit) throw createBuyerPlanLimitError(entitlements, resource, usage.used, usage.limit);
  }
  const attributes = [
    ["sellItemPhotos", Number(photoCount), entitlements.entitlements.maxSellItemPhotos],
    ["sellRadiusMiles", Number(radiusMiles), entitlements.entitlements.maxSellRadiusMiles],
  ];
  for (const [resource, used, limit] of attributes) {
    if (Number.isFinite(used) && limit !== null && used > limit) throw createBuyerPlanLimitError(entitlements, resource, used, limit);
  }
  return entitlements;
}

export const buyerEntitlementImplementationStatus = IMPLEMENTATION_STATUS;
