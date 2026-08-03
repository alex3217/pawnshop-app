# Dealer Marketplace Operations Runbook

1. Confirm both shops are active, approved, business-verified, agreement-eligible and correctly scoped to the acting owner/staff permission.
2. Confirm buying and selling shop IDs differ and the fee/risk configuration is snapshotted before payment.
3. Treat a succeeded platform PaymentIntent as “Payment secured,” not seller release.
4. Require fulfillment evidence and delivery or verified pickup confirmation. Compute and display the deterministic inspection deadline from configured policy.
5. Hold release for disputes, refunds, returns, authentication, manual review, owner approval or ledger mismatch.
6. Mark “Release eligible” only when the evaluator has no reasons. Financial eligibility must also pass before one idempotent separate Stripe Transfer is requested.
7. Route transfer failures, high-value review, returns, disputes, verification problems and reconciliation mismatches to authorized Dealer Operations staff with audit logging.
8. Never describe the service as escrow and never manually override records without an authorized, audited operation.
