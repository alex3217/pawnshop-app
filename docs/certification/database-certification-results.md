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
