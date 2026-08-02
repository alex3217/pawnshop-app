# Stripe Test-Mode Certification Results

Certification date: 2026-08-02 (America/Chicago)
Overall result: **PASS — provider-backed Stripe test-mode lifecycle**

Certification ran against an isolated disposable PostgreSQL database and Stripe test-mode provider objects. No production Stripe account, key, database, payment, transfer, payout, refund, or dispute was accessed.

## Provider lifecycle results

| Provider lifecycle | Result |
|---|---|
| Test-key classification and account ownership | PASS — test prefixes confirmed without printing secret values |
| Connect capability and hosted onboarding | PASS — Express account completed; charges and payouts enabled |
| Cross-shop Connect authorization | PASS — Owner A access to Shop B returned HTTP 403 |
| Server-controlled PaymentIntent amount, currency, and commission | PASS |
| Signed success and duplicate webhook behavior | PASS |
| Failed payment, recovery, and late out-of-order webhook | PASS |
| Partial refund, retry idempotency, over-refund cap, and full refund | PASS |
| Dispute creation, withdrawal debit, won resolution, and reinstatement credit | PASS |
| Idempotent seller payout request and Stripe Transfer | PASS |
| Connected-account payout observation | PASS — expected test-bank failure lifecycle recorded |
| Reconciliation classifications | PASS — all six states verified |

## Key provider evidence

| Evidence | Identifier or result |
|---|---|
| Connected account | acct_1TzrJqPjx2YqMy0X |
| Initial successful PaymentIntent | pi_3TzrU1BdZzXFlZiT0WLqjeiJ |
| Initial success event | evt_3TzrU1BdZzXFlZiT0Jo8lOc0 |
| Failure and refund PaymentIntent | pi_3Tzrj3BdZzXFlZiT0VxMC6Bu |
| Fully refunded Charge | ch_3Tzrj3BdZzXFlZiT0fpkQiPz |
| Refund amounts | 500 + 2000 cents |
| Refund seller debits | 440 + 1760 cents |
| Dispute | du_1TzrwwBdZzXFlZiTpW8L7ith — won |
| Dispute transaction | cmsbd0toc000rxxpasppuo45b — PAID |
| Seller payout record | cmsbdc3uv001dxxpa9mhcs273 |
| Stripe Transfer | tr_1Tzs60BdZzXFlZiT7GRo1yNX — 1000 cents |
| Connected payout | po_1TzsBzPjx2YqMy0XY1dIxmAp — failed |
| Connected payout failure | insufficient_funds |
| Connected payout failure event | evt_1TzsC0Pjx2YqMy0X8070umpJ |
| Reconciled transaction | cmsbd0toc000rxxpasppuo45b |

## Verified financial behavior

- The marketplace amount, currency, platform fee, and seller proceeds were determined by PawnLoop server state.
- The separate-charge-and-transfer model did not use destination-charge parameters.
- Duplicate and out-of-order webhook deliveries produced one financial effect.
- A failed PaymentIntent retained the reservation and a later successful confirmation finalized it.
- A later failure event did not regress a paid transaction.
- Refund requests were capped at the remaining refundable amount.
- Two refund debits totaled the original 2200-cent seller proceeds without modifying earlier history.
- A dispute withdrawal created one 1320-cent debit and reinstatement created one matching credit.
- Payout-request and Transfer retries returned the same records and created exactly one Transfer.
- The connected payout used Stripe test bank ending 2227 and produced the documented insufficient-funds failure fixture.
- The real connected payout event sequence was retained, including the terminal payout.failed event.

## Reconciliation matrix

| Classification | Result |
|---|---|
| RECONCILED | PASS |
| PENDING | PASS — PAYMENT_NOT_FINAL |
| MISMATCH | PASS — amount and ledger mismatch reasons detected |
| NEEDS_REVIEW | PASS — missing internal reference detected |
| BLOCKED | PASS — provider unavailable detected |
| REVERSED | PASS — authoritative reversal detected |

## Safety and qualifications

- All provider objects were test-mode objects.
- Secret keys, signing secrets, tokens, passwords, and raw provider payloads are not committed.
- Stripe Account objects do not expose a livemode field; test mode was proven through the test key plus Balance, PaymentIntent, Charge, Event, Transfer, Dispute, Refund-related Charge, and Payout objects.
- The connected payout failure was intentional and used the documented Stripe test-bank fixture ending 2227.
- The controlled 5000-cent local adjustment was certification-only, disposable, and was not represented as production revenue.
- Provider-backed Stripe completion removes the Stripe release blocker but does not change the overall public-beta decision by itself.

## Conclusion

The provider-backed Stripe test-mode lifecycle is certified for the tested PawnLoop flows. Remaining public-beta blockers are manual accessibility certification, staging and production migration-history inspection, and operational monitoring, backup, rollback, deployment, and incident-response exercises.
