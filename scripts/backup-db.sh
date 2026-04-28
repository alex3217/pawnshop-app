#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-apps/api/backend/.env.development}"
BACKUP_DIR="${BACKUP_DIR:-backups/db}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

DATABASE_URL="$(
  node --env-file="$ENV_FILE" -e 'process.stdout.write(process.env.DATABASE_URL || "")'
)"

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is missing in $ENV_FILE" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
SAFE_ENV_NAME="$(basename "$ENV_FILE" | tr -cd '[:alnum:]_.-')"
OUT_FILE="$BACKUP_DIR/${SAFE_ENV_NAME}.${STAMP}.dump"

echo "Creating database backup from: $ENV_FILE"
echo "Output: $OUT_FILE"

pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$OUT_FILE"

echo "✅ Database backup created: $OUT_FILE"
