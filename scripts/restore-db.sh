#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-}"
DUMP_FILE="${2:-}"

if [ -z "$ENV_FILE" ]; then
  echo "Usage: CONFIRM_RESTORE=yes bash scripts/restore-db.sh <env-file> <dump-file>" >&2
  exit 1
fi

if [ -z "$DUMP_FILE" ]; then
  echo "Missing dump file." >&2
  echo "Usage: CONFIRM_RESTORE=yes bash scripts/restore-db.sh <env-file> <dump-file>" >&2
  exit 1
fi

if [ "$CONFIRM_RESTORE" != "yes" ]; then
  echo "Restore blocked." >&2
  echo "Set CONFIRM_RESTORE=yes to confirm you intentionally want to restore this database." >&2
  exit 1
fi

if [[ "$ENV_FILE" == *".env.production"* && "${CONFIRM_PRODUCTION_RESTORE:-}" != "yes" ]]; then
  echo "Production restore blocked." >&2
  echo "Set BOTH CONFIRM_RESTORE=yes and CONFIRM_PRODUCTION_RESTORE=yes to restore production." >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

if [ ! -f "$DUMP_FILE" ]; then
  echo "Missing dump file: $DUMP_FILE" >&2
  exit 1
fi

DATABASE_URL="$(
  node --env-file="$ENV_FILE" -e 'process.stdout.write(process.env.DATABASE_URL || "")'
)"

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is missing in $ENV_FILE" >&2
  exit 1
fi

PG_RESTORE_URL="$(
  RAW_DATABASE_URL="$DATABASE_URL" node - <<'NODE'
const raw = process.env.RAW_DATABASE_URL || "";
const url = new URL(raw);
url.searchParams.delete("schema");
process.stdout.write(url.toString());
NODE
)"

PG_SCHEMA="$(
  RAW_DATABASE_URL="$DATABASE_URL" node - <<'NODE'
const raw = process.env.RAW_DATABASE_URL || "";
const url = new URL(raw);
process.stdout.write(url.searchParams.get("schema") || "");
NODE
)"

echo "About to restore database."
echo "Env file: $ENV_FILE"
echo "Dump file: $DUMP_FILE"

if [ -n "$PG_SCHEMA" ]; then
  echo "Schema: $PG_SCHEMA"
fi

PG_RESTORE_ARGS=(
  --clean
  --if-exists
  --no-owner
  --no-privileges
)

if [ -n "$PG_SCHEMA" ]; then
  PG_RESTORE_ARGS+=(--schema="$PG_SCHEMA")
fi

PG_RESTORE_ARGS+=("$DUMP_FILE")

# Stream restore SQL through psql so we can remove pg_dump settings that may
# not exist on older local PostgreSQL versions, such as transaction_timeout.
pg_restore "${PG_RESTORE_ARGS[@]}" \
  | sed '/^SET transaction_timeout = 0;$/d' \
  | psql "$PG_RESTORE_URL" -v ON_ERROR_STOP=1

echo "✅ Database restore completed from: $DUMP_FILE"
