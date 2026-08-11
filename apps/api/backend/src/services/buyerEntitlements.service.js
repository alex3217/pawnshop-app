import { prisma } from "../lib/prisma.js";
import {
  BUYER_PLAN_CODES,
  getBuyerPlanConfig,
  isBuyerSubscriptionUsable,
  normalizeBuyerPlanCode,
} from "../config/buyerPlans.js";
import { runBuyerAtomicTransaction } from "./buyerAtomicTransaction.service.js";

const RESOURCE_LIMITS = Object.freeze({
  savedSearches: "maxSavedSearches",
  watchlistItems: "maxWatchlistItems",
});

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

export function buildBuyerEntitlements({ subscription = null, stripeCustomerId = null, counts = {} } = {}) {
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
      canManageBilling: Boolean(stripeCustomerId || subscription?.stripeCustomerId),
      canManageSubscription: Boolean(subscription?.stripeSubscriptionId),
    },
    entitlements: {
      savedSearchLimit: plan.maxSavedSearches,
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
    },
  };
}

export async function getBuyerEntitlementsForUser(userId, prismaClient = prisma) {
  const [user, subscription, savedSearches, watchlistItems] = await Promise.all([
    prismaClient.user.findUnique({ where: { id: userId }, select: { stripeCustomerId: true } }),
    prismaClient.buyerSubscription.findUnique({ where: { userId } }),
    prismaClient.savedSearch.count({ where: { userId } }),
    prismaClient.watchlist.count({ where: { userId } }),
  ]);
  return buildBuyerEntitlements({
    subscription,
    stripeCustomerId: user?.stripeCustomerId,
    counts: {
      savedSearches,
      watchlistItems,
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
      upgradePath: "/buyer/subscription",
    };
    throw error;
  }
  return entitlements;
}

export async function createSavedSearchWithinCapacity({ userId, query, prismaClient = prisma }) {
  return runBuyerAtomicTransaction({
    prismaClient,
    lockKey: `buyer-resources:${userId}`,
    operation: async (transaction) => {
      await assertBuyerResourceCapacity(userId, "savedSearches", transaction);
      return transaction.savedSearch.create({ data: { userId, query } });
    },
  });
}

export async function addWatchlistItemWithinCapacity({
  userId,
  itemId,
  include,
  prismaClient = prisma,
}) {
  return runBuyerAtomicTransaction({
    prismaClient,
    lockKey: `buyer-resources:${userId}`,
    operation: async (transaction) => {
      const where = { userId_itemId: { userId, itemId } };
      const existing = await transaction.watchlist.findUnique({ where, include });
      if (existing) return existing;
      await assertBuyerResourceCapacity(userId, "watchlistItems", transaction);
      return transaction.watchlist.upsert({
        where,
        update: {},
        create: { userId, itemId },
        include,
      });
    },
  });
}

export const buyerEntitlementImplementationStatus = IMPLEMENTATION_STATUS;
