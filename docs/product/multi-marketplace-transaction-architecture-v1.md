# PawnLoop Multi-Marketplace Transaction Architecture V1

## Purpose

PawnLoop must support multiple marketplace relationships without forcing
every transaction into one identical workflow.

Target transaction families:

1. Retail Marketplace
   Buyer to Pawn Shop

2. Sell / Pawn Intake
   Customer to Pawn Shop

3. Dealer Marketplace
   Pawn Shop to Pawn Shop

4. Community Marketplace
   Customer to Customer — future and disabled until separately approved

These workflows may share:

- Authentication
- Stripe
- Stripe Connect
- Financial ledger
- Reconciliation
- Messaging
- Notifications
- Reviews
- Audit logging
- Shipping
- Pickup
- Disputes
- Refunds
- File uploads

They must not share business rules blindly.

Do not create a second unrelated payment system.

---

# Part A — Common Transaction Foundation

## A1. Canonical Transaction Families

Use explicit transaction-family identifiers.

Recommended internal values:

- RETAIL_BUYER_TO_SHOP
- CUSTOMER_SELL_TO_SHOP
- CUSTOMER_PAWN_TO_SHOP
- DEALER_SHOP_TO_SHOP
- COMMUNITY_CUSTOMER_TO_CUSTOMER

Preserve existing internal transaction codes where already deployed.

If existing codes differ, add compatibility mapping rather than unsafe
renames.

## A2. Shared Core Fields

Audit existing transaction, listing, settlement, offer, auction, intake,
refund, dispute, payout, and ledger models first.

A shared transaction contract should support where applicable:

- id
- family
- listingId
- itemId
- buyerUserId
- sellerUserId
- buyerShopId
- sellerShopId
- amountCents
- platformFeeCents
- sellerProceedsCents
- currency
- paymentStatus
- fulfillmentStatus
- inspectionStatus
- disputeStatus
- refundStatus
- transferStatus
- payoutStatus
- createdAt
- updatedAt
- completedAt
- canceledAt
- immutable pricing snapshot
- Stripe object references
- idempotency references

Do not add duplicate financial sources if existing models already cover
these fields.

## A3. Shared Security Rules

Every transaction must validate:

- Authenticated actor
- Actor role
- Buyer identity
- Seller identity
- Shop ownership
- Shop approval
- Shop active status
- Listing ownership
- Listing availability
- Transaction-family eligibility
- Plan or feature eligibility
- Amount in integer cents
- Currency
- Duplicate submission protection
- Cross-user isolation
- Cross-shop isolation

## A4. Shared Financial Rules

PawnLoop must never receive or store:

- Full card numbers
- CVC or CVV
- Full bank-account numbers
- Routing numbers
- Banking passwords

Use:

- Stripe Elements or Checkout
- Stripe-hosted Connect onboarding
- Server-side amounts
- Immutable fee snapshots
- Existing seller ledger
- Idempotent Stripe operations
- Read-only reconciliation

---

# Part B — Retail Marketplace

## B1. Relationship

Buyer purchases an item from a verified pawnshop.

Examples:

- Jewelry
- Tools
- Electronics
- Musical instruments
- Collectibles
- General retail inventory

## B2. Retail Flow

Recommended states:

- DRAFT
- RESERVED
- AWAITING_PAYMENT
- PAYMENT_PROCESSING
- PAID
- AWAITING_FULFILLMENT
- READY_FOR_PICKUP
- SHIPPED
- DELIVERED
- COMPLETED

Exception states:

- PAYMENT_FAILED
- CANCELED
- EXPIRED
- REFUND_PENDING
- PARTIALLY_REFUNDED
- REFUNDED
- DISPUTED
- NEEDS_REVIEW

## B3. Retail Payment Model

Preserve the existing compatible model:

- Platform PaymentIntent
- Server-side transaction amount
- Seller-plan commission snapshot
- Seller ledger credit
- Later separate Stripe Transfer
- Stripe connected-account payout

Do not silently convert existing live-compatible transactions to
destination charges.

## B4. Retail Fulfillment

Support:

- Local pickup
- Shipping
- Pickup confirmation
- Delivery confirmation
- Inventory restoration after valid cancellation
- Refund and dispute handling
- Buyer receipt
- Seller finance record

## B5. Retail Release Policy

Seller proceeds become eligible only after the existing approved
transaction and fulfillment rules are satisfied.

Do not mark funds available from frontend state alone.

---

# Part C — Customer Sell to Pawnshop

## C1. Relationship

A customer offers an item for outright sale to one or more pawnshops.

The pawnshop is the buyer.

Examples:

- Gold
- Jewelry
- Tools
- Electronics
- Watches
- Musical instruments

## C2. Sell Intake Flow

Recommended states:

- DRAFT
- SUBMITTED
- UNDER_REVIEW
- SHOP_INTERESTED
- OFFER_CREATED
- COUNTERED
- OFFER_ACCEPTED
- APPOINTMENT_SCHEDULED
- INSPECTION_PENDING
- INSPECTION_PASSED
- INSPECTION_FAILED
- PAYMENT_DUE_TO_CUSTOMER
- COMPLETED
- DECLINED
- WITHDRAWN
- EXPIRED

## C3. Inspection Requirement

No final shop payment should occur before:

- Physical or approved remote inspection
- Identity verification where required
- Ownership attestation
- Serial/reference review where applicable
- Item condition confirmation
- Stolen-property and prohibited-item controls where applicable
- Final offer confirmation

## C4. Customer Payment

For V1, customer payment may be completed:

- In shop
- Through a separately approved payout provider
- Through Stripe-supported payout architecture only after legal and
  provider review

Do not assume a normal Stripe card refund is a customer payout.

Do not store customer bank information directly.

## C5. Sell Intake Records

Reuse the existing BuyerItemSubmission and ItemIntake architecture where
appropriate.

Do not create duplicate intake systems.

---

# Part D — Customer Pawn to Pawnshop

## D1. Relationship

A customer pledges eligible personal property to a licensed pawnshop in
exchange for a pawn loan.

PawnLoop must not become the lender.

The pawnshop remains responsible for:

- Licensing
- Loan terms
- Interest
- Fees
- Required disclosures
- State and local compliance
- Holding periods
- Renewal
- Redemption
- Default
- Reporting obligations

## D2. Pawn Inquiry Flow

Recommended states:

- DRAFT
- SUBMITTED
- SHOP_REVIEW
- ESTIMATE_PROVIDED
- APPOINTMENT_SCHEDULED
- INSPECTION_PENDING
- TERMS_PRESENTED
- CUSTOMER_ACCEPTED
- SHOP_CONTRACT_COMPLETED
- ACTIVE_AT_SHOP
- REDEEMED
- RENEWED
- DEFAULTED
- CANCELED
- DECLINED
- WITHDRAWN

PawnLoop should initially function as:

- Discovery
- Intake
- Messaging
- Appointment scheduling
- Document reference
- Status tracking

Do not originate the pawn loan unless separately licensed and approved.

## D3. Pawn Payments

Loan disbursement and repayment flows must be separately reviewed for:

- Lending laws
- Money transmission
- ACH
- Card restrictions
- Interest and fee disclosures
- State-specific rules

Do not implement online pawn-loan funding in V1 without legal approval.

---

# Part E — Dealer Marketplace

## E1. Relationship

One verified PawnLoop pawnshop purchases inventory from another verified
PawnLoop pawnshop.

Examples:

- Individual inventory
- Bulk lots
- Overstock
- Jewelry lots
- Tool lots
- Electronics lots
- Store liquidation inventory
- Dealer auctions

## E2. Customer-Facing Name

Use:

- Dealer Marketplace
- Protected Dealer Payment
- Secure Dealer Transaction
- Seller Proceeds Pending
- Release Eligible

Do not use:

- PawnLoop Escrow
- Funds held in escrow
- Escrow guarantee

unless licensed counsel and providers approve the terminology.

## E3. Dealer Payment Model

Use the preserved separate-charge-and-transfer foundation.

Flow:

- Buying shop pays through Stripe
- PawnLoop verifies payment
- Selling-shop proceeds remain pending in the internal ledger
- Seller ships or prepares pickup
- Buyer receives and inspects
- Buyer accepts or the configured inspection period expires
- Seller proceeds become release-eligible
- PawnLoop creates one idempotent Stripe Transfer
- Stripe handles payout to the seller's bank

## E4. Dealer Transaction States

Recommended states:

- DRAFT
- AWAITING_PAYMENT
- PAYMENT_PROCESSING
- PAYMENT_SECURED
- AWAITING_FULFILLMENT
- READY_FOR_PICKUP
- SHIPPED
- DELIVERED
- INSPECTION_PERIOD
- ACCEPTED
- RELEASE_ELIGIBLE
- TRANSFER_PENDING
- TRANSFERRED
- COMPLETED

Exception states:

- PAYMENT_FAILED
- CANCELED
- DELIVERY_FAILED
- DISPUTED
- RETURN_REQUESTED
- RETURN_AUTHORIZED
- RETURN_IN_TRANSIT
- REFUND_PENDING
- PARTIALLY_REFUNDED
- REFUNDED
- TRANSFER_FAILED
- TRANSFER_REVERSED
- NEEDS_REVIEW

## E5. Dealer Release Conditions

Seller proceeds may become release-eligible only after:

- Both shops are approved and active
- Both businesses have completed required verification
- Connected Stripe account is correctly linked
- Payment succeeded
- No duplicate transfer exists
- Fulfillment evidence exists
- Delivery or pickup is confirmed
- Inspection period is complete or buyer accepted
- No active transaction dispute exists
- No refund is pending
- Eligible cents are positive
- Ledger allocation reconciles
- Risk review is complete where required

## E6. Inspection Windows

Make inspection periods configurable.

Recommended initial policy:

- Local verified pickup: acceptance during pickup or within 24 hours
- Standard shipped inventory: 48 hours after delivery
- High-value goods: 72 hours
- Authentication-required goods: after authentication result
- Custom dealer lots: explicit accepted terms

Display the exact deadline.

## E7. Dealer Disputes

Support reasons such as:

- Wrong item
- Missing item
- Materially misrepresented condition
- Quantity mismatch
- Serial mismatch
- Counterfeit concern
- Shipment damage
- Incomplete dealer lot

Opening a valid dispute pauses release.

## E8. Dealer Returns

Recommended flow:

- Return requested
- Evidence uploaded
- Seller response
- PawnLoop review where necessary
- Return authorized
- Tracked return
- Returned-item inspection
- Refund or partial refund
- Pending proceeds canceled or transfer reversed

## E9. Dealer Verification

Dealer access requires:

- Approved shop
- Verified business
- Active shop
- Completed Stripe Connect onboarding
- Charges and payout readiness where required
- Accepted dealer agreement
- No blocking risk restriction
- Explicit staff permission

Recommended permissions:

- dealer-marketplace:read
- dealer-marketplace:buy
- dealer-marketplace:sell
- dealer-marketplace:approve
- dealer-marketplace:finance
- dealer-marketplace:dispute

## E10. High-Value Controls

Support configurable:

- Maximum transaction amount
- Daily buying limit
- Daily selling limit
- Manual-review threshold
- Owner approval threshold
- Two-person approval
- Signature confirmation
- Insured shipping
- Serial capture
- Packing photos
- Authentication requirement
- Delayed release
- Seller reserve
- Fraud review

Do not hard-code permanent thresholds.

## E11. Dealer Fees

Dealer fees must be configurable.

Recommended initial display proposal:

- Free: 5%
- Pro: 4%
- Plus: 3%
- Ultra: 2%

Potential fee boundaries:

- Minimum $10
- Maximum $500

Do not change live prices or fee rules in this phase.

Model and approve fees separately before activation.

---

# Part F — Dealer Marketplace Features

## F1. Dealer Navigation

Recommended navigation:

- Dealer Marketplace
- Dealer Inventory
- Bulk Lots
- Dealer Auctions
- Dealer Offers
- Wanted Inventory
- Dealer Orders
- Dealer Sales
- Dealer Messages
- Dealer Disputes
- Dealer Finance
- Dealer Analytics

V1 may use a smaller route set if the existing Dealer Marketplace page
can be extended safely.

## F2. Dealer Listings

Dealer listings should support:

- Individual item
- Bulk lot
- Quantity
- Lot condition
- Wholesale price
- Minimum order
- Shipping
- Pickup
- Inspection period
- Authentication requirement
- Seller notes
- Restricted-shop visibility where appropriate

## F3. Wanted Inventory

Verified shops should be able to post requests including:

- Category
- Brand
- Model
- Quantity
- Target price
- Maximum budget
- Condition
- Location preference
- Shipping preference
- Expiration
- Notes

Other verified shops may respond with:

- Matching inventory
- Quantity
- Price
- Counteroffer
- Fulfillment terms

## F4. Dealer Reputation

Display transparent verified metrics such as:

- Completed dealer transactions
- Dealer rating
- Cancellation rate
- On-time shipping rate
- Average fulfillment time
- Dispute rate
- Verification state

Do not display opaque or manipulative trust scores.

## F5. Dealer Credit

Net terms such as Net 15, Net 30, or Net 45 are future functionality.

Do not implement dealer credit without:

- Underwriting
- Legal review
- Credit policy
- Collections
- Loss reserves
- Reporting
- Lending-partner architecture

---

# Part G — Community Marketplace

## G1. Relationship

Customer sells to another customer.

This is future functionality.

Risks include:

- Fraud
- Identity verification
- Prohibited items
- Shipping disputes
- Tax reporting
- Chargebacks
- Seller verification
- Customer-service burden

## G2. V1 Behavior

Keep Community Marketplace disabled unless the existing feature is
already explicitly approved.

Architecture may reserve the transaction-family code but must not expose
unfinished commerce.

## G3. Future Protected Payment

A future customer-to-customer flow may use:

- Identity verification
- Stripe payment
- Delayed seller release
- Shipping or pickup confirmation
- Inspection window
- Dispute workflow
- Refund and transfer reversal

Do not call it escrow without legal approval.

---

# Part H — Auctions and Offers

Auctions and offers may exist within:

- Retail Marketplace
- Dealer Marketplace
- Community Marketplace — future

Every auction or offer must preserve its transaction family.

Do not allow a dealer auction to settle through retail rules.

Do not allow a customer-to-customer offer to use shop payout rules.

Settlement must select the correct family-specific policy.

---

# Part I — Reviews and Reputation

Keep review types separate:

- Buyer reviews pawnshop
- Pawnshop reviews dealer pawnshop
- Pawnshop reviews customer only where policy permits
- Customer reviews customer — future

Dealer reviews should require a completed dealer transaction.

Do not mix retail buyer ratings with dealer performance metrics.

---

# Part J — Plans and Entitlements

## Seller Plans

Dealer Marketplace access recommendation:

### Free

- Browse dealer inventory
- Limited wanted-inventory responses
- Limited dealer listings
- Standard dealer fee

### Pro

- Dealer buying and selling
- More active dealer listings
- Dealer offers
- Basic analytics
- Lower dealer fee

### Plus

Internal code may remain PREMIUM.

- Bulk lots
- Dealer auctions
- Wanted inventory
- Advanced analytics
- Lower dealer fee
- Multi-location eligibility

### Ultra

- Unlimited dealer inventory
- Cross-location dealer tools
- Corporate approval workflows
- Advanced dealer analytics
- API eligibility
- Lowest dealer fee

Do not change existing Stripe prices.

## Buyer Plans

Buyer plans do not automatically grant dealer access.

Dealer access requires an approved shop identity.

---

# Part K — Super Admin Dealer Operations

Add or prepare:

- Dealer Marketplace Overview
- Dealer Transactions
- Pending Releases
- Dealer Disputes
- High-Value Reviews
- Failed Transfers
- Returns
- Dealer Verification
- Dealer Risk Flags
- Dealer Fee Reporting
- Dealer Reconciliation

Administrative financial actions must be authorized and audited.

Do not expose one dealer's private information to another dealer.

---

# Part L — Reconciliation

Reconciliation must identify the transaction family.

Compare:

- Internal gross
- Stripe PaymentIntent
- Charge
- Platform fee
- Seller proceeds
- Transfer
- Refund
- Dispute
- Transfer reversal
- Stripe payout where available
- Internal ledger entries

Family-specific reconciliation must detect:

- Retail transaction using dealer rules
- Dealer transaction released before inspection
- Customer intake treated as buyer payment
- Pawn inquiry incorrectly treated as retail commerce

---

# Part M — Accessibility and UI

All transaction pages must provide:

- High-contrast text
- Readable disabled states
- Visible focus indicators
- Text labels in addition to status colors
- Loading states
- Empty states
- Error states
- Unauthorized states
- Plan-limited states
- Exact payment and release status wording

Do not render blank cards when no transaction data exists.

Do not use light-gray text on white or dark-gray text on black.

---

# Part N — Tests

Required tests:

1. Transaction family is explicit.
2. Existing transaction codes remain compatible.
3. Retail cannot settle with dealer release policy.
4. Dealer cannot settle before release eligibility.
5. Customer sell intake cannot create a retail buyer charge.
6. Pawn inquiry cannot create an online loan without approval.
7. Community transactions remain disabled.
8. Buyer-shop ownership is correct.
9. Dealer buyer shop and seller shop differ.
10. Buying shop cannot purchase its own dealer listing.
11. Both dealer shops must be approved.
12. Staff permissions are enforced.
13. Owner approval threshold is enforced.
14. High-value review threshold is configurable.
15. Inspection deadline is deterministic.
16. Active dispute blocks dealer release.
17. Transfer is idempotent.
18. Transfer does not exceed eligible proceeds.
19. Return blocks or reverses release correctly.
20. Retail refund behavior remains unchanged.
21. Dealer fee is snapshotted.
22. Plan changes do not alter historical fee snapshots.
23. Reconciliation uses the correct family.
24. Cross-shop data isolation is enforced.
25. Super Admin dealer operations require authorization.
26. Sensitive financial data remains rejected.
27. Existing payment-hardening tests pass.
28. Existing retail commerce tests pass.
29. Existing offers and auctions tests pass.
30. Frontend build, lint, and contrast checks pass.

---

# Part O — Definition of Done

- All transaction families are inventoried.
- Existing transaction behavior remains compatible.
- No duplicate payment or ledger system is created.
- Retail and dealer settlement policies are distinct.
- Sell and pawn intake reuse existing architecture.
- PawnLoop is not represented as lender or escrow provider.
- Community Marketplace remains disabled until approved.
- Dealer payments use delayed seller-release rules.
- Inspection and dispute policies are explicit.
- Dealer fees are configurable and snapshotted.
- Staff and owner approval are enforced.
- Reconciliation is family-aware.
- No live Stripe IDs, prices, charges, or payouts change.
- No migration is applied without review.
