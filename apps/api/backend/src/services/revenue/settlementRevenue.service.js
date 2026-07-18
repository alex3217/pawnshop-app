import { getSellerPlanCatalog } from "../platformPricingCatalog.service.js";
import { calculateSettlementRevenue } from "./revenueCalculator.service.js";

function normalizePlanCode(value) {
  return String(value || "FREE").trim().toUpperCase();
}

function normalizeTransactionType(value) {
  const normalized = String(value || "MARKETPLACE")
    .trim()
    .toUpperCase();

  const allowed = new Set([
    "AUCTION",
    "OFFER",
    "MARKETPLACE",
    "DEALER",
    "PAWN",
  ]);

  if (!allowed.has(normalized)) {
    const error = new TypeError(
      `Unsupported transaction type: ${normalized}`,
    );

    error.code = "UNSUPPORTED_TRANSACTION_TYPE";
    throw error;
  }

  return normalized;
}

function buildCommissionRule({
  plan,
  transactionType,
}) {
  const normalizedTransactionType =
    normalizeTransactionType(transactionType);

  const percentBps = Number(plan?.commissionBps || 0);

  if (!Number.isInteger(percentBps) || percentBps < 0) {
    const error = new TypeError(
      "Seller plan commissionBps must be a non-negative integer.",
    );

    error.code = "INVALID_COMMISSION_BPS";
    throw error;
  }

  return {
    id: null,
    key: `seller_plan_${String(plan.code).toLowerCase()}_commission_bps`,
    label: `${plan.label} commission`,
    description:
      `${plan.label} commission for ${normalizedTransactionType.toLowerCase()} transactions`,
    category: "MARKETPLACE_COMMISSION",
    appliesTo: `SELLER_PLAN_${plan.code}`,
    feeType: "PERCENT_BPS",
    amountCents: 0,
    percentBps,
    minCents: null,
    maxCents: null,
    currency: plan.currency || "USD",
    effectiveStartAt: null,
    effectiveEndAt: null,
    metadata: {
      sellerPlanCode: plan.code,
      transactionType: normalizedTransactionType,
      source: "SELLER_PLAN_CATALOG",
    },
  };
}

export async function resolveSellerCommissionRule({
  sellerPlanCode,
  transactionType,
  catalog,
}) {
  const normalizedPlanCode = normalizePlanCode(
    sellerPlanCode,
  );

  const plans =
    catalog || (await getSellerPlanCatalog());

  if (!Array.isArray(plans) || plans.length === 0) {
    const error = new Error(
      "Seller plan catalog is unavailable.",
    );

    error.code = "SELLER_PLAN_CATALOG_UNAVAILABLE";
    throw error;
  }

  const plan = plans.find(
    (candidate) =>
      normalizePlanCode(candidate?.code) ===
      normalizedPlanCode,
  );

  if (!plan) {
    const error = new Error(
      `Seller plan not found: ${normalizedPlanCode}`,
    );

    error.code = "SELLER_PLAN_NOT_FOUND";
    throw error;
  }

  return buildCommissionRule({
    plan,
    transactionType,
  });
}

export async function calculateSellerSettlementRevenue({
  grossAmountCents,
  sellerPlanCode,
  transactionType,
  processorFeeCents = 0,
  processorFeePaidBy = "PLATFORM",
  taxCents = 0,
  shippingCents = 0,
  currency = "USD",
  calculatedAt = new Date(),
  catalog,
}) {
  const pricingRule =
    await resolveSellerCommissionRule({
      sellerPlanCode,
      transactionType,
      catalog,
    });

  return calculateSettlementRevenue({
    grossAmountCents,
    pricingRule,
    processorFeeCents,
    processorFeePaidBy,
    taxCents,
    shippingCents,
    currency,
    calculatedAt,
  });
}
