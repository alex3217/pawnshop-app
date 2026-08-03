Work in the PawnLoop repository on:

feature/payments-funds-flow-hardening-v1

Read:

docs/product/payments-funds-flow-hardening-v1.md

This phase hardens the existing Stripe, Connect, transaction, settlement,
refund, dispute, payout, subscription, finance, and reconciliation
architecture.

Do not create a second payment system.

AUDIT FIRST

Inspect:

- Prisma payment, transaction, settlement, ledger, payout, refund,
  dispute, subscription, audit, shop, and Stripe-account fields
- All payment and Stripe migrations
- Stripe configuration
- Stripe routes
- Stripe controllers
- Stripe services
- Marketplace transaction services
- Settlement services
- Seller payout services
- Refund and dispute services
- Subscription services
- Webhook router and raw-body ordering
- Existing idempotency utilities
- Owner Finance page
- Super Admin Revenue and Settlements pages
- Buyer Payment Methods
- Checkout and Buy Now pages
- Seller entitlement commission configuration
- Tests and fixtures
- Audit logging
- Financial permissions

Create:

docs/implementation/payments-funds-flow-audit.md

Include:

- Requirement
- Existing implementation
- Relevant files
- Complete
- Partial
- Missing
- Financial risk
- Security risk
- Compatibility risk
- Implementation decision

RECOMMENDED V1 FLOW

Use the existing Stripe Connect architecture and determine its current
charge type.

For ordinary one-shop purchases, standardize and document a destination
charge flow unless the existing architecture has a safer compatible
implementation that must be preserved.

Do not silently migrate live charge behavior.

If the current system uses separate charges and transfers, document:

- Why
- Transfer timing
- Source transaction behavior
- Refund behavior
- Dispute behavior
- Existing-customer compatibility

Do not introduce multi-shop cart behavior.

SENSITIVE DATA

Search for and prohibit backend fields accepting:

- cardNumber
- card_number
- cvc
- cvv
- routingNumber
- routing_number
- accountNumber
- account_number
- full bank details

Do not flag safe Stripe IDs or masked last-four fields as sensitive.

Ensure request logging and error logging cannot include raw payment data.

CONNECTED ACCOUNTS

Verify:

- Stripe-hosted onboarding
- Connected account creation
- Account-link validation
- Return and refresh URL validation
- charges_enabled
- payouts_enabled
- details_submitted
- requirements
- capabilities
- Safe account status synchronization
- Shop-account ownership
- Deleted and inactive shop behavior
- Cross-shop isolation

Do not create a custom bank-account form.

CHARGES AND FEES

Verify and harden:

- Server-side amount
- Currency
- Seller shop
- Connected account
- Application fee or retained commission
- Commission plan snapshot
- Stripe account mode
- Price/listing state
- Inventory reservation
- Idempotency
- PaymentIntent metadata
- Transfer group or destination metadata where applicable

Do not trust client totals.

LEDGER

Audit the current ledger before adding models.

Prefer extending existing immutable financial records.

If a migration is needed:

- Create a nondestructive reviewed migration
- Do not apply it
- Avoid duplicate financial sources
- Add indexes and uniqueness constraints
- Preserve historic compatibility

Clearly distinguish:

- Gross buyer payment
- Platform commission
- Stripe fee
- Seller proceeds
- Transfer
- Stripe payout
- Refund
- Dispute
- Reversal
- Subscription revenue

PAYOUTS

Verify seller payout eligibility and prevent:

- Payout without completed eligible proceeds
- Payout to another shop's account
- Duplicate transfer
- Duplicate payout request
- Transfer above eligible balance
- Payout while account capabilities are incomplete
- Payout based only on PaymentIntent success
- Uncertain release after Stripe retrieval failure

REFUNDS AND DISPUTES

Verify:

- Integer cents
- Remaining refundable amount
- Immutable reason
- Idempotency
- Seller-proceeds adjustment
- Transfer reversal where required
- Inventory consequences
- Audit events
- Buyer and seller notifications
- Out-of-order events
- Dispute state and final allocation

Do not invent a seller-loss policy. Document the existing policy and
flag missing policy as a blocker.

RECONCILIATION

Implement or strengthen an authorized reconciliation service.

Compare:

- Internal transaction
- PaymentIntent
- Charge
- Balance transaction
- Platform fee
- Transfer
- Refunds
- Disputes
- Seller proceeds
- Payout status
- Ledger entries

Return:

- RECONCILED
- PENDING
- MISMATCH
- NEEDS_REVIEW
- BLOCKED
- REVERSED

Do not auto-adjust financial records.

OWNER FINANCE UI

Extend the current Owner Finance Center rather than creating a duplicate.

Show safe information only:

- Account readiness
- Masked payout destination
- Pending proceeds
- Available proceeds
- Transfers
- Payouts
- Refunds
- Disputes
- Commission
- Fee breakdown
- Required actions
- Accurate explanatory text

SUPER ADMIN FINANCE UI

Extend existing revenue/settlement pages.

Add or confirm:

- Payment volume
- Platform commissions
- Stripe fees
- Seller proceeds
- Transfers
- Payouts
- Refunds
- Disputes
- Reconciliation mismatches
- Connected accounts requiring action

Avoid hard-coded status labels.

CONTRAST AND STATES

Audit all payment and finance components for:

- Light mode
- Dark mode where supported
- WCAG 2.2 AA text contrast
- Button contrast
- Input contrast
- Disabled contrast
- Focus indicators
- Error, warning, success, and pending state labels
- Blank cards
- Empty states
- Loading states
- Failure recovery

Use design tokens rather than one-off gray values.

If practical, add automated axe contrast checks to critical finance
routes. Do not claim visual compliance solely from static token review.

TESTS

Add focused coverage for:

- Sensitive field rejection
- Safe Stripe metadata
- Shop/account ownership
- Server-side amount and commission
- Plan snapshot
- Destination or transfer configuration
- Duplicate PaymentIntent
- Duplicate and out-of-order webhook
- Refund cap
- Dispute accounting
- Transfer eligibility
- Payout eligibility
- Cross-shop finance isolation
- Reconciliation mismatch
- No financial secret logging
- Existing payment, Stripe, refund, dispute, payout, subscription, and
  reservation regressions

VALIDATION

Run where safe:

- Prisma format, validate, and generate if schema changes
- Targeted payment tests
- Marketplace transaction tests
- Refund/dispute tests
- Payout tests
- Stripe subscription tests
- Authorization tests
- Backend core suite
- Frontend build
- Frontend lint
- Contrast/accessibility tests added for critical finance screens
- git diff --check

Do not:

- Use live Stripe mode
- Change production product or price IDs
- Change production prices
- Create real charges
- Create real payouts
- Apply migrations
- Reset databases
- Modify environment files
- Commit or push
- Log secret or payment values
- Run npm audit fix --force

DOCUMENTATION

Create:

docs/implementation/payments-funds-flow-summary.md
docs/implementation/payments-funds-flow-test-report.md
docs/implementation/stripe-test-mode-certification-runbook.md
docs/implementation/financial-reconciliation-runbook.md

The Stripe certification runbook should provide safe test-mode steps but
must not expose secrets.

FINAL REPORT

Report:

1. Existing charge model
2. Recommended and preserved charge model
3. Card-data handling
4. Bank-data handling
5. Connected-account behavior
6. Platform-fee calculation
7. Seller-proceeds calculation
8. Ledger behavior
9. Transfer behavior
10. Payout behavior
11. Refund and dispute behavior
12. Reconciliation behavior
13. Files modified
14. Files added
15. Models and migration
16. APIs and frontend routes
17. Authorization and privacy
18. Contrast/accessibility work
19. Tests
20. Exact validation results
21. Deferred work
22. Financial and operational risks
23. Git status
24. Suggested commit message

Do not commit or push.
