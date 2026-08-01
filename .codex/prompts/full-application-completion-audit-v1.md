Work in the PawnLoop repository on:

audit/full-application-completion-v1

Read:

docs/audits/full-application-completion-audit-v1.md

This is a full completion and production-readiness audit.

Do not begin by implementing another feature suite.

Your job is to inspect, validate, test, and document the actual current
state of the entire application.

AUDIT PRINCIPLES

1. A file existing does not prove a feature works.
2. A route existing does not prove it is reachable.
3. A frontend button existing does not prove the backend action works.
4. A passing build does not prove runtime behavior.
5. A mocked metric is not a complete feature.
6. Frontend gating is not authorization.
7. Do not claim a feature is complete without evidence.
8. Preserve exact internal plan and Stripe compatibility.
9. Do not apply migrations.
10. Do not reset databases.
11. Do not modify environment files.
12. Do not commit or push.
13. Do not perform broad refactors.
14. Small corrections are permitted only for clear launch-blocking defects
    and must be documented separately.

REQUIRED FIRST STEPS

Inventory:

- All backend routes
- All controllers
- All services
- All Prisma models
- All migrations
- All frontend routes
- All pages
- All role navigation
- All permissions
- All package scripts
- All tests
- All environment-variable references
- All external integrations

Create the route, API, permission, model, migration, and page inventories
before assigning completion status.

REQUIRED VALIDATION

Run where safe:

- git status
- git diff --check
- Prisma validate
- Prisma generate
- Prisma migrate status
- Backend syntax checks
- Backend core tests
- Relevant contract tests
- Frontend TypeScript build
- Frontend production build
- Frontend lint
- Route import checks
- Duplicate-route search
- Missing-page import search
- Permission-code comparison
- Environment-reference inventory
- Dependency audit in non-destructive mode
- Health endpoint contract tests

Do not apply migrations.

ROLE AUDITS

Audit separately:

- Public
- Buyer
- Owner
- Staff
- Admin
- Super Admin

For every major role verify:

- Navigation
- Route access
- API authorization
- Cross-user isolation
- Cross-shop isolation
- Empty states
- Loading states
- Error states
- Unauthorized states
- Plan-limited states
- Mobile behavior

CORE WORKFLOW AUDITS

Verify end-to-end architecture for:

- Registration and verification
- Login and logout
- Owner application
- Owner approval
- Shop onboarding
- Inventory creation
- Marketplace publication
- Buy Now
- Reservation
- Stripe payment
- Transaction completion
- Fulfillment
- Refund
- Dispute
- Seller payout
- Offers
- Auctions
- Buyer item submission
- Seller subscriptions
- Buyer subscriptions
- QR marketing
- Follow Shop
- Referrals
- Business Growth
- Marketplace Intelligence
- Super Admin Growth Center
- Platform Success
- Marketing Administration

PLAN AND ENTITLEMENT AUDIT

Verify seller and buyer plans against:

- Internal codes
- Display names
- Stripe mappings
- Feature gates
- Backend enforcement
- Frontend messaging
- Current usage APIs
- Limits
- Existing subscriptions
- Webhooks
- Cancellation
- Past due
- Trials

Do not modify prices.

SECURITY AUDIT

Inspect:

- Public data exposure
- PII exposure
- Admin authorization
- Staff permissions
- Open redirects
- File upload validation
- Rate limiting
- Webhook verification
- Idempotency
- Password handling
- JWT handling
- Error leakage
- Audit logging
- CORS and security headers
- Dependency vulnerabilities

PERFORMANCE AUDIT

Inspect:

- Unbounded findMany calls
- Missing pagination
- Dashboard aggregation queries
- Missing indexes
- N+1 queries
- Repeated frontend requests
- Large bundle warnings
- Large image handling
- PDF generation cost
- Public endpoint rate limits

DELIVERABLES

Create all files required by the specification:

- full-application-completion-matrix.md
- launch-blockers.md
- post-launch-roadmap.md
- route-and-page-inventory.md
- api-and-permission-inventory.md
- test-coverage-inventory.md
- production-readiness-checklist.md
- full-application-audit-summary.md

The audit summary must include:

1. Overall estimated completion percentage
2. Buyer completion
3. Owner completion
4. Admin completion
5. Super Admin completion
6. Commerce completion
7. Billing completion
8. Marketing completion
9. Security readiness
10. Production readiness
11. Confirmed launch blockers
12. High-priority defects
13. Post-launch features
14. Exact tests and validation outcomes
15. Files changed
16. Git status
17. Recommended implementation order

Do not commit or push.
