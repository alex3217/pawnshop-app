# Role and Tenant Certification Results

Certification date: 2026-08-01 (America/Chicago)  
Branch: `certify/seeded-role-tenant-matrix-v1`
Overall result: **PASS**

## Safety and execution

The certification ran only against PostgreSQL 16 on the redacted loopback target `127.0.0.1:[redacted]/pawnshop_test`. The command required `NODE_ENV=test`, `APP_ENV=test`, `CONFIRM_DISPOSABLE_DATABASE=YES_DELETE_TEST_DATA`, a recognized disposable host, and the exact `pawnshop_test` database before any migration or seed operation. No staging or production system was accessed.

`npm run test:role-tenant-certification` deployed the existing migrations (45 found, none pending), generated Prisma Client 6.19.3, applied the idempotent certification seed, and ran the focused Node test suite serially.

No passwords, JWT secrets, JWTs, cookies, database credentials, or private generated IDs are recorded here. The certification runner generates the fixture password in memory and passes it through the focused child-process environment; the focused test independently generates its JWT signing secret in memory before importing the application. Neither value is printed or written.

## Seeded matrix

The application role used for buyers and staff identities is the real Prisma `CONSUMER` role; no `BUYER` role was added.

Seeded actors:

- Buyer A, Buyer B, and Disabled Buyer (`CONSUMER`)
- approved Owner A and approved Owner B (`OWNER`)
- Pending Owner with a `PENDING` owner application (`OWNER`)
- Active Staff A and Inactive Staff (`CONSUMER` identities with persisted `Staff` rows)
- Administrator (`ADMIN`)
- Super Administrator (`SUPER_ADMIN`)

Seeded resources:

- Shop A, owned by Owner A, and a Shop A item
- Shop B, owned by Owner B, and a Shop B item
- Buyer A-owned and Buyer B-owned item submissions
- active Shop A staff membership with `staff:read`
- inactive Shop A staff membership with the same assigned permission, proving status prevents access

All fixture IDs and emails are stable, all mutable certification state is restored by upsert, and repeated focused runs passed.

## Authenticated HTTP matrix

All requests exercised the Express application with Supertest through the real login route, JWT validation, database-backed active-user check, role middleware, owner-approval check, shop-access middleware, controllers, and Prisma persistence.

| Scenario | Route and observed result | Result |
|---|---|---|
| Buyer A accesses Buyer A resource | `GET /api/buyer/item-submissions/mine` → 200; only Buyer A fixture returned | PASS |
| Buyer A accesses Buyer B resource | `PATCH /api/buyer/item-submissions/[Buyer B]/withdraw` → 404 `Submission not found` | PASS |
| Buyer B accesses Buyer A resource | `PATCH /api/buyer/item-submissions/[Buyer A]/withdraw` → 404 `Submission not found` | PASS |
| Owner A accesses Shop A / Shop B | own update → 200; cross-tenant update → 403 `Forbidden` | PASS |
| Owner B accesses Shop B / Shop A | own update → 200; cross-tenant update → 403 `Forbidden` | PASS |
| Active Staff A uses Shop A permission | `GET /api/staff/shop/[Shop A]` → 200 and persisted membership returned | PASS |
| Active Staff A accesses Shop B | `GET /api/staff/shop/[Shop B]` → 403 | PASS |
| Inactive staff accesses Shop A | `GET /api/staff/shop/[Shop A]` → 403 | PASS |
| Disabled buyer authenticates | `POST /api/auth/login` → 401 `Invalid credentials` | PASS |
| Pending owner accesses business route | `GET /api/shops/mine` → 403 `OWNER_APPLICATION_NOT_APPROVED`, status `PENDING` | PASS |
| Administrator accesses admin route | `GET /api/admin/users` → 200 | PASS |
| Super Administrator accesses platform route | `GET /api/super-admin` → 200 with `SUPER_ADMIN` actor | PASS |

Focused total: **11 passed, 0 failed**.

The focused certification test is intentionally excluded from the general
`*.integration.test.js` glob. It requires a generated runtime credential and
the deterministic role-and-tenant certification seed, and is executed only
through `npm run test:role-tenant-certification`.

## Browser role-routing smoke

The existing Playwright harness supports deterministic Chromium execution with one worker and an isolated local Vite server. A focused three-case smoke suite was added and passed:

- unauthenticated protected-route access redirects to `/login`
- a persisted-in-browser `CONSUMER` session is redirected away from `/super-admin`
- a persisted-in-browser `SUPER_ADMIN` session enters `/super-admin` and renders Platform Control

Browser total: **3 passed, 0 failed**. The harness uses intercepted API responses and local-storage sessions, so this result certifies frontend routing only. It is not presented as persisted authentication or tenant-isolation evidence; those boundaries are proven by the database-backed HTTP matrix above.

## Regression gates

| Command | Result |
|---|---|
| `npm run test:role-tenant-certification` (root) | PASS — 11/11 |
| `npm run test:integration` (`apps/api/backend`) | PASS — 154/154 |
| `npm run test:core` (`apps/api/backend`) | PASS — 200/200 |
| `npm run test:database-safety` (root) | PASS — 8/8 |
| `npm run check:migration-prefixes` (root) | PASS — 45 migrations; existing allowlisted duplicate reported |
| `git diff --check` | PASS |
| Playwright role-routing certification | PASS — 3/3 |

## Remaining gaps

- The browser harness does not start the API or authenticate against PostgreSQL, so there is no browser-level persisted tenant matrix. This is intentionally not claimed by the routing smoke.
- The focused HTTP suite proves current route behavior in-process through Express and real middleware; it does not test an independently deployed API process or external reverse proxy.
- The existing documented duplicate migration prefix remains unchanged and allowlisted; no migration was modified or renamed.
