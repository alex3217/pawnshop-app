#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENVIRONMENT=""; ENV_FILE=""; APPROVAL_FILE=""; APPROVED_HOST=""; DATABASE_NAME=""; OUTPUT_DIR="${BACKUP_DIR:-$ROOT/backups/db}"

usage() { echo "Usage: $0 --environment <production|staging|test|development> --env-file <file> [--approval-file <mode-600-file> | --approved-host <hostname> --database <name>] [--output-dir <directory>]" >&2; }
while [ "$#" -gt 0 ]; do
  case "$1" in
    --environment) ENVIRONMENT="${2:-}"; shift 2 ;;
    --env-file) ENV_FILE="${2:-}"; shift 2 ;;
    --approval-file) APPROVAL_FILE="${2:-}"; shift 2 ;;
    --approved-host) APPROVED_HOST="${2:-}"; shift 2 ;;
    --database) DATABASE_NAME="${2:-}"; shift 2 ;;
    --output-dir) OUTPUT_DIR="${2:-}"; shift 2 ;;
    *) usage; exit 1 ;;
  esac
done
if [ -z "$ENVIRONMENT" ] || [ -z "$ENV_FILE" ]; then usage; exit 1; fi
if [ ! -f "$ENV_FILE" ]; then echo "Environment file is missing." >&2; exit 1; fi

RUNTIME_DIR=""
cleanup_runtime() { if [ -n "$RUNTIME_DIR" ]; then rm -f "$RUNTIME_DIR/pg_service.conf" "$RUNTIME_DIR/validated-target.json" "$RUNTIME_DIR/pg_dump.stderr"; rmdir "$RUNTIME_DIR" 2>/dev/null || true; fi; }
trap cleanup_runtime EXIT
if [ "$ENVIRONMENT" = "production" ]; then
  if [ -n "$APPROVED_HOST" ] || [ -n "$DATABASE_NAME" ]; then echo "Production backup rejects raw target metadata arguments; use --approval-file." >&2; exit 1; fi
  if [ -z "$APPROVAL_FILE" ]; then echo "Production backup approval file is required." >&2; exit 1; fi
  RUNTIME_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pawnloop-production-backup.XXXXXX")"; chmod 700 "$RUNTIME_DIR"
  CONFIRM_PRODUCTION_BACKUP="${CONFIRM_PRODUCTION_BACKUP:-}" node "$ROOT/scripts/lib/database-recovery-safety.mjs" prepare-production-backup \
    --env-file "$ENV_FILE" --approval-file "$APPROVAL_FILE" --state-directory "$RUNTIME_DIR"
  TARGET_FILE="$RUNTIME_DIR/validated-target.json"
  PG_SCHEMA="$(TARGET_FILE="$TARGET_FILE" node -e 'const fs=require("fs");process.stdout.write(JSON.parse(fs.readFileSync(process.env.TARGET_FILE)).schema)')"
  PG_DUMP_CONNECTION="service=pawnloop-production-backup"
else
  if [ -n "$APPROVAL_FILE" ] || [ -z "$APPROVED_HOST" ] || [ -z "$DATABASE_NAME" ]; then usage; exit 1; fi
  DATABASE_URL="$(node --env-file="$ENV_FILE" -e 'process.stdout.write(process.env.DATABASE_URL || "")')"
  TARGET="$(env -i PATH="$PATH" DATABASE_URL="$DATABASE_URL" node "$ROOT/scripts/lib/database-recovery-safety.mjs" target --operation backup --environment "$ENVIRONMENT" --approved-host "$APPROVED_HOST" --database "$DATABASE_NAME" --destination false)"
  PG_DUMP_CONNECTION="$(DATABASE_URL="$DATABASE_URL" node -e 'const u=new URL(process.env.DATABASE_URL); u.searchParams.delete("schema"); process.stdout.write(u.toString())')"
  PG_SCHEMA="$(TARGET="$TARGET" node -e 'process.stdout.write(JSON.parse(process.env.TARGET).schema)')"
  unset DATABASE_URL
fi
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$OUTPUT_DIR"; chmod 700 "$OUTPUT_DIR"
OUT_FILE="$OUTPUT_DIR/pawnloop-${ENVIRONMENT}-${STAMP}.dump"
MANIFEST_FILE="$OUT_FILE.manifest.json"
cleanup() { rm -f "$OUT_FILE" "$MANIFEST_FILE"; }
trap cleanup ERR INT TERM
if [ -e "$OUT_FILE" ] || [ -e "$MANIFEST_FILE" ]; then echo "Backup output already exists; refusing to overwrite it." >&2; exit 1; fi

PG_DUMP_ARGS=("$PG_DUMP_CONNECTION" --format=custom --no-owner --no-privileges --file="$OUT_FILE")
if [ -n "$PG_SCHEMA" ]; then PG_DUMP_ARGS+=(--schema="$PG_SCHEMA"); fi
echo "Creating $ENVIRONMENT database backup for the explicitly approved target."
if [ "$ENVIRONMENT" = "production" ]; then
  if ! PGSERVICEFILE="$RUNTIME_DIR/pg_service.conf" pg_dump "${PG_DUMP_ARGS[@]}" 2>"$RUNTIME_DIR/pg_dump.stderr"; then
    echo "Production database backup failed; protected client diagnostics were not emitted." >&2
    exit 1
  fi
  rm -f "$RUNTIME_DIR/pg_dump.stderr"
else
  pg_dump "${PG_DUMP_ARGS[@]}"
fi
chmod 600 "$OUT_FILE"
if [ ! -s "$OUT_FILE" ]; then cleanup; echo "Backup is empty." >&2; exit 1; fi
pg_restore --list "$OUT_FILE" >/dev/null
TOOL_VERSION="$(pg_dump --version 2>/dev/null || echo unknown)"
REVISION="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo unknown)"
if [ "$ENVIRONMENT" = "production" ]; then
  node "$ROOT/scripts/lib/database-recovery-safety.mjs" manifest --backup "$OUT_FILE" --environment "$ENVIRONMENT" --target-file "$TARGET_FILE" --source-schema "$PG_SCHEMA" --revision "$REVISION" --tool-version "$TOOL_VERSION" --archive-metadata "pg_restore list inspection passed" >"$MANIFEST_FILE"
else
  node "$ROOT/scripts/lib/database-recovery-safety.mjs" manifest --backup "$OUT_FILE" --environment "$ENVIRONMENT" --host "$APPROVED_HOST" --database "$DATABASE_NAME" --source-schema "$PG_SCHEMA" --revision "$REVISION" --tool-version "$TOOL_VERSION" --archive-metadata "pg_restore list inspection passed" >"$MANIFEST_FILE"
fi
chmod 600 "$MANIFEST_FILE"
trap - ERR INT TERM
echo "Backup and non-secret manifest created."
