# Backend launch security audit — 2026-08-19

Base: `3d526de2ac5d877607bc20ecfbf957b3236d0792`

Scope was limited to backend source and tests. `apps/web/**`, workflows, migrations, and Prisma schema were excluded.

## Audit matrix

| Area | Result | Evidence |
| --- | --- | --- |
| Authorization and ownership | Pass with one test-maintenance correction | Route middleware and ownership/service checks reviewed for listings, uploads, offers, auctions, messaging, transactions, shops, staff, owner applications, admin, and super-admin. Buyer, auction-staff, location, messaging, upload-asset, and shop-access contract tests exercised. Location contract regexes were updated to recognize the stronger role and MFA chain already present. |
| Transaction integrity | Pass for non-database coverage; database suite blocked | Reservation decrement uses conditional quantity updates; payment creation uses stored transaction amount/currency and provider idempotency; webhook, reservation release/scheduler, settlement transition, payout, and buyer entitlement concurrency tests passed. Integration/concurrency tests requiring PostgreSQL were not run because the database safety guard rejected the unset test environment. |
| Payment safety | Pass for mocked coverage | Stripe signature mounts precede JSON parsing; missing signatures fail; transaction/refund/subscription webhook replay and ordering tests passed; PaymentIntent amount/currency/ownership tests and payout authorization/idempotency tests passed. No live Stripe calls were made. |
| Input and upload safety | Remediated one Medium finding | Validation, pagination caps, managed-asset ownership, durable attachment, file MIME/signature/size/count, CSV bounds, and public selects reviewed. Upload and CSV tests passed. Shared controller error responses now suppress unexpected internal exception messages. |
| Abuse controls | Pass for covered controls | Authentication/MFA, messaging, upload, destination-search, and bid/listing policy wiring reviewed. Rate-limit tests passed in the standard suite. |
| Production containment | Pass | Write gate is mounted before body parsing for both `/api` and non-`/api` routes; exact auth exceptions and raw signed webhook mounts are covered; missing/false configuration fails closed. Production write-gate tests passed. |

## Confirmed finding

### Medium — internal exception messages exposed by launch-critical controllers

Several marketplace, offer, bid, settlement, and messaging controllers caught unexpected database/provider errors and returned `error.message` with HTTP 500. This bypassed the application-level production sanitizer and could disclose internal database, constraint, or provider detail.

Remediation adds one shared fail-closed controller responder. Explicit 4xx messages and stable public codes remain unchanged, while 5xx responses use the controller's existing generic fallback. Regression coverage verifies both behaviors and adoption by the affected controllers.

No Critical, High, or Low code vulnerabilities were confirmed in the audited scope.

## Remaining blockers and observations

- Database integration, transaction-concurrency, and database-backed ownership suites were not run: no explicitly safe loopback `pawnshop_test*` database was configured, and the repository guard correctly refused execution. The guard was not bypassed or weakened.
- `npm audit` reported three high-severity entries in the Prisma development-tooling chain (`prisma` -> `@prisma/config` -> `deepmerge-ts`, GHSA-ggr8-5vv4-36mx). The vulnerable merge behavior is not part of the runtime API dependency path. The offered remediation downgrades Prisma to 6.12.0, so compatibility should be evaluated separately rather than silently changing ORM tooling in this focused fix.
- Provider configuration, production data, remote databases, migrations, Stripe account settings, and business-policy changes were not accessed or modified.
