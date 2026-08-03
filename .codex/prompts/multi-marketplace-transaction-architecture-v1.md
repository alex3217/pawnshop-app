Work in the PawnLoop repository on:

feature/multi-marketplace-transaction-architecture-v1

Read:

docs/product/multi-marketplace-transaction-architecture-v1.md

This phase defines and safely implements the architecture for:

- Buyer to pawnshop retail
- Customer sell to pawnshop
- Customer pawn inquiry to pawnshop
- Pawnshop to pawnshop Dealer Marketplace
- Future customer-to-customer Community Marketplace

Do not create a second payment, ledger, transaction, offer, auction,
intake, messaging, or dispute system.

AUDIT FIRST

Inspect:

- Prisma transaction-related models and enums
- MarketplaceTransaction
- MarketplaceListing
- Settlement
- SellerBalanceLedger
- BuyerItemSubmission
- ItemIntake
- Offer
- Auction
- Bid
- Refund and dispute models
- Connected-account and payout models
- DealerMarketplacePage
- Buyer sell/pawn pages
- Owner intake pages
- Marketplace transaction services
- Payment and webhook services
- Auction settlement services
- Offer settlement services
- Shop permissions
- Seller entitlements
- Existing dealer or B2B code
- Existing transaction type values
- Existing migrations
- Tests and fixtures

Create:

docs/implementation/multi-marketplace-transaction-audit.md

Include:

- Transaction family
- Existing implementation
- Existing codes
- Existing routes
- Existing data model
- Complete
- Partial
- Missing
- Compatibility risk
- Financial risk
- Legal/policy risk
- Implementation decision

IMPLEMENTATION PRINCIPLES

1. Preserve existing transaction codes and records.
2. Add compatibility mappings rather than unsafe renames.
3. Use the existing separate-charge-and-transfer foundation.
4. Do not call PawnLoop an escrow provider.
5. Do not make PawnLoop the pawn lender.
6. Do not activate Community Marketplace.
7. Do not create multi-shop retail carts.
8. Do not change live Stripe prices or IDs.
9. Do not create real charges, transfers, or payouts.
10. Do not apply migrations.
11. Do not reset databases.
12. Do not modify environment files.
13. Do not commit or push.

A. TRANSACTION FAMILY RESOLVER

Create or extend one centralized resolver that maps existing records to:

- RETAIL_BUYER_TO_SHOP
- CUSTOMER_SELL_TO_SHOP
- CUSTOMER_PAWN_TO_SHOP
- DEALER_SHOP_TO_SHOP
- COMMUNITY_CUSTOMER_TO_CUSTOMER

If no schema change is required, avoid one.

If a schema field is essential:

- Create a nondestructive migration
- Do not apply it
- Backfill rules must be explicit
- Preserve all existing transaction records
- Add indexes if required

B. FAMILY-SPECIFIC POLICY

Implement centralized family policy describing:

- Buyer type
- Seller type
- Payment required
- Inspection required
- Delayed release required
- Stripe charge model
- Refund support
- Dispute support
- Transfer eligibility
- Staff permissions
- Owner approval
- Community enabled state

C. RETAIL

Preserve current behavior.

Do not regress:

- Reservations
- PaymentIntent creation
- Webhooks
- Fulfillment
- Seller ledger
- Refunds
- Disputes
- Transfers
- Reconciliation

D. CUSTOMER SELL / PAWN

Reuse BuyerItemSubmission and ItemIntake.

Clearly distinguish:

- SELL
- PAWN

Do not create an online pawn-loan funding workflow.

Add or strengthen:

- Inspection state
- Offer state
- Appointment state
- Shop review
- Customer withdrawal
- Owner response

E. DEALER MARKETPLACE

Audit and extend the existing DealerMarketplacePage rather than creating
a duplicate.

Implement the safest V1 foundation:

- Verified-shop access
- Dealer listings or existing suitable listing type
- Dealer transaction family
- Buying shop
- Selling shop
- Own-listing rejection
- Dealer permissions
- Protected Dealer Payment wording
- Payment-secured state
- Fulfillment
- Delivery or pickup
- Inspection deadline
- Buyer acceptance
- Release eligibility
- Transfer eligibility
- Dispute release hold
- Return foundation
- Dealer fee snapshot
- Plan eligibility

Use separate charges and transfers.

Do not create a Stripe Transfer until the existing financial eligibility
and the dealer release conditions are both satisfied.

F. DEALER PERMISSIONS

Add or reuse:

- dealer-marketplace:read
- dealer-marketplace:buy
- dealer-marketplace:sell
- dealer-marketplace:approve
- dealer-marketplace:finance
- dealer-marketplace:dispute

Owners retain authorized access.

Staff actions must remain shop-scoped.

G. DEALER RISK CONTROLS

Represent configurable:

- Transaction limit
- Daily limit
- Manual-review threshold
- Owner-approval threshold
- Inspection duration
- Signature requirement
- Insurance requirement
- Authentication requirement

Do not permanently hard-code business thresholds.

H. WANTED INVENTORY

Audit for existing request or lead models.

If safe for V1, add a minimal Wanted Inventory foundation using existing
listing/inquiry architecture.

Do not create another general messaging system.

I. COMMUNITY MARKETPLACE

Reserve architecture only.

The API and UI must report:

- enabled: false
- reason: separate verification, fraud, policy, and legal approval required

Do not expose unfinished customer-to-customer purchase actions.

J. OFFERS AND AUCTIONS

Ensure every settlement selects the correct transaction-family policy.

Dealer offers and dealer auctions must not settle through retail policy.

Preserve current retail offer and auction behavior.

K. RECONCILIATION

Extend financial reconciliation to include:

- transactionFamily
- expected charge policy
- expected inspection requirement
- expected delayed release
- release eligibility
- dispute hold
- expected seller identity type

Detect policy mismatches without automatically changing records.

L. FRONTEND

Retail:

- Preserve existing buyer and owner flows.

Sell / Pawn:

- Make SELL versus PAWN clear.
- Show inspection and appointment status.
- Do not imply online loan funding.

Dealer:

- Extend Dealer Marketplace
- Dealer inventory
- Wanted inventory where implemented
- Dealer transactions
- Payment secured
- Fulfillment
- Inspection
- Release status
- Disputes
- Finance
- Plan-limited state

Community:

- Do not expose active commerce.
- Show future/disabled state only if the route already exists.

Required UI states:

- Loading
- Empty
- Error
- Unauthorized
- No shop
- Verification required
- Plan limited
- Payment pending
- Inspection pending
- Disputed
- Release eligible
- Transfer failed

M. SUPER ADMIN

Add or extend Dealer Operations with:

- Dealer transactions
- Pending releases
- Disputes
- High-value reviews
- Failed transfers
- Returns
- Verification
- Reconciliation mismatches

All actions require authorization and audit logging.

N. TESTS

Add tests for all requirements in the product specification, especially:

- Family compatibility
- Retail regression
- Sell/pawn distinction
- Dealer own-listing rejection
- Two approved shops
- Staff permissions
- Inspection deadline
- Dispute release hold
- Transfer eligibility
- Dealer fee snapshot
- Family-aware reconciliation
- Community disabled behavior
- Cross-shop isolation

VALIDATION

Run:

- Prisma format, validate, and generate if schema changes
- Transaction-family tests
- Dealer Marketplace tests
- Customer sell/pawn tests
- Payment-hardening tests
- Retail payment tests
- Offer tests
- Auction tests
- Refund/dispute tests
- Payout tests
- Authorization tests
- Backend core suite
- Frontend build
- Frontend lint
- git diff --check

DOCUMENTATION

Create:

docs/implementation/multi-marketplace-transaction-summary.md
docs/implementation/multi-marketplace-transaction-test-report.md
docs/implementation/dealer-marketplace-operations-runbook.md
docs/implementation/dealer-dispute-and-return-policy-draft.md

FINAL REPORT

Report:

1. Existing transaction types
2. Compatibility mapping
3. Retail behavior
4. Sell behavior
5. Pawn inquiry behavior
6. Dealer behavior
7. Community disabled behavior
8. Charge and transfer behavior
9. Inspection and release policy
10. Dealer fees
11. Permissions
12. Risk controls
13. Models and migrations
14. APIs and routes
15. Frontend pages
16. Super Admin operations
17. Reconciliation
18. Tests
19. Exact validation outcomes
20. Deferred work
21. Legal and policy risks
22. Git status
23. Suggested commit message

Do not commit or push.
