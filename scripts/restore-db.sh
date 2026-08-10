#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_ENV=""; ENV_FILE=""; APPROVED_HOST=""; DATABASE_NAME=""; DUMP_FILE=""; MANIFEST_FILE=""; MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-36}"
usage() { echo "Usage: $0 --destination-environment <production|staging|test|development|isolated> --env-file <file> --approved-host <hostname> --database <name> --backup <dump> --manifest <json> [--max-age-hours <hours>]" >&2; }
while [ "$#" -gt 0 ]; do
  case "$1" in
    --destination-environment) DEST_ENV="${2:-}"; shift 2 ;;
    --env-file) ENV_FILE="${2:-}"; shift 2 ;;
    --approved-host) APPROVED_HOST="${2:-}"; shift 2 ;;
    --database) DATABASE_NAME="${2:-}"; shift 2 ;;
    --backup) DUMP_FILE="${2:-}"; shift 2 ;;
    --manifest) MANIFEST_FILE="${2:-}"; shift 2 ;;
    --max-age-hours) MAX_AGE_HOURS="${2:-}"; shift 2 ;;
    *) usage; exit 1 ;;
  esac
done
if [ -z "$DEST_ENV" ] || [ -z "$ENV_FILE" ] || [ -z "$APPROVED_HOST" ] || [ -z "$DATABASE_NAME" ] || [ -z "$DUMP_FILE" ] || [ -z "$MANIFEST_FILE" ]; then usage; exit 1; fi
if [ ! -f "$ENV_FILE" ]; then echo "Environment file is missing." >&2; exit 1; fi

MANIFEST_TARGET="$(node "$ROOT/scripts/lib/database-recovery-safety.mjs" validate --backup "$DUMP_FILE" --manifest "$MANIFEST_FILE" --max-age-hours "$MAX_AGE_HOURS")"
SOURCE_ENV="$(TARGET="$MANIFEST_TARGET" node -e 'process.stdout.write(JSON.parse(process.env.TARGET).environment)')"
SOURCE_SCHEMA="$(TARGET="$MANIFEST_TARGET" node -e 'process.stdout.write(JSON.parse(process.env.TARGET).sourceSchema)')"
node "$ROOT/scripts/lib/database-recovery-safety.mjs" compatibility --source "$SOURCE_ENV" --destination "$DEST_ENV"
DATABASE_URL="$(node --env-file="$ENV_FILE" -e 'process.stdout.write(process.env.DATABASE_URL || "")')"
TARGET="$(env -i PATH="$PATH" DATABASE_URL="$DATABASE_URL" node "$ROOT/scripts/lib/database-recovery-safety.mjs" target --environment "$DEST_ENV" --approved-host "$APPROVED_HOST" --database "$DATABASE_NAME" --destination true)"
PG_SCHEMA="$(TARGET="$TARGET" node -e 'process.stdout.write(JSON.parse(process.env.TARGET).schema)')"
node "$ROOT/scripts/lib/database-recovery-safety.mjs" schema-compatibility --source "$SOURCE_SCHEMA" --destination "$PG_SCHEMA"
EXPECTED_CONFIRMATION="RESTORE $DEST_ENV $DATABASE_NAME"
if [ "${CONFIRM_RESTORE:-}" != "$EXPECTED_CONFIRMATION" ]; then echo "Restore blocked: set CONFIRM_RESTORE to the exact documented confirmation phrase." >&2; exit 1; fi
if [ "$DEST_ENV" = "production" ] && [ "${CONFIRM_PRODUCTION_RESTORE:-}" != "RESTORE PRODUCTION" ]; then echo "Production restore blocked: separate production approval confirmation is required." >&2; exit 1; fi

pg_restore --list "$DUMP_FILE" >/dev/null || { echo "Backup is not a valid PostgreSQL archive." >&2; exit 1; }
PG_RESTORE_URL="$(DATABASE_URL="$DATABASE_URL" node -e 'const u=new URL(process.env.DATABASE_URL); u.searchParams.delete("schema"); process.stdout.write(u.toString())')"
unset DATABASE_URL
PG_RESTORE_ARGS=(--clean --if-exists --no-owner --no-privileges --file=-)
if [ -n "$PG_SCHEMA" ]; then PG_RESTORE_ARGS+=(--schema="$PG_SCHEMA"); fi
PG_RESTORE_ARGS+=("$DUMP_FILE")
echo "Restoring verified $SOURCE_ENV backup into explicitly approved $DEST_ENV target $APPROVED_HOST/$DATABASE_NAME."
pg_restore "${PG_RESTORE_ARGS[@]}" | sed '/^SET transaction_timeout = 0;$/d' | psql "$PG_RESTORE_URL" -v ON_ERROR_STOP=1
echo "Restore completed. Run the post-restore validation checklist in docs/production-backup-recovery-runbook-v1.md."
