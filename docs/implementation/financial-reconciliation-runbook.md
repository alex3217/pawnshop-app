# Financial reconciliation runbook

Reconciliation is read-only. For each internal transaction/settlement, collect authorized Stripe test/production references through server credentials: PaymentIntent, Charge, balance transaction, application/platform fee if applicable, Transfer, refunds, disputes, connected payout, plus internal seller ledger entries.

Compare integer cents, currency, object ownership, state, and linkage. Classify `RECONCILED` when authoritative amounts and links agree; `PENDING` for nonfinal provider state; `MISMATCH` for amount/currency/ledger/refund/dispute/transfer/payout disagreement; `NEEDS_REVIEW` for missing or ambiguous references; `BLOCKED` when authoritative retrieval is unavailable; and `REVERSED` when funds are authoritatively reversed.

Never estimate Stripe processing fees for accounting, never change financial records automatically, and never mark a record reconciled solely from PaymentIntent success. Record the run time, operator, filters, Stripe event/object IDs, mismatch reason codes, and remediation ticket in the audit system without sensitive payloads. Escalate cross-shop linkage, duplicate money movement, or gross/allocation disagreement immediately.

