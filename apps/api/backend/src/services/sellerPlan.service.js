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

function getEffectivePlanCode(shop) {
  const storedPlan = normalizeStoredPlan(shop);
  const subscriptionStatus = normalizeStoredSubscriptionStatus(shop);

  if (storedPlan === DEFAULT_SELLER_PLAN) {
    return DEFAULT_SELLER_PLAN;
  }

  return isSubscriptionUsable(subscriptionStatus)
    ? storedPlan
    : DEFAULT_SELLER_PLAN;
}

function getCountedListingStatuses() {
  return uniqueNonEmptyStrings(ACTIVE_LISTING_STATUSES);
}

function buildEntitlements(shop, activeListingCount) {
  const storedPlan = normalizeStoredPlan(shop);
  const normalizedStatus = normalizeStoredSubscriptionStatus(shop);
  const effectivePlanCode = getEffectivePlanCode(shop);
  const plan = getSellerPlanSummary(effectivePlanCode);

  const countedStatuses = getCountedListingStatuses();
  const safeActiveListingCount = toSafeNonNegativeInteger(activeListingCount);
  const isUnlimitedListings = isUnlimited(plan.maxActiveListings);
  const maxActiveListings = isUnlimitedListings
    ? plan.maxActiveListings
    : toSafeNonNegativeInteger(plan.maxActiveListings);

  return {
    shopId: shop.id,
    shopName: shop.name || null,
    ownerId: shop.ownerId || null,

    subscription: {
      storedPlan,
      effectivePlan: effectivePlanCode,
      status: normalizedStatus,
      isUsable: isSubscriptionUsable(normalizedStatus),
      isPaid: Boolean(plan.isPaid),
      isFree: Boolean(plan.isFree),
      rank: Number(plan.rank || 0),
      label: plan.label,
      currentPeriodEnd: shop.subscriptionCurrentPeriodEnd || null,
      cancelAtPeriodEnd: Boolean(shop.cancelAtPeriodEnd),
      stripeCustomerId: shop.stripeCustomerId || null,
      stripeSubscriptionId: shop.stripeSubscriptionId || null,
    },

    limits: {
      maxActiveListings,
      maxLocations: plan.maxLocations,
      maxStaffUsers: plan.maxStaffUsers,
    },

    features: {
      canCreateAuctions: Boolean(plan.canCreateAuctions),
      canFeatureListings: Boolean(plan.canFeatureListings),
      analyticsLevel: plan.analyticsLevel,
    },

    billing: {
      commissionBps: toSafeNonNegativeInteger(plan.commissionBps),
      commissionPercent: Number(plan.commissionPercent || 0),
      monthlyPriceCents: toSafeNonNegativeInteger(plan.monthlyPriceCents),
      yearlyPriceCents: toSafeNonNegativeInteger(plan.yearlyPriceCents),
      annualSavingsCents: toSafeNonNegativeInteger(plan.annualSavingsCents),
    },

    usage: {
      activeListingCount: safeActiveListingCount,
      countedStatuses,
      remainingActiveListings: isUnlimitedListings
        ? null
        : Math.max(maxActiveListings - safeActiveListingCount, 0),
      isUnlimitedListings,
    },
  };
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

export async function getSellerEntitlementsForShop(shopId) {
  const { shop, activeListingCount } = await getSellerPlanSnapshot(shopId);
  return buildEntitlements(shop, activeListingCount);
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