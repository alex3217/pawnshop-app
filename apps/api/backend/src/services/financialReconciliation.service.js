const STATES = new Set(["RECONCILED", "PENDING", "MISMATCH", "NEEDS_REVIEW", "BLOCKED", "REVERSED"]);

function cents(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

export function reconcileFinancialSnapshot(snapshot = {}) {
  const reasons = [];
  const internalGross = cents(snapshot.internalGrossCents);
  const intentAmount = cents(snapshot.paymentIntentAmountCents);
  const platformFee = cents(snapshot.platformFeeCents);
  const sellerProceeds = cents(snapshot.sellerProceedsCents);
  const ledgerCredits = cents(snapshot.ledgerCreditCents);

  if (snapshot.reversed) return { status: "REVERSED", reasons: ["FUNDS_REVERSED"] };
  if (snapshot.providerUnavailable) return { status: "BLOCKED", reasons: ["STRIPE_UNAVAILABLE"] };
  if (!snapshot.paymentIntentId || internalGross === null) return { status: "NEEDS_REVIEW", reasons: ["MISSING_INTERNAL_REFERENCE"] };
  if (!snapshot.paymentIntentStatus || ["requires_payment_method", "requires_action", "processing"].includes(snapshot.paymentIntentStatus)) {
    return { status: "PENDING", reasons: ["PAYMENT_NOT_FINAL"] };
  }

  if (intentAmount !== internalGross) reasons.push("PAYMENT_INTENT_AMOUNT_MISMATCH");
  if (platformFee === null || sellerProceeds === null || platformFee + sellerProceeds !== internalGross) reasons.push("ALLOCATION_MISMATCH");
  if (ledgerCredits !== null && sellerProceeds !== null && ledgerCredits !== sellerProceeds) reasons.push("LEDGER_MISMATCH");
  if (snapshot.currency && snapshot.paymentIntentCurrency && String(snapshot.currency).toUpperCase() !== String(snapshot.paymentIntentCurrency).toUpperCase()) reasons.push("CURRENCY_MISMATCH");
  if (snapshot.refundMismatch) reasons.push("REFUND_MISMATCH");
  if (snapshot.disputeMismatch) reasons.push("DISPUTE_MISMATCH");
  if (snapshot.transferMismatch) reasons.push("TRANSFER_MISMATCH");
  if (snapshot.payoutMismatch) reasons.push("PAYOUT_MISMATCH");

  const status = reasons.length ? "MISMATCH" : "RECONCILED";
  if (!STATES.has(status)) throw new Error("Invalid reconciliation status");
  return { status, reasons };
}

