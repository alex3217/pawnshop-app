# Database and Migration Evidence

## Decision: FAIL

`prisma/schema.prisma` is syntactically valid and Prisma Client 6.19.3 generates. Static inventory found 45 migration directories, from `20251223004109_init` through `20260801160000_marketing_assets_customer_engagement_v1`.

Two directories share the same timestamp prefix:

- `20260722000000_auth_session_password_hardening_v1`
- `20260722000000_customer_sell_transaction_handoff_v1`

This violates the required unambiguous ordering gate. During an uncertified broad test run, database-backed cases also reported `PawnShop.slug` missing, proving at least one reachable database schema does not match the generated client. Other integration files reported `DATABASE_URL is required`.

| Required evidence | Status | Result |
|---|---|---|
| Schema validation | PASS | `npx prisma validate` exit 0 |
| Client generation | PASS | `npm run prisma:generate` exit 0 |
| Migration list/order | FAIL | 45 directories; duplicate timestamp prefix |
| `prisma migrate status` | BLOCKED | No explicitly isolated and certified target supplied |
| Clean-schema replay | BLOCKED | Not safe without a certified disposable target |
| Seed compatibility | BLOCKED | Not run |
| Backup/restore record | BLOCKED | Scripts and historical local dumps exist, but no safe restore drill, encryption/off-host retention, RPO/RTO, or current schedule evidence |
| Connection failure behavior | PASS (contract) | Core tests verify readiness returns 503 when DB is unavailable |
| No production writes | PARTIAL | No migration/reset/restore was run. An accidental broad test glob reached integration tests; possible fixture writes cannot be excluded, so those results are rejected. |

## Required remediation

1. Provision a disposable database whose name/host is accepted by `scripts/assert-test-database.mjs`.
2. Resolve duplicate migration ordering with a reviewed, deployment-compatible approach; do not rename an already-applied production migration without reconciling migration history.
3. Run status, clean deploy/replay, seed, integration suite, dump, and timed restore only on that disposable target.
4. Compare `_prisma_migrations`, schema, constraints, and indexes against the repository; resolve the missing `PawnShop.slug` drift.
5. Record target classification (not credentials), timestamps, operator, artifact checksum, RPO/RTO, and teardown evidence.

