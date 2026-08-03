# PawnLoop Public Launch Readiness P0 V1

## Purpose

Close and verify the highest-priority blockers preventing a safe,
web-first public or invite-only beta launch.

This phase is not for adding new major features.

Primary workstreams:

1. Database and migration verification
2. Role and tenant isolation testing
3. Stripe test-mode lifecycle certification
4. Buyer, owner, staff, admin and Super Admin browser validation
5. Accessibility and color-contrast validation
6. Upload security and storage validation
7. Dependency remediation
8. Monitoring, backup, rollback and incident readiness
9. Legal and product-scope launch decisions

Do not apply production migrations or use live Stripe mode.

---

# Workstream A — Database and Migrations

Verify safely against an isolated staging or test database:

- Current migration status
- Pending migrations
- Unexpected migrations
- Migration ordering
- Duplicate timestamp-prefix directories
- Clean migration replay
- Seed compatibility
- Rollback approach
- Backup and restore
- Connection failure behavior

Required evidence:

- `prisma migrate status`
- clean-schema replay result
- migration list
- schema validation
- backup restore record
- no production database writes

Do not run destructive commands against production.

---

# Workstream B — Role and Tenant Matrix

Create seeded identities for:

- Public visitor
- Buyer A
- Buyer B
- Owner applicant
- Approved Owner A
- Approved Owner B
- Staff A
- Staff B
- Admin
- Super Admin

Verify:

- Cross-user denial
- Cross-shop denial
- Staff permission boundaries
- Disabled-user denial
- Inactive-membership denial
- Deleted-shop denial
- Admin and Super Admin compatibility
- Owner approval enforcement
- Unauthorized and forbidden response contracts

Every critical mutation must be tested through an authenticated HTTP or
browser flow.

---

# Workstream C — Stripe Test-Mode Certification

Use only Stripe test mode and an isolated staging database.

Certify:

- Stripe Connect hosted onboarding
- Connected-account readiness
- Secure payment-method collection
- Marketplace reservation
- Server-side payment amount
- Commission snapshot
- PaymentIntent creation
- Signed webhook success
- Duplicate webhook handling
- Out-of-order webhook handling
- Fulfillment
- Seller ledger credit
- Seller transfer
- Connected-account payout visibility
- Full refund
- Partial refund
- Dispute
- Failed payment
- Failed transfer
- Reconciliation
- Seller and buyer subscriptions
- Trial, cancellation and past-due behavior

No real charges, transfers or payouts.

Do not print secrets.

---

# Workstream D — Critical Browser Flows

Run browser tests for:

Public:

- Home
- Marketplace
- Shops
- Item detail
- Auctions
- Login
- Registration
- Password reset
- Terms
- Privacy

Buyer:

- Dashboard
- Workspace
- Watchlist
- Saved searches
- Follow Shop
- Offer
- Bid
- Buy Now
- Checkout
- Purchases
- Payment methods
- Sell or pawn submission
- Subscription

Owner:

- Application
- Approval handoff
- Onboarding
- Shop setup
- Inventory
- Listing creation
- Photos
- Offers
- Auctions
- Orders
- Finance
- Staff
- Locations
- Marketing
- Business Growth
- Dealer Marketplace

Admin:

- Users
- Owners
- Shops
- Items
- Applications
- Auctions
- Offers
- Subscriptions
- Finance actions

Super Admin:

- Growth
- Platform Success
- Marketing Administration
- Marketplace Intelligence
- Pricing
- Plans
- Revenue
- Settlements
- Audit
- Settings

For every critical route capture:

- Loading
- Empty
- Populated
- Error
- Unauthorized
- Forbidden
- Plan-limited
- Mobile-width state

---

# Workstream E — Accessibility and Contrast

Target WCAG 2.2 AA for launch-critical paths.

Verify:

- Normal text contrast
- Large text contrast
- Button contrast
- Input contrast
- Placeholder readability
- Disabled control readability
- Visible keyboard focus
- Screen-reader labels
- Heading order
- Form error association
- Status not conveyed by color alone
- Tables and charts have text equivalents
- Light theme
- Dark theme where available
- Phone, tablet and desktop layouts

No section may appear blank.

Every data section must display one of:

- Loading
- Empty state
- Data
- Error
- Access required
- Upgrade required
- Temporarily unavailable

Add automated axe coverage for launch-critical routes where practical.

---

# Workstream F — Upload Security

Verify:

- File-size limits
- MIME validation
- File signature/content sniffing
- Image decoding
- Metadata stripping
- Malware-scanning architecture
- Durable object storage
- Signed access
- Authorization
- Cross-shop isolation
- Quotas
- Failed upload cleanup
- Deletion lifecycle
- Unsupported file rejection
- Large image protection

Do not claim upload production readiness without evidence.

---

# Workstream G — Dependencies

Review without automatic destructive upgrades:

- Web production advisories
- Mobile advisories
- React Router advisory
- Expo dependency tree
- Lockfile consistency

Do not run:

- `npm audit fix --force`
- unreviewed major-version upgrades

Document:

- Advisory
- Affected package
- Reachability
- Upgrade path
- Regression requirements
- Temporary mitigation
- Risk acceptance where necessary

---

# Workstream H — Operations

Verify:

- Health endpoints
- Readiness endpoints
- Centralized logs
- Error reporting
- Metrics
- Alerts
- Stripe webhook failure alerts
- Failed payout alerts
- Email failure alerts
- Database monitoring
- Backup schedule
- Backup restore
- Deployment runbook
- Rollback runbook
- Migration runbook
- Incident response
- Support escalation
- Refund and dispute operations
- Graceful shutdown
- Scheduled-job ownership
- Multi-instance behavior

---

# Workstream I — Scope Decisions

Launch-enabled:

- Responsive web
- Public marketplace
- Verified pawnshops
- Buyer-to-shop retail
- Sell and pawn inquiry
- Offers
- Auctions only after concurrency certification
- Owner dashboards
- Marketing tools
- Super Admin operations

Disabled or deferred unless separately certified:

- Community customer-to-customer commerce
- Dealer credit
- Online pawn-loan funding
- Unverified AI benefits
- Native mobile public launch
- Generic mock-only Admin pages
- Unapproved escrow terminology

---

# Required Documents

Create:

1. `docs/audits/p0-launch-blocker-status.md`
2. `docs/audits/database-migration-evidence.md`
3. `docs/audits/role-tenant-test-matrix.md`
4. `docs/audits/stripe-test-mode-certification-results.md`
5. `docs/audits/browser-critical-flow-results.md`
6. `docs/audits/accessibility-contrast-results.md`
7. `docs/audits/upload-security-results.md`
8. `docs/audits/dependency-remediation-plan.md`
9. `docs/audits/operations-readiness-results.md`
10. `docs/audits/public-beta-go-no-go.md`

Use statuses:

- PASS
- FAIL
- BLOCKED
- PARTIAL
- DEFERRED
- NOT_RUN

The final go/no-go document must clearly state:

- Web beta decision
- General public launch decision
- Mobile launch decision
- Dealer Marketplace activation decision
- Remaining blockers
- Evidence links
- Recommended next actions

---

# Safety Rules

- Do not use live Stripe.
- Do not change live prices.
- Do not create real money movement.
- Do not modify production secrets.
- Do not reset production databases.
- Do not apply production migrations.
- Do not remove existing features.
- Do not commit or push application changes.
- Do not claim completion without evidence.
