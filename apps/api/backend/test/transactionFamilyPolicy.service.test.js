import test from "node:test";
import assert from "node:assert/strict";
import { getCommunityMarketplaceAvailability, getTransactionFamilyPolicy, resolveTransactionFamily, TRANSACTION_FAMILIES } from "../src/services/transactionFamilyPolicy.service.js";
import { assertDealerPurchaseParties, dealerInspectionDeadline, evaluateDealerRelease, snapshotDealerFee } from "../src/services/dealerProtectedPayment.service.js";
import { reconcileFinancialSnapshot } from "../src/services/financialReconciliation.service.js";

test("preserves deployed codes through canonical family compatibility mappings", () => {
  assert.equal(resolveTransactionFamily({ type: "DIRECT_PURCHASE", listing: { listingType: "SHOP_TO_CUSTOMER" } }), TRANSACTION_FAMILIES.RETAIL);
  assert.equal(resolveTransactionFamily({ type: "ACCEPTED_OFFER" }), TRANSACTION_FAMILIES.RETAIL);
  assert.equal(resolveTransactionFamily({ type: "DEALER_TRANSFER" }), TRANSACTION_FAMILIES.DEALER);
  assert.equal(resolveTransactionFamily({ type: "CUSTOMER_SELL_TO_SHOP", submission: { intent: "SELL" } }), TRANSACTION_FAMILIES.CUSTOMER_SELL);
  assert.equal(resolveTransactionFamily({ type: "CUSTOMER_SELL_TO_SHOP", submission: { intent: "PAWN_OFFERS" } }), TRANSACTION_FAMILIES.CUSTOMER_PAWN);
});

test("community commerce is reserved and disabled", () => {
  assert.deepEqual(getCommunityMarketplaceAvailability(), { enabled: false, reason: "Separate verification, fraud, policy, and legal approval required" });
  assert.equal(getTransactionFamilyPolicy(TRANSACTION_FAMILIES.COMMUNITY).transferEligible, false);
});

test("dealer purchase rejects the selling shop as buyer", () => {
  assert.throws(() => assertDealerPurchaseParties({ buyerShopId: "shop-1", sellerShopId: "shop-1" }), { code: "DEALER_OWN_LISTING" });
});

test("dealer inspection deadline is deterministic", () => {
  assert.equal(dealerInspectionDeadline({ deliveredAt: "2026-08-01T12:00:00.000Z", inspectionDurationHours: 48 }).toISOString(), "2026-08-03T12:00:00.000Z");
});

const releasable = { type: "DEALER_TRANSFER", buyerShopId: "buyer", sellerShopId: "seller", buyerShopApproved: true, sellerShopApproved: true, buyerShopActive: true, sellerShopActive: true, sellerBusinessVerified: true, sellerConnectReady: true, paymentSucceeded: true, fulfillmentEvidence: true, deliveredAt: "2026-07-29T12:00:00.000Z", eligibleCents: 9400, ledgerReconciled: true, buyerAccepted: true };

test("dealer release requires fulfillment, inspection, and clear disputes", () => {
  assert.equal(evaluateDealerRelease(releasable, { now: new Date("2026-08-01T12:00:00.000Z") }).eligible, true);
  const held = evaluateDealerRelease({ ...releasable, buyerAccepted: false, deliveredAt: "2026-08-01T00:00:00.000Z", disputeActive: true }, { now: new Date("2026-08-01T12:00:00.000Z") });
  assert.equal(held.eligible, false);
  assert.ok(held.reasons.includes("ACTIVE_DISPUTE"));
  assert.ok(held.reasons.includes("INSPECTION_PENDING"));
});

test("dealer fee snapshot remains immutable when plan inputs later change", () => {
  const snapshot = snapshotDealerFee({ grossCents: 10000, feeBasisPoints: 400, planCode: "PRO", pricingRuleId: "rule-1" });
  assert.deepEqual(snapshot, { transactionFamily: TRANSACTION_FAMILIES.DEALER, grossCents: 10000, feeBasisPoints: 400, feeCents: 400, sellerProceedsCents: 9600, planCode: "PRO", pricingRuleId: "rule-1" });
  assert.equal(Object.isFrozen(snapshot), true);
});

test("family-aware reconciliation detects premature dealer transfer without mutation", () => {
  const policy = getTransactionFamilyPolicy(TRANSACTION_FAMILIES.DEALER);
  const result = reconcileFinancialSnapshot({ internalGrossCents: 10000, paymentIntentId: "pi_test", paymentIntentStatus: "succeeded", paymentIntentAmountCents: 10000, platformFeeCents: 400, sellerProceedsCents: 9600, ledgerCreditCents: 9600, transactionFamily: TRANSACTION_FAMILIES.DEALER, transactionPolicy: policy, expectedChargeModel: "SEPARATE_CHARGE_AND_TRANSFER", inspectionRequired: true, delayedReleaseRequired: true, releaseEligible: false, transferId: "tr_unexpected" });
  assert.equal(result.status, "MISMATCH");
  assert.ok(result.reasons.includes("TRANSFER_BEFORE_RELEASE_ELIGIBILITY"));
});
