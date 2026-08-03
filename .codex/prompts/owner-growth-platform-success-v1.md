Work in the PawnLoop repository on:

feature/owner-growth-platform-success-v1

Read:

docs/product/owner-growth-platform-success-v1.md

Existing foundations are already committed:

- Super Admin Growth Center
- Owner Marketing Center
- Shop QR campaigns
- Buyer Workspace
- Buyer entitlements
- Seller plan configuration
- Owner subscription pages
- Super Admin plan controls

Do not create duplicate systems.

PHASE OBJECTIVE

Implement the safest complete V1 foundation for:

1. Owner Business Growth Center
2. Shop Health Score
3. Marketing Setup Checklist
4. Inventory and customer insights
5. Growth opportunity cards
6. Seller-plan entitlement and usage foundation
7. Super Admin Platform Success Center

AUDIT FIRST

Before changing code, inspect:

- Prisma schema
- PawnShop model
- Item and inventory models
- Orders, settlements, payouts, revenue, refunds, and disputes
- Reviews
- Messages and offers
- Auctions
- Shop onboarding
- Stripe Connect onboarding
- Seller subscription configuration
- Seller plan codes
- Stripe seller price mappings
- Existing listing limits
- Location limits
- Staff limits
- Auction gates
- Featured-listing gates
- Marketing campaign limits
- Owner Dashboard
- Owner Subscription page
- Super Admin overview and analytics pages
- Growth Center
- Existing audit logging
- Existing shop staff permissions
- Existing analytics/event models

Create before implementation:

docs/implementation/owner-growth-platform-success-audit.md

Include a matrix:

- Requirement
- Existing support
- Relevant files
- Complete
- Partial
- Missing
- Risk
- Safe implementation decision

IMPLEMENTATION PRIORITIES

A. CENTRAL SELLER ENTITLEMENTS

Reuse the existing seller plan source.

Add or extend a centralized backend entitlement resolver.

Preserve internal stored codes and Stripe mappings.

Customer-facing mapping may display Premium as Plus where required.

Do not change live prices.

Represent:

- Listing limit
- Location limit
- Staff limit
- Auction access
- Featured-listing access
- QR campaign limit
- Analytics level
- Marketing level
- Business Growth level
- Shop Health access
- Business Coach level
- Digital-display eligibility
- Benchmarking eligibility
- API eligibility
- Support level
- Commission basis points
- Implementation status

Enforce only real implemented limits.

B. OWNER PLAN USAGE

Add or extend an authenticated shop-scoped usage API.

Include:

- Seller plan
- Display name
- Status
- Active listings
- Locations
- Staff
- Active QR campaigns
- Limits
- Commission
- Implemented feature levels
- Planned feature eligibility

C. BUSINESS GROWTH SERVICE

Create one reusable shop-scoped service that calculates:

- Growth overview
- Shop Health Score
- Shop Health components
- Marketing checklist
- Inventory insights
- Customer insights
- Revenue summary
- Growth opportunities

Use real project data.

Do not hard-code sample production numbers.

D. SHOP HEALTH SCORE

Make the score deterministic and explainable.

Return:

- Total score
- Maximum score
- Component scores
- Missing items
- Recommended actions
- Calculation version

Do not treat missing optional data as misconduct.

E. OWNER FRONTEND

Add:

- /owner/business-growth

Prefer one strong consolidated V1 page.

Include:

- Overview metrics
- Shop Health
- Marketing checklist
- Inventory insights
- Customer insights
- Revenue summary
- Growth opportunities
- Plan usage
- Loading state
- Empty state
- Error state
- No-shop state
- No-permission state

Use existing owner design patterns.

F. OWNER STAFF PERMISSIONS

Add or reuse explicit permissions such as:

- growth:read
- analytics:read

Only add new permission codes if the current architecture requires them.

Owners retain full authorized access.

G. SUPER ADMIN PLATFORM SUCCESS

Add:

- /super-admin/platform-success

Create APIs and UI for:

- Overview
- Shops needing onboarding help
- Shops with zero active inventory
- Shops without marketing setup
- Shops near plan limits
- Shops with incomplete Stripe setup
- Marketing adoption
- Seller plan mix
- Buyer plan mix
- Action queue

Use real data.

Do not expose private Growth Center contacts.

H. AUDIT LOGGING

Classify Platform Success administrative mutations or actions using
existing audit architecture.

Read-only analytics do not require fake mutation logs.

I. TESTS

Add targeted tests for:

- Seller internal/display plan compatibility
- Seller entitlement resolver
- Seller usage calculations
- QR campaign limit representation or enforcement
- Shop Health deterministic result
- Shop Health component totals
- Owner cross-shop isolation
- Staff permission enforcement
- Platform Success admin authorization
- Platform Success aggregate privacy
- Empty dataset behavior
- Existing Marketing Center regression
- Existing Buyer Phase 1 regression
- Existing seller subscription compatibility

VALIDATION

Run, where applicable:

- Prisma format
- Prisma validate
- Prisma generate
- Targeted owner-growth tests
- Targeted seller-plan tests
- Growth Marketing tests
- Buyer entitlement tests
- Backend core tests
- Frontend build
- Frontend lint
- git diff --check

Do not commit or push.

Do not:

- Apply migrations
- Reset databases
- Change production prices
- Replace Stripe identifiers
- Cancel or downgrade subscriptions
- Modify environment files
- Remove existing functionality
- Perform unrelated refactors
- Claim AI functionality exists if it is only rule-based

DOCUMENTATION

Create:

docs/implementation/owner-growth-platform-success-summary.md
docs/implementation/owner-growth-platform-success-test-report.md

Update relevant existing implementation documentation.

FINAL REPORT

Report:

1. Architecture reused
2. Existing systems audited
3. Files modified
4. Files added
5. Models or migrations
6. APIs
7. Frontend routes
8. Entitlement behavior
9. Shop Health calculation
10. Platform Success behavior
11. Authorization
12. Tests
13. Exact validation outcomes
14. Deferred features
15. Risks
16. Git status
17. Suggested commit message

Do not commit or push.
