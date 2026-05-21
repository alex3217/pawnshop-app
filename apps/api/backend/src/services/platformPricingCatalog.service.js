// File: apps/api/backend/src/services/platformPricingCatalog.service.js

import { prisma } from "../lib/prisma.js";
import {
  SELLER_PLANS,
  getPaidSellerPlanCodes,
  getSellerPlanCodes,
} from "../config/sellerPlans.js";

const FALLBACK_BUYER_PLAN_CATALOG = Object.freeze([
  {
    code: "FREE",
    label: "Free",
    monthlyPriceCents: 0,
    yearlyPriceCents: 0,
    features: ["Browse marketplace", "Watchlist", "Saved searches"],
  },
  {
    code: "PLUS",
    label: "Plus",
    monthlyPriceCents: 999,
    yearlyPriceCents: 9990,
    features: ["Everything in Free", "Priority alerts", "Enhanced saved searches"],
  },
  {
    code: "PREMIUM",
    label: "Premium",
    monthlyPriceCents: 1999,
    yearlyPriceCents: 19990,
    features: ["Everything in Plus", "Advanced notifications", "Priority support"],
  },
  {
    code: "ULTRA",
    label: "Ultra",
    monthlyPriceCents: 2999,
    yearlyPriceCents: 29990,
    features: ["Everything in Premium", "VIP access features", "Early feature access"],
  },
]);

export const BUYER_PLAN_CODES = Object.freeze(
  FALLBACK_BUYER_PLAN_CATALOG.map((plan) => plan.code),
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

function toNumberOrFallback(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function getActivePricingRuleMap() {
  if (!prisma?.platformPricingRule) return new Map();

  try {
    const rows = await prisma.platformPricingRule.findMany({
      where: { status: "ACTIVE" },
      select: {
        key: true,
        amountCents: true,
        percentBps: true,
        metadata: true,
      },
    });

    return new Map(rows.map((row) => [normalizeRuleKey(row.key), row]));
  } catch (error) {
    // Safe fallback while Neon or older DBs may not have PlatformPricingRule yet.
    if (error?.code === "P2021" || /PlatformPricingRule/i.test(error?.message || "")) {
      console.warn("[pricing-catalog] PlatformPricingRule unavailable; using fallback catalog.");
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
  const fallback = FALLBACK_BUYER_PLAN_CATALOG.map(clonePlan);
  const ruleMap = await getActivePricingRuleMap();

  return applyBuyerPlanPricingOverrides(fallback, ruleMap);
}

export function getFallbackBuyerPlanCatalog() {
  return FALLBACK_BUYER_PLAN_CATALOG.map(clonePlan);
}


function applySellerPlanPricingOverrides(plans, ruleMap) {
  return plans.map((plan) => {
    const code = normalizeRuleKey(plan.code);
    const monthlyRule = ruleMap.get(`seller_plan_${code}_monthly`);
    const yearlyRule = ruleMap.get(`seller_plan_${code}_yearly`);
    const commissionRule = ruleMap.get(`seller_plan_${code}_commission_bps`);

    const commissionBps = toNumberOrFallback(
      commissionRule?.percentBps,
      plan.commissionBps,
    );

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
      commissionBps,
      commissionPercent: Number((Number(commissionBps || 0) / 100).toFixed(2)),
    };
  });
}

export async function getSellerPlanCatalog() {
  const fallback = getSellerPlanCodes().map((code) => {
    const plan = SELLER_PLANS[code];

    return {
      code: plan.code,
      label: plan.label,
      monthlyPriceCents: Number(plan.monthlyPriceCents || 0),
      yearlyPriceCents: Number(plan.yearlyPriceCents || 0),
      maxActiveListings:
        plan.maxActiveListings === null ? null : Number(plan.maxActiveListings || 0),
      maxLocations: plan.maxLocations === null ? null : Number(plan.maxLocations || 0),
      maxStaffUsers:
        plan.maxStaffUsers === null ? null : Number(plan.maxStaffUsers || 0),
      canCreateAuctions: Boolean(plan.canCreateAuctions),
      canFeatureListings: Boolean(plan.canFeatureListings),
      analyticsLevel: plan.analyticsLevel || "none",
      commissionBps: Number(plan.commissionBps || 0),
      commissionPercent: Number((Number(plan.commissionBps || 0) / 100).toFixed(2)),
      features: Array.isArray(plan.features) ? [...plan.features] : [],
      isPaid: getPaidSellerPlanCodes().includes(plan.code),
    };
  });

  const ruleMap = await getActivePricingRuleMap();
  return applySellerPlanPricingOverrides(fallback, ruleMap);
}
