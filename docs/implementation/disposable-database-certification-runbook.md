# Disposable Database Certification Runbook

Status: procedure only; not executed in this remediation.

1. Obtain written certification that the target is disposable and isolated. Never reuse production or staging.
2. Use PostgreSQL on loopback, `postgres`, `db`, or an explicitly test/CI-prefixed host; name the database with `_test` or `_ci` suffix.
3. Set `NODE_ENV=test`, `APP_ENV=test`, and `CONFIRM_DISPOSABLE_DATABASE=YES_DELETE_TEST_DATA` in the invoking shell. Do not edit environment files.
4. Run `node apps/api/backend/scripts/assert-test-database.mjs`. Retain only its credential-free classification.
5. Reconcile the two `20260722000000` entries against staging and production `_prisma_migrations` before renaming either directory. Record checksums and applied timestamps without credentials.
6. On the disposable target only: inspect status, deploy all migrations, verify `PawnShop.slug` from `20260801010000_growth_marketing_phase1_foundation`, seed, run integration tests, and compare constraints/indexes.
7. Create an encrypted test backup, restore to a second disposable target, time the restore, verify checksums and application readiness, then tear both targets down.

Stop immediately on a classification failure, drift, unexpected hostname, or any uncertainty about ownership. This document does not authorize migration or reset activity.
