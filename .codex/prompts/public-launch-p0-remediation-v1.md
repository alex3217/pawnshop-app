Work in the PawnLoop repository on:

fix/public-launch-p0-remediation-v1

Read:

docs/product/public-launch-p0-remediation-v1.md

Also read:

docs/audits/p0-launch-blocker-status.md
docs/audits/public-beta-go-no-go.md
docs/audits/database-migration-evidence.md
docs/audits/browser-critical-flow-results.md
docs/audits/accessibility-contrast-results.md
docs/audits/upload-security-results.md
docs/audits/dependency-remediation-plan.md
docs/audits/operations-readiness-results.md

This is a P0 remediation phase.

Do not begin another feature suite.

PRIORITY ORDER

1. Migration ordering and database safety tooling
2. Customer-scan Playwright failure
3. Full mock Playwright suite
4. Axe/accessibility automation
5. Contrast and blank-state fixes
6. CSV upload security
7. React Router remediation analysis or safe patch
8. Super Admin Launch War Room
9. Operational runbooks
10. Evidence updates

DATABASE RULES

- Do not run migrations.
- Do not reset any database.
- Do not connect to an uncertified database.
- Add static scripts and safe guards only.
- Do not rename migration directories until applied-history evidence is
  available.
- Detect duplicate timestamp prefixes in CI.

BROWSER RULES

- Determine whether customer-scan failures are application regressions or
  stale tests.
- Fix the real contract.
- Do not weaken meaningful assertions.
- Use mock/local services only.
- Preserve traces and screenshots for failures.

ACCESSIBILITY RULES

- Add `@axe-core/playwright` if compatible.
- Test critical routes in supported themes and viewports.
- Fix evidenced defects.
- Do not claim full WCAG compliance solely from axe.
- Ensure every launch-critical section has a visible state.

UPLOAD RULES

- Harden CSV upload without adding an insecure general upload endpoint.
- Add MIME, size, row, field, formula, encoding, and authorization
  safeguards.
- Document secure object-storage architecture.
- Do not upload files to production services.

DEPENDENCY RULES

- Do not run `npm audit fix --force`.
- Do not perform an unreviewed React Router major upgrade.
- Prefer a safe patched compatible version if available.
- If a major upgrade is necessary, document and defer it unless the
  complete route regression can be executed safely.

LAUNCH WAR ROOM

Add a Super Admin-only page that reports evidence-driven readiness.

Do not hard-code PASS.

Use the statuses:

- PASS
- FAIL
- BLOCKED
- PARTIAL
- DEFERRED
- NOT_RUN

IMPLEMENTATION AUDIT

Create:

docs/implementation/public-launch-p0-remediation-audit.md

Include:

- Blocker
- Existing evidence
- Root cause
- Files
- Safe remediation
- Result
- Remaining risk

TESTS

Add focused tests for:

- Migration-prefix detection
- Unsafe DB target rejection
- CSV safeguards
- Launch War Room authorization/data
- Browser regression
- Axe critical routes

VALIDATION

Run safely:

- New static scripts
- Focused backend tests
- Backend core suite
- Full mock Playwright suite
- Axe tests
- Frontend build
- Frontend lint
- Mobile lint only if unaffected
- Prisma validate
- Prisma generate
- Read-only dependency audit
- `git diff --check`

Do not:

- Use live Stripe
- Apply migrations
- Reset databases
- Modify environment files
- Create real money movement
- Commit or push

DOCUMENTATION

Create all deliverables from the product specification.

Update blocker and go/no-go documents only when evidence supports a
status change.

FINAL REPORT

Report:

1. Migration-order remediation
2. Database safety tooling
3. Browser regression result
4. Playwright result
5. Accessibility result
6. Contrast/blank-state fixes
7. Upload result
8. Dependency result
9. Launch War Room behavior
10. Operations documentation
11. Files changed
12. Tests
13. Exact validation outcomes
14. Remaining blockers
15. Updated beta/public/mobile/dealer decisions
16. Git status
17. Suggested commit message

Do not commit or push.
