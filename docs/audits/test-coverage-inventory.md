# PawnLoop Test Coverage Inventory

Audit date: 2026-08-01.

## Inventory

| Type | Count / location | Result and scope |
|---|---|---|
| Backend core/unit/contract | 59 files total; `test:core` selects 23 files | PASS: 200/200 tests after allowing local ephemeral listeners |
| Backend integration | `*.integration.test.js` in backend test directory | NOT RUN: guarded test DB and reachable database unavailable; script would deploy migrations to a test DB and was not invoked without confirmed safe target |
| Web browser | 13 `.spec.ts`/test files including marketplace checkout, owner application, listings, scanning | NOT RUN: authenticated seeded service/browser environment unavailable |
| Web type/build | `tsc -b && vite build` | PASS, 281 modules; largest JS chunk 491.13 kB (146.70 kB gzip), CSS 192.54 kB (27.23 kB gzip) |
| Web lint | ESLint | PASS, zero reported issues |
| Backend syntax | all JS/MJS under source/scripts/test | PASS |
| Mobile | no dedicated tests found | MISSING; lint/build not part of root validation scripts |
| Accessibility | no automated axe suite found | MISSING |
| Load/performance | none found | MISSING |
| Security | auth rate-limit, password, authorization, webhook/idempotency unit/contract tests | PARTIAL; no DAST, upload abuse, dependency policy or penetration test |
| Migration | schema contract tests and migration files | PARTIAL; live migrate status blocked; no clean-database replay performed |

## Exact validation log

| Command | Outcome |
|---|---|
| `git status --short --branch` (initial) | PASS; branch `audit/full-application-completion-v1`, initially clean |
| `git diff --check` (initial) | PASS, no output |
| `npx prisma validate --schema prisma/schema.prisma` | PASS |
| `npx prisma generate --schema prisma/schema.prisma` | PASS, Prisma Client 6.19.3 |
| `npx prisma migrate status --schema prisma/schema.prisma` | BLOCKED, P1001 cannot reach configured Neon PostgreSQL host; no migration applied |
| `npm run test:core` inside sandbox | INVALID, local listener denied with `listen EPERM`; not counted as product failure |
| `npm run test:core` with approved local listener | PASS, 200 tests, 0 failed/skipped/todo, 3.98 s test-runner duration |
| backend `node --check` sweep | PASS |
| web `npm run build` | PASS; TypeScript and production bundle |
| web `npm run lint` | PASS |
| `npm run check:frontend-routes` | COMPLETED with false-positive warnings because scanner recognized only three literal routes; not proof of reachability |
| `npm run check:backend-routes` | PASS static scan |
| `npm run check:role-routes` | BLOCKED; no process listening on `127.0.0.1:6002` |
| root/backend `npm audit --omit=dev` | PASS, 0 vulnerabilities |
| web production dependency audit | FAIL, 2 moderate React Router advisories; only offered automated fix is breaking v7 upgrade |
| mobile production dependency audit | FAIL, 19 findings: 1 low, 12 moderate, 5 high, 1 critical |

## Critical untested behavior

- Full registration/email verification/login/logout/recovery against a real database and email provider.
- Cross-user and cross-shop isolation through database-backed HTTP integration tests for every commerce mutation.
- Stripe test-mode checkout through signed webhook, fulfillment, refund, dispute, and payout reconciliation.
- Existing customer plan compatibility, past-due/trial/cancel lifecycle, and production Price/Product mapping.
- Auction scheduler and reservation expiration under concurrent workers.
- Browser role navigation and every loading, empty, error, unauthorized and plan-limited state.
- Mobile authentication/session storage, accessibility, device scanning, deep links and release builds.
- Accessibility keyboard/focus/screen-reader/contrast audits.
- Upload content validation and storage failure recovery.
- Load, N+1, query-plan, bundle-budget, QR ingestion and PDF stress testing.

