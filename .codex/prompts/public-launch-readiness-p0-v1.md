Work in the PawnLoop repository on:

audit/public-launch-readiness-p0-v1

Read:

docs/audits/public-launch-readiness-p0-v1.md

This is a P0 launch-readiness verification phase.

Do not begin another product feature suite.

AUDIT AND VERIFY

Focus on:

1. Database and migration evidence
2. Role and tenant isolation
3. Stripe test-mode lifecycle certification
4. Browser critical-flow validation
5. Accessibility and color contrast
6. Upload security
7. Dependency remediation planning
8. Monitoring, backup, rollback and incident readiness
9. Launch-scope decisions

EXISTING FOUNDATIONS

Reuse and validate:

- Authentication and role middleware
- Shop access
- Marketplace transactions
- Seller ledger
- Payment hardening
- Financial reconciliation
- Refund and dispute services
- Stripe Connect
- Buyer and seller subscriptions
- Offers
- Auctions
- Customer sell and pawn intake
- Dealer transaction-family policy
- Marketing and Growth platforms
- Super Admin operations

DATABASE SAFETY

Do not apply migrations to production.

Run migration status only against an explicitly isolated test or staging
database.

Do not run database reset or destructive SQL.

ROLE MATRIX

Create or use safe test fixtures for:

- Public
- Two buyers
- Two owners
- Two staff identities
- Admin
- Super Admin

Prove cross-user and cross-shop denial through actual HTTP or browser
requests.

STRIPE SAFETY

Use only Stripe test mode.

Do not print or write secrets.

Do not create live charges, transfers, payouts, refunds or disputes.

If safe test-mode provider access is unavailable, mark the result
BLOCKED rather than simulating certification.

ACCESSIBILITY

Run static and automated accessibility checks where possible.

Inspect all critical pages in light and dark themes.

Correct only small, clearly evidenced contrast or blank-state defects.

Do not claim WCAG compliance solely from code inspection.

UPLOADS

Audit upload handlers, storage, MIME validation, limits, authorization,
metadata handling and cleanup.

Do not upload malicious files to production services.

DEPENDENCIES

Run read-only dependency audits.

Do not run `npm audit fix --force`.

Do not make broad major upgrades without a reviewed compatibility plan.

DELIVERABLES

Create all ten required documents from the specification.

The final `public-beta-go-no-go.md` must provide separate decisions for:

- Web invite-only beta
- General web public launch
- Mobile launch
- Dealer Marketplace activation

VALIDATION

Run where safely supported:

- Git status and diff check
- Prisma validate and generate
- Migration status on isolated target only
- Backend core tests
- Relevant financial and transaction-family tests
- Browser tests
- Accessibility tests
- Frontend build
- Frontend lint
- Dependency audit
- Route checks
- Health and readiness checks

Do not commit, push or merge.

FINAL REPORT

Report:

1. Exact commands run
2. Exact pass/fail/blocked outcomes
3. Database readiness
4. Role-isolation readiness
5. Stripe readiness
6. Browser readiness
7. Accessibility readiness
8. Upload readiness
9. Dependency status
10. Operational readiness
11. Beta go/no-go
12. Public launch go/no-go
13. Mobile go/no-go
14. Dealer activation go/no-go
15. Remaining blockers
16. Files created or changed
17. Git status

Do not commit or push.
