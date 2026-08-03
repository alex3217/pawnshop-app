# PawnLoop Confirmed Launch Blockers

Audit date: 2026-08-01. These block a general production launch; a narrower invite-only beta may explicitly defer mobile and non-core admin/growth surfaces.

| ID | Blocker | Exact evidence | Exit criterion | Estimate |
|---|---|---|---|---|
| LB-01 | Database/migration state cannot be verified | `prisma migrate status` returned P1001 for the configured Neon host; 45 migration directories exist, including two with the same `20260722000000` prefix | Staging/production read-only status proves expected migrations; clean replay and rollback rehearsal documented | 1–3 days plus access |
| LB-02 | No production-like role/workflow E2E evidence | Role-route check could not connect to port 6002; browser suites were not run | Seeded staging matrix passes Public, Buyer, Owner, Staff, Admin, Super Admin navigation, states, isolation and critical actions | 4–8 days |
| LB-03 | Payment and seller-funds lifecycle lacks provider E2E certification | Unit/service tests pass, but no Stripe test-mode checkout → webhook → fulfillment → refund/dispute → payout run was proven | Signed webhook and reconciliation scenarios pass with test-mode Stripe and documented recovery | 4–7 days |
| LB-04 | Plan/catalog compatibility unverified | Seller uses internal `PREMIUM`; buyer has both `PLUS` and `PREMIUM`; provider IDs/existing subscriptions were not inspected | Approved mapping table reconciles internal/display/product/price/monthly/yearly/existing customer behavior without modifying prices | 2–4 days |
| LB-05 | Accessibility and responsive critical flows not validated | No axe/mobile accessibility suite or manual WCAG report | WCAG 2.2 AA critical-flow audit passes or launch exceptions are signed off | 3–6 days |
| LB-06 | Web production dependencies have known vulnerabilities | npm audit: 2 moderate React Router advisories, including open redirect; automatic fix proposes breaking v7 | Upgrade/backport and regression tests, or documented risk acceptance with mitigations | 1–3 days |
| LB-07 | Mobile dependency/security and auth UX are not launch-ready, if mobile is included | npm audit: 19 findings (1 critical, 5 high); scanner asks for pasted bearer token and shop ID; no test suite | Upgrade Expo dependency tree, use secure authenticated session/shop picker, and pass device/release/security tests—or explicitly exclude mobile from launch | 4–10 days |
| LB-08 | Upload security/durability not proven | Upload code exists but no evidence of malware scanning, MIME/content sniffing, durable object storage, quotas, or abuse E2E | Documented storage architecture and adversarial upload tests pass | 2–5 days |
| LB-09 | Operational readiness incomplete | No evidence gathered for backup restore drill, alerts, error reporting, migration rollback, incident/support runbooks | Staging rehearsal proves backups/restores, monitoring/alerts, graceful deploy/rollback and on-call procedures | 3–6 days |
| LB-10 | Core concurrency/isolation integration coverage is incomplete | Core units pass, but integration suite was not safely runnable and critical HTTP/DB races remain unproven | Concurrent reserve, bid, offer acceptance, inventory restore and idempotency tests pass on isolated test DB | 3–6 days |

## High-priority defects (not necessarily broad-launch blockers)

- Several controllers compare only `ADMIN` while the Admin router admits `SUPER_ADMIN`, risking inconsistent Super Admin behavior.
- `/settlements` is linked from the UI but no matching standalone web route was found.
- Generic Admin Orders, Reviews, Support, Revenue, Analytics, Risk, Audit, System and Settings pages display hard-coded qualitative metrics and should not be represented as complete operational products.
- Frontend route audit tooling does not parse array-defined routes and therefore produces misleading warnings.
- Multiple admin/dashboard and public list queries appear unbounded; Admin users explicitly calls `findMany` without pagination.
- `PAST_DUE` plans are treated as usable in seller and buyer configuration; business grace policy needs explicit approval and tests.
- API error response shapes vary between routers/controllers.

No application code was corrected during this audit.

