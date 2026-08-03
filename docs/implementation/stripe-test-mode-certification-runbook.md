# Stripe test-mode certification runbook

Use only an isolated test database and Stripe test keys supplied through the approved secret manager. Confirm the key starts with the Stripe test-mode prefix without printing it. Never place secrets in commands, screenshots, fixtures, logs, or this document.

1. Confirm Connect is enabled and allowed frontend origins are test/staging origins.
2. Create a disposable test shop and launch the Owner Finance hosted onboarding link. Enter only Stripe-provided test banking values on Stripe's domain.
3. Verify details submitted, charges enabled, payouts enabled, requirements, masked destination, and cross-shop denial.
4. Reserve a one-shop listing and pay with Stripe's documented test PaymentMethod through Elements. Verify the server amount, currency, commission snapshot, `SEPARATE_CHARGE_AND_TRANSFER` metadata, and absence of destination-charge parameters.
5. Replay success, duplicate, failure, and out-of-order webhook fixtures through signature-verified test endpoints. Verify one financial effect.
6. Exercise partial/full refund caps and dispute fixtures; verify immutable audit/ledger effects and required recovery flags.
7. Make seller proceeds eligible using controlled fixtures, request a transfer twice, and verify one test-mode Transfer. Observe connected-account payout fixtures separately.
8. Run reconciliation snapshots for reconciled, pending, mismatch, review, blocked, and reversed cases. Investigate mismatches; never auto-adjust.
9. Capture object IDs and redacted results only. Delete disposable Stripe test objects through normal test cleanup if policy allows.

Stop immediately if the Dashboard indicates live mode or any key/account belongs to production.

