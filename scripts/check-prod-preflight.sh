#!/usr/bin/env bash
set -euo pipefail

PROD_ENV="${PROD_ENV_FILE:-apps/api/backend/.env.production}"
DEV_ENV="apps/api/backend/.env.development"
STAGING_ENV="apps/api/backend/.env.staging"

if [ ! -f "$PROD_ENV" ]; then
  echo "Missing production env file: $PROD_ENV" >&2
  exit 1
fi

node --env-file="$PROD_ENV" scripts/validate-backend-environment.mjs production

if [ "${PRODUCTION_PREFLIGHT_VALIDATE_ONLY:-0}" = "1" ]; then
  echo "✅ Synthetic production contract validation passed; network, database, backup, and build checks were skipped."
  exit 0
fi

normalize_db() {
  local env_file="$1"
  node --env-file="$env_file" -e '
    const raw = process.env.DATABASE_URL || "";
    if (!raw) process.exit(2);
    const u = new URL(raw);
    u.password = "****";
    u.searchParams.delete("schema");
    process.stdout.write(u.toString());
  '
}

DEV_DB="$(normalize_db "$DEV_ENV" 2>/dev/null || true)"
STAGING_DB="$(normalize_db "$STAGING_ENV" 2>/dev/null || true)"
PROD_DB="$(normalize_db "$PROD_ENV")"

if [ -n "$DEV_DB" ] && [ "$PROD_DB" = "$DEV_DB" ]; then
  echo "Production DATABASE_URL matches development DATABASE_URL. Refusing production preflight." >&2
  exit 1
fi

if [ -n "$STAGING_DB" ] && [ "$PROD_DB" = "$STAGING_DB" ]; then
  echo "Production DATABASE_URL matches staging DATABASE_URL. Refusing production preflight." >&2
  exit 1
fi

echo "✅ Production DB is separate from dev/staging."

LATEST_PROD_BACKUP="$(
  find backups/db -type f -name "pawnloop-production-*.dump" -size +0c -print 2>/dev/null | sort | tail -1
)"

if [ -z "$LATEST_PROD_BACKUP" ]; then
  echo "No non-empty production DB backup found. Run the explicit npm run db:backup command documented in the recovery runbook." >&2
  exit 1
fi

LATEST_PROD_MANIFEST="$LATEST_PROD_BACKUP.manifest.json"
node scripts/lib/database-recovery-safety.mjs validate \
  --backup "$LATEST_PROD_BACKUP" \
  --manifest "$LATEST_PROD_MANIFEST" \
  --environment production \
  --max-age-hours "${BACKUP_MAX_AGE_HOURS:-36}" >/dev/null
pg_restore --list "$LATEST_PROD_BACKUP" >/dev/null

echo "✅ Latest production backup manifest, freshness, checksum, and archive validated: $LATEST_PROD_BACKUP"

npm run check:static-safety
npm run build:web

echo "✅ Production preflight passed."
