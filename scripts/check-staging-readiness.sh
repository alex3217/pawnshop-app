#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${STAGING_ENV_FILE:-$ROOT/apps/api/backend/.env.staging}"
MODE="${STAGING_VALIDATION_MODE:-deployed}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing staging env file: $ENV_FILE" >&2
  exit 1
fi

case "$MODE" in
  deployed|local) ;;
  *) echo "STAGING_VALIDATION_MODE must be deployed or local." >&2; exit 1 ;;
esac

# Node reads the file directly. The validator reports variable names only and
# must never print environment values.
env -i PATH="$PATH" HOME="${HOME:-}" \
  node --env-file="$ENV_FILE" "$ROOT/scripts/lib/validate-staging-env.mjs" "$MODE"
