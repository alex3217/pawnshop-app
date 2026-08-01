import { TRANSACTION_FAMILIES, getTransactionFamilyPolicy, resolveTransactionFamily } from "./transactionFamilyPolicy.service.js";

export const DEFAULT_DEALER_RISK_CONTROLS = Object.freeze({
  transactionLimitCents: null,
  dailyBuyLimitCents: null,
  dailySellLimitCents: null,
  manualReviewThresholdCents: null,
  ownerApprovalThresholdCents: null,
  inspectionDurationHours: 48,
  signatureRequired: false,
  insuranceRequired: false,
  authenticationRequired: false,
});

export function dealerInspectionDeadline({ deliveredAt, acceptedAt, inspectionDurationHours }) {
  if (acceptedAt) return new Date(acceptedAt);
  const start = new Date(deliveredAt);
  const hours = Number(inspectionDurationHours);
  if (Number.isNaN(start.getTime()) || !Number.isFinite(hours) || hours <= 0) throw Object.assign(new Error("A valid delivery time and inspection duration are required"), { statusCode: 400 });
  return new Date(start.getTime() + hours * 60 * 60 * 1000);
}

export function evaluateDealerRelease(transaction, { now = new Date(), controls = DEFAULT_DEALER_RISK_CONTROLS } = {}) {
  if (resolveTransactionFamily(transaction) !== TRANSACTION_FAMILIES.DEALER) return { eligible: false, reasons: ["NOT_DEALER_TRANSACTION"] };
  const reasons = [];
  if (!transaction.buyerShopId || !transaction.sellerShopId || transaction.buyerShopId === transaction.sellerShopId) reasons.push("DISTINCT_APPROVED_SHOPS_REQUIRED");
  if (!transaction.buyerShopApproved || !transaction.sellerShopApproved || !transaction.buyerShopActive || !transaction.sellerShopActive) reasons.push("SHOP_NOT_APPROVED_OR_ACTIVE");
  if (!transaction.sellerBusinessVerified || !transaction.sellerConnectReady) reasons.push("SELLER_VERIFICATION_INCOMPLETE");
  if (!transaction.paymentSucceeded) reasons.push("PAYMENT_NOT_SECURED");
  if (transaction.transferId || transaction.transferExists) reasons.push("TRANSFER_ALREADY_EXISTS");
  if (!transaction.fulfillmentEvidence || !transaction.deliveredAt) reasons.push("FULFILLMENT_NOT_CONFIRMED");
  if (transaction.disputeActive) reasons.push("ACTIVE_DISPUTE");
  if (transaction.refundPending) reasons.push("REFUND_PENDING");
  if (!Number.isSafeInteger(transaction.eligibleCents) || transaction.eligibleCents <= 0) reasons.push("NO_ELIGIBLE_PROCEEDS");
  if (!transaction.ledgerReconciled) reasons.push("LEDGER_NOT_RECONCILED");
  if (transaction.riskReviewRequired && !transaction.riskReviewComplete) reasons.push("RISK_REVIEW_INCOMPLETE");
  if (transaction.returnActive) reasons.push("RETURN_ACTIVE");
  if (!transaction.buyerAccepted) {
    try {
      const deadline = dealerInspectionDeadline({ deliveredAt: transaction.deliveredAt, inspectionDurationHours: transaction.inspectionDurationHours ?? controls.inspectionDurationHours });
      if (now < deadline) reasons.push("INSPECTION_PENDING");
    } catch { reasons.push("INSPECTION_DEADLINE_MISSING"); }
  }
  return { eligible: reasons.length === 0, reasons, policy: getTransactionFamilyPolicy(TRANSACTION_FAMILIES.DEALER) };
}

export function assertDealerPurchaseParties({ buyerShopId, sellerShopId }) {
  if (!buyerShopId || !sellerShopId) throw Object.assign(new Error("Buying and selling shops are required"), { statusCode: 400 });
  if (buyerShopId === sellerShopId) throw Object.assign(new Error("A shop cannot purchase its own dealer listing"), { statusCode: 409, code: "DEALER_OWN_LISTING" });
}

export function snapshotDealerFee({ grossCents, feeBasisPoints, minimumFeeCents = 0, maximumFeeCents = null, planCode, pricingRuleId }) {
  if (!Number.isSafeInteger(grossCents) || grossCents <= 0 || !Number.isSafeInteger(feeBasisPoints) || feeBasisPoints < 0) throw Object.assign(new Error("Valid integer-cent gross and fee basis points are required"), { statusCode: 400 });
  let feeCents = Math.round(grossCents * feeBasisPoints / 10000);
  feeCents = Math.max(feeCents, minimumFeeCents);
  if (Number.isSafeInteger(maximumFeeCents)) feeCents = Math.min(feeCents, maximumFeeCents);
  return Object.freeze({ transactionFamily: TRANSACTION_FAMILIES.DEALER, grossCents, feeBasisPoints, feeCents, sellerProceedsCents: grossCents - feeCents, planCode, pricingRuleId });
}
