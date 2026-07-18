import {
  calculateSellerSettlementRevenue,
} from "./settlementRevenue.service.js";

export function settlementAmountToCents(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    const error = new TypeError(
      "Settlement amount must be a positive number.",
    );

    error.code = "INVALID_SETTLEMENT_AMOUNT";
    throw error;
  }

  const amountCents = Math.round(amount * 100);

  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    const error = new RangeError(
      "Settlement amount exceeds the supported range.",
    );

    error.code = "SETTLEMENT_AMOUNT_OUT_OF_RANGE";
    throw error;
  }

  return amountCents;
}

export async function calculateSettlementRevenueContext({
  amount,
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
  const grossAmountCents =
    settlementAmountToCents(amount);

  const revenue =
    await calculateSellerSettlementRevenue({
      grossAmountCents,
      sellerPlanCode,
      transactionType,
      processorFeeCents,
      processorFeePaidBy,
      taxCents,
      shippingCents,
      currency,
      calculatedAt,
      catalog,
    });

  return {
    amount: Number(amount),
    grossAmountCents,
    sellerPlanCode:
      String(sellerPlanCode || "FREE")
        .trim()
        .toUpperCase(),
    transactionType:
      String(transactionType || "MARKETPLACE")
        .trim()
        .toUpperCase(),
    revenue,
  };
}
