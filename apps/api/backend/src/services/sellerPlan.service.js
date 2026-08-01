// File: apps/api/backend/src/services/sellerPlan.service.js

import { prisma } from "../lib/prisma.js";
import {
  DEFAULT_SELLER_PLAN,
  DEFAULT_SUBSCRIPTION_STATUS,
  getSellerPlanSummary,
  isSubscriptionUsable,
  isUnlimited,
  normalizeSellerPlanCode,
  normalizeSubscriptionStatus,
} from "../config/sellerPlans.js";
import { getSellerPlanCatalog } from "./platformPricingCatalog.service.js";

/**
 * Statuses that consume a listing slot for plan-limit checks.
 *
 * Current Prisma enum:
 *   AVAILABLE | PENDING | SOLD
 *
 * SOLD should not count against plan capacity.
 *
 * When ItemStatus grows later, keep only statuses that represent a live listing
 * and exclude historical / non-public states such as SOLD, ARCHIVED, DRAFT, etc.
 */
const ACTIVE_LISTING_STATUSES = Object.freeze(["AVAILABLE", "PENDING"]);

const SHOP_PLAN_SELECT = Object.freeze({
  id: true,
  name: true,
  ownerId: true,
  isDeleted: true,
  subscriptionPlan: true,
  subscriptionStatus: true,
  subscriptionCurrentPeriodEnd: true,
  cancelAtPeriodEnd: true,
  stripeCustomerId: true,
  stripeSubscriptionId: true,
});

export class PlanRestrictionError extends Error {
  constructor(message, code = "PLAN_RESTRICTED", statusCode = 403, details = {}) {
    super(message);
    this.name = "PlanRestrictionError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function normalizeTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueNonEmptyStrings(values) {
  return [...new Set((values || []).map(normalizeTrimmedString).filter(Boolean))];
}

function toSafeNonNegativeInteger(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.floor(num);
}

function normalizeShopId(shopId) {
  const safeShopId = normalizeTrimmedString(shopId);

  if (!safeShopId) {
    throw createPlanError("Shop id is required.", "SHOP_ID_REQUIRED", 400, {
      shopId: shopId || null,
    });
  }

  return safeShopId;
}

function normalizeStoredPlan(shop) {
  return normalizeSellerPlanCode(
    normalizeTrimmedString(shop?.subscriptionPlan) || DEFAULT_SELLER_PLAN
  );
}

function normalizeStoredSubscriptionStatus(shop) {
  return normalizeSubscriptionStatus(
    normalizeTrimmedString(shop?.subscriptionStatus) ||
      DEFAULT_SUBSCRIPTION_STATUS
  );
}

function createPlanError(
  message,
  code = "PLAN_RESTRICTED",
  statusCode = 403,
  details = {}
) {
  return new PlanRestrictionError(message, code, statusCode, details);
}

function isExpiredSellerTrial(shop, now = Date.now()) {
  const subscriptionStatus = normalizeStoredSubscriptionStatus(shop);

  if (subscriptionStatus !== "TRIALING") {
    return false;
  }

  const periodEnd = new Date(
    shop?.subscriptionCurrentPeriodEnd || "",
  ).getTime();

  return Number.isFinite(periodEnd) && periodEnd <= now;
}

function isShopSubscriptionUsable(shop) {
  const subscriptionStatus = normalizeStoredSubscriptionStatus(shop);

  return (
    isSubscriptionUsable(subscriptionStatus) &&
    !isExpiredSellerTrial(shop)
  );
}

function getEffectivePlanCode(shop) {
  const storedPlan = normalizeStoredPlan(shop);

  if (storedPlan === DEFAULT_SELLER_PLAN) {
    return DEFAULT_SELLER_PLAN;
  }

  return isShopSubscriptionUsable(shop)
    ? storedPlan
    : DEFAULT_SELLER_PLAN;
}

function getCountedListingStatuses() {
  return uniqueNonEmptyStrings(ACTIVE_LISTING_STATUSES);
}

function buildEntitlements(
  shop,
  activeListingCount,
  planOverride = null
) {
  const storedPlan = normalizeStoredPlan(shop);
  const normalizedStatus =
    normalizeStoredSubscriptionStatus(shop);

  const effectivePlanCode =
    getEffectivePlanCode(shop);

  const fallbackPlan =
    getSellerPlanSummary(effectivePlanCode);

  const overrideMatches =
    planOverride &&
    normalizeSellerPlanCode(planOverride.code) ===
      effectivePlanCode;

  const plan = overrideMatches
    ? {
        ...fallbackPlan,
        ...planOverride,
        features: Array.isArray(planOverride.features)
          ? [...planOverride.features]
          : [...(fallbackPlan.features || [])],
      }
    : fallbackPlan;

  const countedStatuses =
    getCountedListingStatuses();

  const safeActiveListingCount =
    toSafeNonNegativeInteger(activeListingCount);

  const standardListingLimit =
    isUnlimited(plan.maxActiveListings)
      ? null
      : toSafeNonNegativeInteger(
          plan.maxActiveListings
        );

  const rawTrialListingLimit =
    Object.prototype.hasOwnProperty.call(
      plan,
      "trialMaxActiveListings"
    )
      ? plan.trialMaxActiveListings
      : plan.maxActiveListings;

  const trialListingLimit =
    isUnlimited(rawTrialListingLimit)
      ? null
      : toSafeNonNegativeInteger(
          rawTrialListingLimit
        );

  const usingTrialLimit =
    normalizedStatus === "TRIALING" &&
    !isExpiredSellerTrial(shop);

  const appliedListingLimit =
    usingTrialLimit
      ? trialListingLimit
      : standardListingLimit;

  const isUnlimitedListings =
    isUnlimited(appliedListingLimit);

  const maxActiveListings =
    isUnlimitedListings
      ? null
      : toSafeNonNegativeInteger(
          appliedListingLimit
        );

  const planCapabilities = {
    FREE: {
      qrCampaignLimit: 1, marketingLevel: "basic", businessGrowthLevel: "basic",
      businessCoachLevel: "limited", shopHealthEnabled: true, digitalDisplaysEnabled: false,
      multiLocationCampaignsEnabled: false, referralAnalyticsEnabled: false,
      benchmarkingEnabled: false, apiAccessEnabled: false, supportLevel: "standard",
    },
    PRO: {
      qrCampaignLimit: 10, marketingLevel: "basic", businessGrowthLevel: "standard",
      businessCoachLevel: "rules", shopHealthEnabled: true, digitalDisplaysEnabled: false,
      multiLocationCampaignsEnabled: false, referralAnalyticsEnabled: false,
      benchmarkingEnabled: false, apiAccessEnabled: false, supportLevel: "standard",
    },
    PREMIUM: {
      qrCampaignLimit: null, marketingLevel: "advanced", businessGrowthLevel: "advanced",
      businessCoachLevel: "rules", shopHealthEnabled: true, digitalDisplaysEnabled: true,
      multiLocationCampaignsEnabled: true, referralAnalyticsEnabled: true,
      benchmarkingEnabled: true, apiAccessEnabled: false, supportLevel: "priority",
    },
    ULTRA: {
      qrCampaignLimit: null, marketingLevel: "enterprise", businessGrowthLevel: "enterprise",
      businessCoachLevel: "rules", shopHealthEnabled: true, digitalDisplaysEnabled: true,
      multiLocationCampaignsEnabled: true, referralAnalyticsEnabled: true,
      benchmarkingEnabled: true, apiAccessEnabled: true, supportLevel: "enterprise",
    },
  }[effectivePlanCode] || {};

  return {
    shopId: shop.id,
    shopName: shop.name || null,
    ownerId: shop.ownerId || null,

    subscription: {
      storedPlan,
      effectivePlan: effectivePlanCode,
      status: normalizedStatus,
      isUsable: isShopSubscriptionUsable(shop),
      isPaid: Boolean(plan.isPaid),
      isFree: Boolean(plan.isFree),
      rank: Number(plan.rank || 0),
      label: storedPlan === "PREMIUM" ? "Plus" : plan.label,
      currentPeriodEnd:
        shop.subscriptionCurrentPeriodEnd || null,
      cancelAtPeriodEnd:
        Boolean(shop.cancelAtPeriodEnd),
      stripeCustomerId:
        shop.stripeCustomerId || null,
      stripeSubscriptionId:
        shop.stripeSubscriptionId || null,
    },

    limits: {
      maxActiveListings,
      standardMaxActiveListings:
        standardListingLimit,
      trialMaxActiveListings:
        trialListingLimit,
      listingLimitSource:
        usingTrialLimit ? "TRIAL" : "PLAN",
      maxLocations: plan.maxLocations,
      maxStaffUsers: plan.maxStaffUsers,
      qrCampaignLimit: planCapabilities.qrCampaignLimit,
    },

    features: {
      canCreateAuctions:
        Boolean(plan.canCreateAuctions),
      canFeatureListings:
        Boolean(plan.canFeatureListings),
      analyticsLevel: plan.analyticsLevel,
      marketingLevel: planCapabilities.marketingLevel,
      businessGrowthLevel: planCapabilities.businessGrowthLevel,
      businessCoachLevel: planCapabilities.businessCoachLevel,
      shopHealthEnabled: planCapabilities.shopHealthEnabled,
      digitalDisplaysEnabled: planCapabilities.digitalDisplaysEnabled,
      multiLocationCampaignsEnabled: planCapabilities.multiLocationCampaignsEnabled,
      referralAnalyticsEnabled: planCapabilities.referralAnalyticsEnabled,
      benchmarkingEnabled: planCapabilities.benchmarkingEnabled,
      apiAccessEnabled: planCapabilities.apiAccessEnabled,
      supportLevel: planCapabilities.supportLevel,
    },

    billing: {
      commissionBps:
        toSafeNonNegativeInteger(
          plan.commissionBps
        ),
      commissionPercent:
        Number(plan.commissionPercent || 0),
      monthlyPriceCents:
        toSafeNonNegativeInteger(
          plan.monthlyPriceCents
        ),
      yearlyPriceCents:
        toSafeNonNegativeInteger(
          plan.yearlyPriceCents
        ),
      annualSavingsCents:
        toSafeNonNegativeInteger(
          plan.annualSavingsCents
        ),
    },

    usage: {
      activeListingCount:
        safeActiveListingCount,
      countedStatuses,
      remainingActiveListings:
        isUnlimitedListings
          ? null
          : Math.max(
              maxActiveListings -
                safeActiveListingCount,
              0
            ),
      isUnlimitedListings,
    },

    implementation: {
      enforced: ["activeListings", "auctions", "featuredListings", "qrCampaigns"],
      implemented: ["analytics", "marketingCenter", "businessGrowth", "shopHealth", "ruleBasedBusinessCoach"],
      planned: ["digitalDisplays", "benchmarking", "apiAccess", "generativeBusinessCoach"],
    },
  };
}

export function assertQrCampaignCapacity(entitlements, activeCampaignCount, requestedSlots = 1) {
  const limit = entitlements?.limits?.qrCampaignLimit;
  if (limit === null) return entitlements;
  const used = toSafeNonNegativeInteger(activeCampaignCount);
  const requested = Math.max(toSafeNonNegativeInteger(requestedSlots), 1);
  if (used + requested > toSafeNonNegativeInteger(limit)) {
    throw createPlanError(
      `Plan limit reached. ${entitlements.subscription.effectivePlan} allows ${limit} active QR campaigns.`,
      "PLAN_QR_CAMPAIGN_LIMIT_REACHED",
      403,
      { limit, used, requested, reason: "ACTIVE_QR_CAMPAIGN_LIMIT_REACHED" },
    );
  }
  return entitlements;
}

export async function assertCanCreateQrCampaignForShop(shopId, requestedSlots = 1) {
  const [entitlements, activeCampaignCount] = await Promise.all([
    getSellerEntitlementsForShop(shopId),
    prisma.shopMarketingCampaign.count({ where: { shopId: normalizeShopId(shopId), isActive: true } }),
  ]);
  return assertQrCampaignCapacity(entitlements, activeCampaignCount, requestedSlots);
}

const MARKETING_TEMPLATE_MINIMUM_PLAN = Object.freeze({
  STOREFRONT_POSTER: "FREE",
  WINDOW_24_7_POSTER: "PREMIUM",
  COUNTER_SIGN: "FREE",
  RECEIPT_INSERT: "PREMIUM",
  PRODUCT_DISPLAY_CARD: "PRO",
  NEW_ARRIVALS_FLYER: "PRO",
  AUCTION_FLYER: "PRO",
  SELL_OR_PAWN_FLYER: "PRO",
  REVIEW_REQUEST_CARD: "PREMIUM",
  REFERRAL_CARD: "PRO",
});

const MARKETING_PLAN_RANK = Object.freeze({ FREE: 0, PRO: 1, PREMIUM: 2, ULTRA: 3 });

export function getMarketingTemplateAccess(entitlements, templateType) {
  const normalized = String(templateType || "").trim().toUpperCase();
  const minimumPlan = MARKETING_TEMPLATE_MINIMUM_PLAN[normalized];
  if (!minimumPlan) return { known: false, allowed: false, minimumPlan: null };
  const effectivePlan = String(entitlements?.subscription?.effectivePlan || "FREE").toUpperCase();
  return {
    known: true,
    allowed: (MARKETING_PLAN_RANK[effectivePlan] ?? 0) >= MARKETING_PLAN_RANK[minimumPlan],
    minimumPlan,
    effectivePlan,
  };
}

export async function assertMarketingTemplateAccessForShop(shopId, templateType) {
  const entitlements = await getSellerEntitlementsForShop(shopId);
  const access = getMarketingTemplateAccess(entitlements, templateType);
  if (!access.known) throw createPlanError("Unknown marketing template.", "MARKETING_TEMPLATE_NOT_FOUND", 404);
  if (!access.allowed) throw createPlanError(
    `${access.minimumPlan === "PREMIUM" ? "Plus" : access.minimumPlan} is required for this printable template.`,
    "MARKETING_TEMPLATE_PLAN_RESTRICTED",
    403,
    access,
  );
  return { entitlements, access };
}

export const marketingTemplateMinimumPlans = MARKETING_TEMPLATE_MINIMUM_PLAN;

export async function assertCanAddStaffForShop(shopId) {
  const [entitlements, used] = await Promise.all([
    getSellerEntitlementsForShop(shopId),
    prisma.staff.count({ where: { shopId: normalizeShopId(shopId), status: { in: ["INVITED", "ACTIVE"] } } }),
  ]);
  const limit = entitlements.limits.maxStaffUsers;
  if (limit !== null && used >= limit) throw createPlanError(`Plan limit reached. ${entitlements.subscription.effectivePlan} allows ${limit} staff accounts.`, "PLAN_STAFF_LIMIT_REACHED", 403, { limit, used, reason: "STAFF_LIMIT_REACHED" });
  return entitlements;
}

export async function assertCanAddLocationForOwner(ownerId) {
  const shops = await prisma.pawnShop.findMany({ where: { ownerId: normalizeTrimmedString(ownerId), isDeleted: false }, select: { id: true } });
  if (shops.length === 0) return null;
  const entitlements = await getSellerEntitlementsForShop(shops[0].id);
  const limit = entitlements.limits.maxLocations;
  if (limit !== null && shops.length >= limit) throw createPlanError(`Plan limit reached. ${entitlements.subscription.effectivePlan} allows ${limit} locations.`, "PLAN_LOCATION_LIMIT_REACHED", 403, { limit, used: shops.length, reason: "LOCATION_LIMIT_REACHED" });
  return entitlements;
}

function assertFeatureEnabled(
  entitlements,
  featureKey,
  message,
  code,
  reason
) {
  if (!Object.prototype.hasOwnProperty.call(entitlements.features, featureKey)) {
    throw createPlanError(
      `Unknown seller-plan feature "${featureKey}".`,
      "PLAN_FEATURE_UNKNOWN",
      500,
      {
        featureKey,
        availableFeatures: Object.keys(entitlements.features || {}),
      }
    );
  }

  if (!entitlements.features[featureKey]) {
    throw createPlanError(message, code, 403, {
      ...entitlements,
      reason,
      featureKey,
    });
  }

  return entitlements;
}

function assertListingCapacity(entitlements, requestedSlots = 1) {
  const safeRequestedSlots = Math.max(toSafeNonNegativeInteger(requestedSlots), 1);

  if (entitlements.usage.isUnlimitedListings) {
    return entitlements;
  }

  const maxActiveListings = toSafeNonNegativeInteger(
    entitlements.limits.maxActiveListings
  );
  const projectedActiveListingCount =
    entitlements.usage.activeListingCount + safeRequestedSlots;

  if (projectedActiveListingCount > maxActiveListings) {
    throw createPlanError(
      `Plan limit reached. ${entitlements.subscription.effectivePlan} allows ${maxActiveListings} active listings.`,
      "PLAN_LIMIT_REACHED",
      403,
      {
        ...entitlements,
        requestedSlots: safeRequestedSlots,
        projectedActiveListingCount,
        reason: "ACTIVE_LISTING_LIMIT_REACHED",
      }
    );
  }

  return entitlements;
}

export async function getShopForPlanChecks(shopId) {
  const safeShopId = normalizeShopId(shopId);

  const shop = await prisma.pawnShop.findUnique({
    where: { id: safeShopId },
    select: SHOP_PLAN_SELECT,
  });

  if (!shop || shop.isDeleted) {
    throw createPlanError("Shop not found.", "SHOP_NOT_FOUND", 404, {
      shopId: safeShopId,
    });
  }

  return shop;
}

export async function countActiveListingsForShop(shopId) {
  const safeShopId = normalizeShopId(shopId);
  const countedStatuses = getCountedListingStatuses();

  return prisma.item.count({
    where: {
      pawnShopId: safeShopId,
      isDeleted: false,
      status: {
        in: countedStatuses,
      },
    },
  });
}

export async function getSellerPlanSnapshot(shopId) {
  const safeShopId = normalizeShopId(shopId);
  const countedStatuses = getCountedListingStatuses();

  const [shop, activeListingCount] = await prisma.$transaction([
    prisma.pawnShop.findUnique({
      where: { id: safeShopId },
      select: SHOP_PLAN_SELECT,
    }),
    prisma.item.count({
      where: {
        pawnShopId: safeShopId,
        isDeleted: false,
        status: {
          in: countedStatuses,
        },
      },
    }),
  ]);

  if (!shop || shop.isDeleted) {
    throw createPlanError("Shop not found.", "SHOP_NOT_FOUND", 404, {
      shopId: safeShopId,
    });
  }

  return {
    shop,
    activeListingCount,
  };
}

export async function getSellerEntitlementsForShop(
  shopId
) {
  const [
    { shop, activeListingCount },
    catalog,
  ] = await Promise.all([
    getSellerPlanSnapshot(shopId),
    getSellerPlanCatalog(),
  ]);

  const effectivePlanCode =
    getEffectivePlanCode(shop);

  const planOverride =
    catalog.find(
      (candidate) =>
        normalizeSellerPlanCode(candidate?.code) ===
        effectivePlanCode
    ) || null;

  return buildEntitlements(
    shop,
    activeListingCount,
    planOverride
  );
}

export async function assertCanCreateListingForShop(
  shopId,
  requestedSlots = 1
) {
  const entitlements = await getSellerEntitlementsForShop(shopId);
  return assertListingCapacity(entitlements, requestedSlots);
}

export async function assertCanCreateAuctionForShop(shopId) {
  const entitlements = await getSellerEntitlementsForShop(shopId);

  return assertFeatureEnabled(
    entitlements,
    "canCreateAuctions",
    `${entitlements.subscription.effectivePlan} plan does not include auction creation.`,
    "PLAN_AUCTIONS_DISABLED",
    "AUCTIONS_NOT_INCLUDED"
  );
}

export async function assertCanFeatureListingForShop(shopId) {
  const entitlements = await getSellerEntitlementsForShop(shopId);

  return assertFeatureEnabled(
    entitlements,
    "canFeatureListings",
    `${entitlements.subscription.effectivePlan} plan does not include featured listings.`,
    "PLAN_FEATURE_DISABLED",
    "FEATURED_LISTINGS_NOT_INCLUDED"
  );
}

export {
  ACTIVE_LISTING_STATUSES,
  SHOP_PLAN_SELECT,
  assertFeatureEnabled,
  assertListingCapacity,
  buildEntitlements,
  createPlanError,
  getCountedListingStatuses,
  getEffectivePlanCode,
  normalizeShopId,
  normalizeStoredPlan,
  normalizeStoredSubscriptionStatus,
};
