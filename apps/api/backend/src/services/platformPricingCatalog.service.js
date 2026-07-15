// File: apps/api/backend/src/services/platformPricingCatalog.service.js

import { prisma } from "../lib/prisma.js";
import { listBuyerPlans } from "../config/buyerPlans.js";
import {
  SELLER_PLANS,
  getPaidSellerPlanCodes,
  getSellerPlanCodes,
} from "../config/sellerPlans.js";

export const BUYER_PLAN_CODES = Object.freeze(
  listBuyerPlans().map((plan) => plan.code),
);

function clonePlan(plan) {
  return {
    ...plan,
    features: Array.isArray(plan.features) ? [...plan.features] : [],
  };
}

function normalizeRuleKey(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeOptionalText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function toNumberOrFallback(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableNonNegativeIntegerOrFallback(value, fallback) {
  if (value === null) return null;
  if (value === undefined || value === "") return fallback;

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function toBooleanOrFallback(value, fallback) {
  if (typeof value === "boolean") return value;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }

  return fallback;
}

function toStringOrFallback(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function toFeatureListOrFallback(value, fallback) {
  if (!Array.isArray(value)) {
    return Array.isArray(fallback) ? [...fallback] : [];
  }

  const features = value
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  return features.length
    ? features
    : Array.isArray(fallback)
      ? [...fallback]
      : [];
}

function getRuleMetadata(rule) {
  if (
    rule?.metadata &&
    typeof rule.metadata === "object" &&
    !Array.isArray(rule.metadata)
  ) {
    return rule.metadata;
  }

  return {};
}

function calculateAnnualSavings(monthlyPriceCents, yearlyPriceCents) {
  const monthly = Number(monthlyPriceCents || 0);
  const yearly = Number(yearlyPriceCents || 0);

  if (monthly <= 0 || yearly <= 0) return 0;

  return Math.max(monthly * 12 - yearly, 0);
}

function isRuleCurrentlyEffective(rule, now = new Date()) {
  const start = rule?.effectiveStartAt
    ? new Date(rule.effectiveStartAt)
    : null;

  const end = rule?.effectiveEndAt
    ? new Date(rule.effectiveEndAt)
    : null;

  if (start && !Number.isNaN(start.getTime()) && start > now) {
    return false;
  }

  if (end && !Number.isNaN(end.getTime()) && end < now) {
    return false;
  }

  return true;
}

async function getActivePricingRuleMap() {
  if (!prisma?.platformPricingRule) return new Map();

  try {
    const rows = await prisma.platformPricingRule.findMany({
      where: {
        status: "ACTIVE",
      },
      select: {
        key: true,
        amountCents: true,
        percentBps: true,
        currency: true,
        stripePriceId: true,
        effectiveStartAt: true,
        effectiveEndAt: true,
        metadata: true,
      },
    });

    const effectiveRows = rows.filter((row) =>
      isRuleCurrentlyEffective(row),
    );

    return new Map(
      effectiveRows.map((row) => [
        normalizeRuleKey(row.key),
        row,
      ]),
    );
  } catch (error) {
    if (
      error?.code === "P2021" ||
      /PlatformPricingRule/i.test(error?.message || "")
    ) {
      console.warn(
        "[pricing-catalog] PlatformPricingRule unavailable; using fallback catalog.",
      );

      return new Map();
    }

    throw error;
  }
}

function applyBuyerPlanPricingOverrides(plans, ruleMap) {
  return plans.map((plan) => {
    const code = normalizeRuleKey(plan.code);
    const monthlyRule = ruleMap.get(`buyer_plan_${code}_monthly`);
    const yearlyRule = ruleMap.get(`buyer_plan_${code}_yearly`);

    return {
      ...plan,
      monthlyPriceCents: toNumberOrFallback(
        monthlyRule?.amountCents,
        plan.monthlyPriceCents,
      ),
      yearlyPriceCents: toNumberOrFallback(
        yearlyRule?.amountCents,
        plan.yearlyPriceCents,
      ),
    };
  });
}

export async function getBuyerPlanCatalog() {
  const fallback = listBuyerPlans().map(clonePlan);
  const ruleMap = await getActivePricingRuleMap();

  return applyBuyerPlanPricingOverrides(fallback, ruleMap);
}

export function getFallbackBuyerPlanCatalog() {
  return listBuyerPlans().map(clonePlan);
}

function applySellerPlanPricingOverrides(plans, ruleMap) {
  return plans.map((plan) => {
    const code = normalizeRuleKey(plan.code);

    const monthlyRule =
      ruleMap.get(`seller_plan_${code}_monthly`);

    const yearlyRule =
      ruleMap.get(`seller_plan_${code}_yearly`);

    const commissionRule =
      ruleMap.get(`seller_plan_${code}_commission_bps`);

    const limitsRule =
      ruleMap.get(`seller_plan_${code}_limits`);

    const metadata = getRuleMetadata(limitsRule);

    const monthlyPriceCents = toNumberOrFallback(
      monthlyRule?.amountCents,
      plan.monthlyPriceCents,
    );

    const yearlyPriceCents = toNumberOrFallback(
      yearlyRule?.amountCents,
      plan.yearlyPriceCents,
    );

    const commissionBps = toNumberOrFallback(
      commissionRule?.percentBps,
      plan.commissionBps,
    );

    const maxActiveListings =
      toNullableNonNegativeIntegerOrFallback(
        metadata.maxActiveListings,
        plan.maxActiveListings,
      );

    const trialMaxActiveListings =
      toNullableNonNegativeIntegerOrFallback(
        metadata.trialMaxActiveListings,
        plan.trialMaxActiveListings ??
          maxActiveListings,
      );

    return {
      ...plan,

      label: toStringOrFallback(
        metadata.label,
        plan.label,
      ),

      description: toStringOrFallback(
        metadata.description,
        plan.description || "",
      ),

      monthlyPriceCents,
      yearlyPriceCents,

      maxActiveListings,
      trialMaxActiveListings,

      maxLocations:
        toNullableNonNegativeIntegerOrFallback(
          metadata.maxLocations,
          plan.maxLocations,
        ),

      maxStaffUsers:
        toNullableNonNegativeIntegerOrFallback(
          metadata.maxStaffUsers,
          plan.maxStaffUsers,
        ),

      canCreateAuctions: toBooleanOrFallback(
        metadata.canCreateAuctions,
        Boolean(plan.canCreateAuctions),
      ),

      canFeatureListings: toBooleanOrFallback(
        metadata.canFeatureListings,
        Boolean(plan.canFeatureListings),
      ),

      analyticsLevel: toStringOrFallback(
        metadata.analyticsLevel,
        plan.analyticsLevel || "none",
      ).toLowerCase(),

      features: toFeatureListOrFallback(
        metadata.features,
        plan.features,
      ),

      commissionBps,
      commissionPercent: Number(
        (Number(commissionBps || 0) / 100).toFixed(2),
      ),

      annualSavingsCents: calculateAnnualSavings(
        monthlyPriceCents,
        yearlyPriceCents,
      ),

      currency:
        normalizeOptionalText(monthlyRule?.currency) ||
        normalizeOptionalText(yearlyRule?.currency) ||
        "USD",

      stripeMonthlyPriceId:
        normalizeOptionalText(monthlyRule?.stripePriceId) ||
        normalizeOptionalText(
          metadata.stripeMonthlyPriceId,
        ),

      stripeYearlyPriceId:
        normalizeOptionalText(yearlyRule?.stripePriceId) ||
        normalizeOptionalText(
          metadata.stripeYearlyPriceId,
        ),
    };
  });
}

export async function getSellerPlanCatalog() {
  const planCodes = getSellerPlanCodes();

  const fallback = planCodes.map((code, index) => {
    const plan = SELLER_PLANS[code];

    return {
      code: plan.code,
      label: plan.label,
      monthlyPriceCents:
        Number(plan.monthlyPriceCents || 0),
      yearlyPriceCents:
        Number(plan.yearlyPriceCents || 0),

      maxActiveListings:
        plan.maxActiveListings === null
          ? null
          : Number(plan.maxActiveListings || 0),

      trialMaxActiveListings:
        plan.trialMaxActiveListings === null
          ? null
          : Number(
              plan.trialMaxActiveListings ??
                plan.maxActiveListings ??
                0,
            ),

      maxLocations:
        plan.maxLocations === null
          ? null
          : Number(plan.maxLocations || 0),

      maxStaffUsers:
        plan.maxStaffUsers === null
          ? null
          : Number(plan.maxStaffUsers || 0),

      canCreateAuctions:
        Boolean(plan.canCreateAuctions),

      canFeatureListings:
        Boolean(plan.canFeatureListings),

      analyticsLevel:
        plan.analyticsLevel || "none",

      commissionBps:
        Number(plan.commissionBps || 0),

      commissionPercent:
        Number(
          (
            Number(plan.commissionBps || 0) / 100
          ).toFixed(2),
        ),

      annualSavingsCents: calculateAnnualSavings(
        plan.monthlyPriceCents,
        plan.yearlyPriceCents,
      ),

      features:
        Array.isArray(plan.features)
          ? [...plan.features]
          : [],

      isPaid:
        getPaidSellerPlanCodes().includes(plan.code),

      isFree:
        !getPaidSellerPlanCodes().includes(plan.code),

      rank: index,

      stripeMonthlyPriceId: null,
      stripeYearlyPriceId: null,
      currency: "USD",
    };
  });

  const ruleMap = await getActivePricingRuleMap();

  return applySellerPlanPricingOverrides(
    fallback,
    ruleMap,
  );
}
