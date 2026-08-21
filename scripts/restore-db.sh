#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_ENV=""; ENV_FILE=""; APPROVED_HOST=""; DATABASE_NAME=""; DUMP_FILE=""; MANIFEST_FILE=""; MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-36}"
unset DATABASE_URL PGDATABASE PGHOST PGPASSWORD PGPORT PGSERVICE PGSERVICEFILE PGSSLMODE PGUSER
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
SOURCE_ENV="$(printf '%s' "$MANIFEST_TARGET" | env -i PATH="$PATH" node -e 'const fs=require("fs");process.stdout.write(JSON.parse(fs.readFileSync(0,"utf8")).environment)')"
SOURCE_SCHEMA="$(printf '%s' "$MANIFEST_TARGET" | env -i PATH="$PATH" node -e 'const fs=require("fs");process.stdout.write(JSON.parse(fs.readFileSync(0,"utf8")).sourceSchema)')"
node "$ROOT/scripts/lib/database-recovery-safety.mjs" compatibility --source "$SOURCE_ENV" --destination "$DEST_ENV"
TARGET="$({ printf '%s\0' restore "$DEST_ENV" "$APPROVED_HOST" "$DATABASE_NAME" true; env -i PATH="$PATH" node "$ROOT/scripts/lib/database-recovery-safety.mjs" database-url --env-file "$ENV_FILE"; } | env -i PATH="$PATH" node "$ROOT/scripts/lib/database-recovery-safety.mjs" target-stdin)"
PG_SCHEMA="$(printf '%s' "$TARGET" | env -i PATH="$PATH" node -e 'const fs=require("fs");process.stdout.write(JSON.parse(fs.readFileSync(0,"utf8")).schema)')"
node "$ROOT/scripts/lib/database-recovery-safety.mjs" schema-compatibility --source "$SOURCE_SCHEMA" --destination "$PG_SCHEMA"
EXPECTED_CONFIRMATION="RESTORE $DEST_ENV $DATABASE_NAME"
if [ "${CONFIRM_RESTORE:-}" != "$EXPECTED_CONFIRMATION" ]; then echo "Restore blocked: set CONFIRM_RESTORE to the exact documented confirmation phrase." >&2; exit 1; fi
if [ "$DEST_ENV" = "production" ] && [ "${CONFIRM_PRODUCTION_RESTORE:-}" != "RESTORE PRODUCTION" ]; then echo "Production restore blocked: separate production approval confirmation is required." >&2; exit 1; fi

pg_restore --list "$DUMP_FILE" >/dev/null || { echo "Backup is not a valid PostgreSQL archive." >&2; exit 1; }
SERVICE_FILE=""; CLIENT_DIAGNOSTIC=""; PSQL_DIAGNOSTIC=""
cleanup_client_files() { if [ -n "$SERVICE_FILE" ]; then rm -f -- "$SERVICE_FILE"; SERVICE_FILE=""; fi; if [ -n "$CLIENT_DIAGNOSTIC" ]; then rm -f -- "$CLIENT_DIAGNOSTIC"; CLIENT_DIAGNOSTIC=""; fi; if [ -n "$PSQL_DIAGNOSTIC" ]; then rm -f -- "$PSQL_DIAGNOSTIC"; PSQL_DIAGNOSTIC=""; fi; }
trap cleanup_client_files EXIT INT TERM
SERVICE_FILE="$(env -i PATH="$PATH" node "$ROOT/scripts/lib/backup-process-safety.mjs" service "$ENV_FILE" "$(dirname "$ENV_FILE")")"
CLIENT_DIAGNOSTIC="$(mktemp "$(dirname "$ENV_FILE")/.pg_restore.stderr.XXXXXX")"; chmod 600 "$CLIENT_DIAGNOSTIC"
PSQL_DIAGNOSTIC="$(mktemp "$(dirname "$ENV_FILE")/.psql.stderr.XXXXXX")"; chmod 600 "$PSQL_DIAGNOSTIC"
PG_RESTORE_ARGS=(--clean --if-exists --no-owner --no-privileges --file=-)
if [ -n "$PG_SCHEMA" ]; then PG_RESTORE_ARGS+=(--schema="$PG_SCHEMA"); fi
PG_RESTORE_ARGS+=("$DUMP_FILE")
echo "Restoring verified $SOURCE_ENV backup into the explicitly approved $DEST_ENV target."
if ! PGSERVICEFILE="$SERVICE_FILE" PGSERVICE=pawnloop-backup env -u DATABASE_URL -u PGDATABASE -u PGHOST -u PGPASSWORD -u PGPORT -u PGSSLMODE -u PGUSER pg_restore "${PG_RESTORE_ARGS[@]}" 2>"$CLIENT_DIAGNOSTIC" | sed '/^SET transaction_timeout = 0;$/d' | PGSERVICEFILE="$SERVICE_FILE" PGSERVICE=pawnloop-backup env -u DATABASE_URL -u PGDATABASE -u PGHOST -u PGPASSWORD -u PGPORT -u PGSSLMODE -u PGUSER psql -v ON_ERROR_STOP=1 2>"$PSQL_DIAGNOSTIC"; then echo "Restore failed: database restore error." >&2; exit 1; fi
cleanup_client_files
echo "Restore completed. Run the post-restore validation checklist in docs/production-backup-recovery-runbook-v1.md."
