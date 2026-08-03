# PawnLoop Payments and Funds Flow Hardening V1

## Purpose

PawnLoop must process buyer payments, platform commissions, seller
proceeds, refunds, disputes, reversals, and seller payouts without
storing raw card or bank-account information.

Stripe must remain the payment processor and sensitive financial-data
vault.

PawnLoop stores only:

- Stripe object identifiers
- Internal transaction identifiers
- Integer-cent monetary values
- Payment and fulfillment states
- Immutable audit and ledger records
- Safe masked display information returned by Stripe

PawnLoop must never store:

- Full card numbers
- Card CVC values
- Full bank-account numbers
- Routing numbers entered by sellers
- Stripe secret keys in the database
- Raw payment-method payloads
- Unencrypted onboarding documents

## Recommended Architecture

### Buyer card collection

Use Stripe-hosted Checkout or Stripe Elements.

Card data must be submitted directly to Stripe.

PawnLoop receives only safe references such as:

- Stripe Customer ID
- PaymentMethod ID
- PaymentIntent ID
- Charge ID
- Card brand
- Last four digits
- Expiration month and year where safely returned

The backend must never accept or log raw PAN or CVC fields.

### Seller banking information

Use Stripe Connect hosted onboarding.

Stripe collects:

- Business information
- Identity verification
- Tax information
- Bank account or eligible debit-card payout information
- Required verification documents

PawnLoop stores only:

- Connected Account ID
- Onboarding status
- Charges-enabled status
- Payouts-enabled status
- Requirements status
- Safe capability flags
- Last synchronized timestamp

Do not build a custom bank-account form.

### Charge model

For V1 single-shop transactions, use destination charges.

Each normal transaction has:

- One buyer
- One PawnLoop marketplace transaction
- One seller shop
- One connected Stripe account
- One platform commission
- One seller-proceeds destination

The PaymentIntent should use the connected account destination and the
platform fee or equivalent transfer amount.

Do not create destination charges until:

- Shop exists and is active
- Shop owns the listing
- Listing is public and available
- Connected Stripe account is complete
- Charges and payouts capabilities are active as required
- Transaction amount and currency are validated
- Reservation is valid
- Platform commission is calculated server-side

### Future multi-shop transactions

Do not introduce multi-shop carts in this phase.

If future carts include multiple shops, evaluate separate charges and
transfers with:

- A transaction ledger
- Transfer grouping
- Source transaction linkage
- Availability handling
- Transfer reversals
- Per-shop allocation records
- Refund allocation
- Dispute allocation
- Reconciliation

Do not mix destination-charge and multi-seller behavior silently.

## Funds Flow

Example:

Buyer total: $100.00

- Gross payment: 10000 cents
- PawnLoop commission: 900 cents
- Seller gross proceeds before other adjustments: 9100 cents
- Stripe processing fee: recorded from Stripe balance transaction
- PawnLoop net platform revenue:
  platform commission minus Stripe/platform costs
- Seller connected-account balance:
  amount transferred according to Stripe charge configuration

Never estimate Stripe fees using a hard-coded formula for accounting.
Retrieve authoritative fee data from Stripe balance transactions where
available.

## Platform Revenue

PawnLoop revenue may include:

- Marketplace commissions
- Seller subscriptions
- Buyer subscriptions
- Featured-listing fees
- Advertising fees
- Optional service fees
- Future Instant Payout fees where configured

Each source must have a distinct ledger classification.

Do not combine subscription revenue with marketplace transaction fees.

## Internal Ledger

Audit existing ledger, settlement, transaction, payout, refund, dispute,
and audit models before adding anything.

Use one authoritative immutable ledger approach.

Potential ledger entry types:

- BUYER_PAYMENT_PENDING
- BUYER_PAYMENT_SUCCEEDED
- PLATFORM_COMMISSION_EARNED
- STRIPE_PROCESSING_FEE
- SELLER_PROCEEDS_PENDING
- SELLER_PROCEEDS_AVAILABLE
- SELLER_TRANSFER_CREATED
- SELLER_TRANSFER_FAILED
- SELLER_PAYOUT_CREATED
- SELLER_PAYOUT_PAID
- SELLER_PAYOUT_FAILED
- REFUND_PENDING
- REFUND_SUCCEEDED
- REFUND_FAILED
- DISPUTE_OPENED
- DISPUTE_WON
- DISPUTE_LOST
- TRANSFER_REVERSAL
- PAYOUT_REVERSAL
- SUBSCRIPTION_PAYMENT
- MANUAL_ADJUSTMENT

Every entry should include where appropriate:

- Internal ID
- Transaction or settlement ID
- Shop ID
- Buyer ID where lawful and necessary
- Stripe object ID
- Event ID
- Currency
- Debit cents
- Credit cents
- Status
- Immutable reason
- Idempotency key hash
- Occurred timestamp
- Created timestamp
- Metadata containing no sensitive financial data

Ledger records must be append-only except for narrowly defined status
synchronization.

## Commission Calculation

Use the centralized seller entitlement service.

Commission must be calculated server-side from the seller plan in effect
at the transaction's pricing snapshot.

Current target commission rates:

- Free: 12 percent
- Pro: 9 percent
- Plus/Premium compatibility: 6 percent
- Ultra: 4 percent

Before changing current configured values, audit:

- Seller plan configuration
- Subscription snapshots
- Existing marketplace transaction fields
- Settlement calculations
- Stripe fee parameters
- Tests
- Existing customer compatibility

Transaction records should preserve the commission rate used at purchase
time so future plan changes do not alter historical accounting.

## Seller Payouts

Seller payouts should occur through the shop's Stripe connected account.

PawnLoop should display:

- Connected-account status
- Payouts-enabled status
- Pending balance
- Available balance where supported
- Next expected payout where supported
- Recent payouts
- Failed payouts
- Required actions
- Onboarding link when incomplete

PawnLoop must not display full bank-account data.

Safe display examples:

- Bank name where returned
- Account ending in 1234
- Payout method type
- Payout status

Payout scheduling should use Stripe balance settings or supported payout
APIs.

Do not transfer more than the available eligible amount.

## Payout Eligibility

A seller payout or transfer must require:

- Active approved shop
- Valid connected account
- Payouts enabled
- No unresolved account requirement blocking payout
- Completed eligible marketplace transaction
- No active reservation
- Payment successfully settled
- No existing transfer for the same proceeds
- Refund/dispute reserve considered
- Positive eligible amount
- Valid currency
- Idempotency protection

## Holding and Availability

PawnLoop must distinguish:

- Payment pending
- Payment succeeded
- Funds pending
- Funds available
- Seller proceeds reserved
- Transfer pending
- Transfer completed
- Stripe payout pending
- Stripe payout paid
- Payout failed
- Funds reversed

Do not tell a seller money is available merely because a PaymentIntent
succeeded.

Use authoritative Stripe event and balance availability state.

## Refunds

Refunds must:

- Be authorized
- Validate refundable amount
- Use integer cents
- Preserve immutable reason
- Use idempotency
- Prevent cumulative refunds above the original eligible amount
- Update internal transaction state
- Create ledger entries
- Synchronize Stripe refund status
- Reverse or adjust seller proceeds where required
- Notify buyer and seller safely
- Avoid restoring inventory when inappropriate

Partial refunds must be supported consistently.

## Disputes and Chargebacks

Webhook processing should track:

- Dispute created
- Funds withdrawn
- Evidence due date
- Evidence submitted
- Dispute won
- Dispute lost
- Funds reinstated
- Seller/platform allocation
- Final accounting state

The platform must define whether dispute losses are:

- Absorbed by PawnLoop
- Debited from seller proceeds
- Shared under a documented policy

Do not implement undocumented automatic seller debits.

## Webhooks

Required event classes should be audited and covered where applicable:

- payment_intent.succeeded
- payment_intent.payment_failed
- charge.refunded
- charge.dispute.created
- charge.dispute.updated
- charge.dispute.closed
- transfer.created
- transfer.updated
- transfer.failed where supported
- transfer.reversed
- payout.created
- payout.updated
- payout.paid
- payout.failed
- account.updated
- invoice.payment_succeeded
- invoice.payment_failed
- customer.subscription.updated
- customer.subscription.deleted

Requirements:

- Verify Stripe signatures
- Preserve raw request body
- Store event ID
- Enforce event idempotency
- Handle out-of-order events
- Ignore duplicate events safely
- Log safe failure details
- Retry safely
- Never log secrets or full financial payloads

## Reconciliation

Create an administrative reconciliation view or service foundation.

Reconciliation should compare:

- PawnLoop transaction total
- Stripe PaymentIntent amount
- Stripe Charge amount
- Platform fee
- Stripe processing fee
- Transfer amount
- Refund total
- Dispute total
- Seller proceeds
- Payout status
- Internal ledger totals

Possible statuses:

- RECONCILED
- PENDING
- MISMATCH
- NEEDS_REVIEW
- BLOCKED
- REVERSED

Any mismatch must be visible to authorized administrators.

Do not auto-correct money records without an audited process.

## Super Admin Financial Operations

Audit and extend existing finance, revenue, settlement, and payout pages.

Super Admin should be able to see:

- Gross payment volume
- Platform commissions
- Stripe fees
- Net platform transaction revenue
- Seller proceeds
- Pending transfers
- Failed transfers
- Pending payouts
- Failed payouts
- Refunds
- Disputes
- Reconciliation mismatches
- Connected accounts requiring action
- Subscription revenue separately
- Marketplace revenue separately

Administrative monetary mutations must be audited.

## Owner Finance Center

The owner should be able to see:

- Stripe onboarding state
- Payout capability status
- Safe masked payout destination
- Completed sales
- Pending proceeds
- Available proceeds
- Transfers
- Payouts
- Refund adjustments
- Dispute adjustments
- Current commission
- Transaction-level fee breakdown
- Required Stripe actions
- Finance help text

Never display another shop's financial information.

## Buyer Payment Experience

Buyers should see:

- Secure Stripe payment form
- Saved payment methods represented by safe metadata
- Order subtotal
- Taxes where supported
- Shipping
- Platform or service fee where applicable and legally appropriate
- Total
- Payment status
- Refund status
- Receipt
- Failed-payment recovery
- 3DS/authentication state
- No duplicate-charge behavior

Do not collect card details in standard HTML inputs.

## Security

- No raw cards or bank accounts in PawnLoop storage.
- No CVC storage.
- No secret keys in frontend bundles.
- No sensitive financial payload logging.
- Stripe webhook signatures required.
- Payment amount calculated server-side.
- Client-submitted totals are not trusted.
- Connected account IDs are shop-scoped.
- Cross-shop finance access is denied.
- Payout actions require strong authorization.
- Manual financial adjustments require immutable reasons.
- Public APIs never expose Stripe internal identifiers unnecessarily.
- Rate-limit payment and payout mutation endpoints.
- Protect against replay and duplicate submission.
- Use request and Stripe idempotency keys.
- Preserve audit records.

## Color Contrast and Financial UI Safety

All financial screens must use accessible design tokens.

Required semantic states:

- Default text
- Secondary text
- Muted explanatory text
- Success
- Warning
- Error
- Pending
- Disabled
- Focus
- Selected
- Table header
- Table row
- Card background
- Border

Requirements:

- WCAG 2.2 AA contrast
- No light gray text on white backgrounds
- No dark gray text on black backgrounds
- Disabled text must remain readable
- Disabled controls must also use shape, border, icon, or label—not color alone
- Pending, failed, and successful financial states must not rely on color alone
- Every status requires text and, where useful, an icon
- Empty finance cards must explain why data is unavailable
- Loading states must not appear as blank sections
- Error states must provide recovery guidance
- Dark and light themes must both be tested

## Tests

Required coverage:

1. Raw card fields are rejected by backend payment APIs.
2. Raw bank fields are rejected by PawnLoop APIs.
3. Connected account onboarding returns only Stripe-hosted URLs.
4. Cross-shop connected account use is rejected.
5. Destination account belongs to the selling shop.
6. Commission uses server-side seller plan snapshot.
7. Payment amount uses server-side listing and transaction values.
8. Duplicate PaymentIntent creation is idempotent.
9. Duplicate webhook processing is idempotent.
10. Out-of-order webhook handling is safe.
11. Seller proceeds are not available before eligible state.
12. Transfer cannot exceed eligible proceeds.
13. Transfer cannot occur twice.
14. Refund cannot exceed refundable amount.
15. Partial refund totals are accurate.
16. Dispute accounting is deterministic.
17. Failed payouts remain visible and retry-safe.
18. Reconciliation detects amount mismatches.
19. Owner finance access is shop-scoped.
20. Staff finance permission is enforced.
21. Super Admin financial access is authorized.
22. Payment responses expose safe metadata only.
23. Audit logs contain no secrets or raw payment data.
24. Existing reservation/payment/refund/dispute/payout tests pass.
25. Seller and buyer subscription tests pass.
26. Frontend payment and finance views pass contrast checks.

## Definition of Done

- Existing payment architecture is audited before modifications.
- No raw card or bank details are stored.
- One-shop purchases use a clearly documented Connect charge model.
- Commission calculation is centralized and snapshotted.
- Seller proceeds and platform revenue are separately represented.
- Transfers and payouts are not confused.
- Refund and dispute allocation is documented.
- Webhooks are idempotent and order-safe.
- Reconciliation exists.
- Finance screens are shop-scoped.
- Financial status language is accurate.
- WCAG contrast checks pass.
- Stripe test-mode end-to-end certification is documented.
- No live Stripe prices or identifiers are changed without approval.
- No migrations are applied without review.
