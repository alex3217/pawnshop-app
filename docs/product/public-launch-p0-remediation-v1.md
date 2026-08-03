# PawnLoop Public Launch P0 Remediation V1

## Purpose

Resolve the highest-priority launch blockers identified by the Public
Launch Readiness P0 audit.

This phase must prioritize evidence-backed remediation over new product
features.

Primary remediation areas:

1. Migration ordering and schema drift safety
2. Browser customer-scan regression
3. Accessibility and contrast automation
4. Production upload architecture foundation
5. Web dependency remediation
6. Launch War Room status reporting
7. Operational runbook and alerting foundation

This phase must not:

- Use live Stripe
- Apply production migrations
- Reset production databases
- Change production prices
- Create real charges or payouts
- Activate Community Marketplace
- Activate Dealer Marketplace
- Launch native mobile
- Add unrelated feature suites

---

# Part A — Migration Ordering and Schema Drift

## A1. Duplicate Migration Prefix

The audit found:

- 20260722000000_auth_session_password_hardening_v1
- 20260722000000_customer_sell_transaction_handoff_v1

Do not rename an already-applied migration blindly.

Required work:

- Inspect both migration SQL files.
- Inspect repository references and deployment history.
- Determine whether either migration has already been applied in staging
  or production.
- Create a safe remediation plan for fresh-database ordering.
- Avoid modifying existing migration names until deployment history is
  known.
- Add a migration-order audit script that detects duplicate prefixes.
- Make the script fail CI when duplicates exist unless explicitly
  allowlisted with documented reasoning.

## A2. Schema Drift

The audit observed a reachable database where `PawnShop.slug` was absent.

Required work:

- Identify the migration introducing `PawnShop.slug`.
- Document expected migration order.
- Add a safe schema-drift verification script.
- Do not connect to an uncertified database.
- Do not auto-run migrations.
- Produce instructions for a disposable database replay.

## A3. Safe Database Gate

Create or extend a script that refuses database-backed tests unless:

- Database URL exists.
- Target is clearly disposable.
- Database name or host matches approved test patterns.
- Production/staging targets are rejected unless explicitly authorized.
- A clear confirmation variable is present.
- The target classification is logged without credentials.

---

# Part B — Browser Customer-Scan Regression

The Playwright suite failed because expected customer-scan controls were
not found.

Required work:

- Identify the exact failing tests.
- Inspect expected route, heading, and `What do you want?` control.
- Determine whether the UI changed, routing changed, or mocks are stale.
- Fix the application or test based on the actual intended contract.
- Do not weaken assertions merely to make tests pass.
- Run the complete Playwright marketplace suite.
- Preserve screenshots and traces for failures.
- Ensure no real backend, Stripe, or production service is contacted.

Required result:

- All mock-backed Playwright marketplace tests pass, or remaining failures
  are specifically documented.

---

# Part C — Accessibility and Contrast

## C1. Automated Axe Foundation

Add maintained accessibility tooling compatible with the current
Playwright stack.

Preferred approach:

- `@axe-core/playwright`

Add critical-route tests for:

- Home
- Marketplace
- Item detail
- Login
- Registration
- Buyer Workspace
- Owner Dashboard
- Owner Finance
- Owner Marketing Center
- Super Admin Overview
- Super Admin Revenue

Test where supported:

- Light theme
- Dark theme
- Mobile width
- Desktop width

Do not claim full WCAG compliance solely because axe passes.

## C2. Contrast and Blank States

Audit and correct:

- Low-contrast text
- Placeholder text
- Disabled controls
- Muted labels
- Buttons
- Links
- Badges
- Table headers
- Empty cards
- Loading placeholders
- Error messages
- Pending, success, warning, and failure states

Every dashboard section must show:

- Loading
- Empty state
- Populated data
- Error
- Access required
- Plan upgrade required
- Temporarily unavailable

No blank cards or blank sections.

## C3. Design Tokens

Audit current CSS variables and consolidate safe semantic tokens:

- text-primary
- text-secondary
- text-muted
- surface
- surface-elevated
- border
- focus
- success
- warning
- error
- info
- disabled-text
- disabled-surface

Avoid scattered one-off gray colors on launch-critical pages.

---

# Part D — Upload Security Foundation

## D1. Inventory CSV Upload

Harden the existing inventory-bulk CSV import:

- Explicit MIME allowlist
- Extension allowlist
- File signature/content validation where applicable
- Maximum file size
- Maximum row count
- Maximum field length
- Formula-injection mitigation
- UTF-8 handling
- Header validation
- Transactional import behavior
- Clear per-row errors
- Cross-shop authorization
- Safe filename handling
- Rate limiting
- Resource-exhaustion protection

## D2. General Image and Document Upload Plan

Do not pretend `/uploads` exists if no mounted backend exists.

Create a production upload architecture specification covering:

- Object storage
- Private buckets
- Signed URLs
- MIME and magic-byte validation
- Image decoding
- Image resizing
- EXIF stripping
- Malware scanning
- Quotas
- Authorization
- Retention
- Cleanup
- Orphan detection
- Deletion lifecycle
- Audit logging

V1 may implement only the secure CSV improvements and a disabled,
well-documented image/document upload boundary if full storage provider
configuration is unavailable.

---

# Part E — Web Dependency Remediation

The audit found two moderate React Router advisories.

Required work:

- Confirm installed versions.
- Review official upgrade guidance.
- Determine whether a safe patched v6 release exists.
- If only v7 resolves the advisories, create a compatibility plan before
  upgrading.
- Test:
  - auth redirects
  - nested routes
  - query strings
  - back/forward behavior
  - lazy routes
  - 404 handling
  - protected routes
  - admin and owner navigation
- Do not run `npm audit fix --force`.
- Do not perform an unreviewed major upgrade.

Mobile dependency remediation remains deferred to a separate phase.

---

# Part F — Launch War Room

Add a Super Admin Launch War Room page.

Recommended route:

- `/super-admin/launch-readiness`

The page should show evidence-driven statuses:

- Database
- Migrations
- Stripe
- Browser tests
- Accessibility
- Upload security
- Dependencies
- Monitoring
- Backups
- Rollback
- Role isolation
- Dealer readiness
- Mobile readiness

Allowed statuses:

- PASS
- FAIL
- BLOCKED
- PARTIAL
- DEFERRED
- NOT_RUN

Requirements:

- No hard-coded false PASS status.
- Data may initially come from a reviewed configuration or generated
  readiness artifact.
- Show evidence or reason for every status.
- Link to relevant admin pages or audit documents where possible.
- Display last-updated timestamp.
- Show separate decisions for:
  - Invite-only web beta
  - General public web
  - Mobile
  - Dealer Marketplace

The page must not expose secrets or internal file paths publicly.

---

# Part G — Operational Foundation

Create or strengthen:

- Deployment checklist
- Rollback checklist
- Migration checklist
- Backup checklist
- Restore drill checklist
- Stripe webhook incident checklist
- Failed payout incident checklist
- Email-delivery incident checklist
- Database outage checklist
- Severity definitions
- Escalation roles
- Postmortem template

Where practical, add configuration validation for:

- Error reporting
- Central logs
- Metrics
- Uptime monitoring
- Stripe webhook alerts
- Failed payout alerts
- Email failure alerts
- Database health alerts

Do not claim provider integrations are configured without evidence.

---

# Part H — Tests

Required coverage:

1. Duplicate migration prefixes are detected.
2. Database safety guard rejects unsafe targets.
3. Customer-scan Playwright regression is fixed.
4. Full mock Playwright suite runs.
5. Axe tests cover critical routes.
6. Light and dark theme tests run where supported.
7. Mobile and desktop viewport tests run.
8. No blank launch-critical sections.
9. CSV rejects unsupported MIME.
10. CSV rejects oversized files.
11. CSV rejects excessive rows.
12. CSV neutralizes spreadsheet formulas.
13. CSV cross-shop authorization is enforced.
14. Launch War Room requires Super Admin.
15. Launch War Room never reports unsupported PASS states.
16. Existing backend core suite passes.
17. Existing payment and transaction-family tests pass.
18. Frontend build passes.
19. Frontend lint passes.
20. `git diff --check` passes.

---

# Part I — Deliverables

Create:

- docs/implementation/public-launch-p0-remediation-audit.md
- docs/implementation/public-launch-p0-remediation-summary.md
- docs/implementation/public-launch-p0-remediation-test-report.md
- docs/implementation/disposable-database-certification-runbook.md
- docs/implementation/accessibility-certification-runbook.md
- docs/implementation/upload-security-architecture.md
- docs/implementation/launch-war-room-data-contract.md
- docs/implementation/production-incident-checklists.md

Update:

- docs/audits/p0-launch-blocker-status.md
- docs/audits/public-beta-go-no-go.md

Only update blocker status when supported by new evidence.

---

# Definition of Done

- Audit results are preserved.
- Duplicate migration ordering is detected automatically.
- No unsafe database target is used.
- Customer-scan Playwright regression is fixed.
- Complete mock browser suite passes or exact failures remain documented.
- Axe automation exists for launch-critical routes.
- Contrast and blank-state defects found are fixed.
- CSV upload is materially hardened.
- General upload architecture is documented honestly.
- Web dependency remediation path is reviewed and tested.
- Launch War Room is evidence-driven.
- Operational checklists are complete.
- No live Stripe or production migration activity occurs.
