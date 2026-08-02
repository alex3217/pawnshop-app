# Database Certification Results

Certification date: 2026-08-01 (America/Chicago)  
Branch: `certify/staging-public-beta-v1`  
Overall result: **BLOCKED**

## Safety decision

The repository safety assertion was run with `NODE_ENV=test`, `APP_ENV=test`, and the required disposable-data confirmation. It rejected the configured `.env.test` target because the redacted host classification is not an approved disposable host. No connection string or credential was retained.

After rejection, no migration status/deploy, seed, schema comparison, integration test, backup, restore, or destructive database command was run. A preliminary availability probe was mistakenly issued before the assertion; it received no response and established no database connection. It is rejected as certification evidence.

## Evidence

| Check | Result | Retained evidence |
|---|---|---|
| Database safety guard tests | PASS | `npm run test:database-safety`: 8/8 pass, including rejection of production, staging, remote, non-test, and unconfirmed targets |
| Target safety assertion | BLOCKED | Classification `REJECTED`; configured host not on disposable allowlist |
| Prisma schema validation | PASS | `npx prisma validate --schema apps/api/backend/prisma/schema.prisma` |
| Migration prefix audit | PARTIAL | 45 migrations; known duplicate prefix `20260722000000` remains documented and unresolved |
| Applied-history/checksum reconciliation | BLOCKED | No accepted database target; applied staging/production history was not queried |
| Migration status and clean replay | BLOCKED | Safety guard rejected target |
| Seed | BLOCKED | Safety guard rejected target |
| Schema/constraint/index comparison | BLOCKED | Safety guard rejected target |
| Backup and checksum | BLOCKED | Safety guard rejected target |
| Timed restore to second disposable target | BLOCKED | No two accepted disposable targets |
| Post-restore readiness and teardown | BLOCKED | Restore was not run |

The duplicate migration directories were not renamed. Database certification requires an explicitly owned target accepted by the guard, plus a second accepted restore target.

## Disposable local execution evidence

Execution date: 2026-08-01

Overall local database execution result: **PASS**

### Safety and migration replay

- The primary loopback PostgreSQL 16 target was accepted as `DISPOSABLE_TEST`.
- Database safety tests passed 8/8.
- Prisma schema validation passed.
- All 45 migrations replayed successfully from a clean database.
- `prisma migrate status` reported the primary schema was up to date.
- `PawnShop.slug` existed after replay.
- The primary migration ledger contained 45 completed and zero failed or rolled-back migrations.
- The duplicate timestamp prefix did not prevent deterministic fresh replay.
- Neither duplicate migration directory was renamed.
- No staging or production database was contacted.

### Database-backed automated tests

- The complete integration suite passed 154/154.
- The backend core suite passed 200/200.
- Community Marketplace remained disabled and its explicit reservation rejection test passed.
- `SHOP_TO_CUSTOMER` retail, `SHOP_TO_SHOP` dealer, and `CUSTOMER_TO_SHOP` intake boundaries were retained.

### Seed status

- No Prisma seed command is configured.
- `npx prisma db seed` did not execute a project seed.
- Available manual scripts were not treated as certification seeds without a reviewed, deterministic actor-and-tenant contract.
- Seeded role and tenant certification remains a separate open gate.

### Backup and restore

- PostgreSQL 16 container tools created a non-empty custom-format backup.
- Backup artifact size: 296259 bytes.
- SHA-256 checksum verification passed.
- The backup catalog was readable by PostgreSQL 16 `pg_restore`.
- Restore completed successfully in 0 seconds on the second accepted disposable database.
- The restored database passed the disposable safety guard.
- The restored Prisma migration status was up to date.
- Exact completed migration ledgers matched at 45/45.
- Both databases contained zero failed or rolled-back migration records.
- Every public table row count matched.
- Exact normalized schema dumps matched.

### Remaining staging certification requirements

- Review staging and production `_prisma_migrations` histories before changing either duplicate migration directory.
- Build and execute the retained Buyer A/B, Owner A/B, Staff A/B, Admin, and Super Admin seeded role-and-tenant matrix.
- Complete provider-backed Stripe test-mode certification.
- Complete manual accessibility and operational rehearsal gates.
