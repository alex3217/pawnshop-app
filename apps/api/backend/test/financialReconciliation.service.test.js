import assert from "node:assert/strict";
import test from "node:test";
import { reconcileFinancialSnapshot } from "../src/services/financialReconciliation.service.js";

const valid = { paymentIntentId: "pi_test", paymentIntentStatus: "succeeded", internalGrossCents: 10000, paymentIntentAmountCents: 10000, platformFeeCents: 900, sellerProceedsCents: 9100, ledgerCreditCents: 9100, currency: "USD", paymentIntentCurrency: "usd" };

test("reconciles matching integer-cent financial sources", () => assert.deepEqual(reconcileFinancialSnapshot(valid), { status: "RECONCILED", reasons: [] }));
test("reports exact mismatches without adjusting records", () => assert.deepEqual(reconcileFinancialSnapshot({ ...valid, paymentIntentAmountCents: 9999, ledgerCreditCents: 9000 }), { status: "MISMATCH", reasons: ["PAYMENT_INTENT_AMOUNT_MISMATCH", "LEDGER_MISMATCH"] }));
test("distinguishes pending, blocked, review, and reversed states", () => {
  assert.equal(reconcileFinancialSnapshot({ ...valid, paymentIntentStatus: "processing" }).status, "PENDING");
  assert.equal(reconcileFinancialSnapshot({ ...valid, providerUnavailable: true }).status, "BLOCKED");
  assert.equal(reconcileFinancialSnapshot({}).status, "NEEDS_REVIEW");
  assert.equal(reconcileFinancialSnapshot({ ...valid, reversed: true }).status, "REVERSED");
});
