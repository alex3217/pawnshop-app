#!/usr/bin/env bash
set -euo pipefail

log() {
  printf '\n%s\n' "$1"
}

fail_if_output() {
  local label="$1"
  local output="$2"

  if [ -n "$output" ]; then
    printf '\n❌ %s\n' "$label" >&2
    printf '%s\n' "$output" >&2
    exit 1
  fi

  printf '✅ %s\n' "$label"
}

log "Checking tracked real env files..."
TRACKED_ENV="$(
  git ls-files | grep -E '(^|/)\.env($|\.development|\.production|\.staging|\.backup|\.bak)' || true
)"
fail_if_output "No real env files are tracked" "$TRACKED_ENV"

log "Checking backend .env.example completeness..."
BACKEND_MISSING="$(
  comm -23 \
    <(git grep -h -o -E 'process\.env\.[A-Z0-9_]+' -- apps/api/backend/src \
      | sed 's/process\.env\.//' \
      | sort -u) \
    <(grep -E '^[A-Z0-9_]+=' apps/api/backend/.env.example \
      | cut -d= -f1 \
      | sort -u) || true
)"
fail_if_output "Backend .env.example documents all consumed env vars" "$BACKEND_MISSING"

log "Checking web .env.example completeness..."
WEB_MISSING="$(
  comm -23 \
    <(git grep -h -o -E 'import\.meta\.env\.[A-Z0-9_]+' -- apps/web/src \
      | sed 's/import\.meta\.env\.//' \
      | grep -v '^DEV$' \
      | sort -u) \
    <(grep -E '^[A-Z0-9_]+=' apps/web/.env.example \
      | cut -d= -f1 \
      | sort -u) || true
)"
fail_if_output "Web .env.example documents all consumed env vars" "$WEB_MISSING"

log "Checking destructive DB command guard..."
DESTRUCTIVE_DB="$(
  git grep -n -E 'force: true|sync\(|deleteMany|drop table|truncate table|DELETE FROM|delete from' -- \
    apps/api/backend/src \
    apps/api/backend/prisma \
    scripts \
    ':(exclude)scripts/check-prod-readiness.sh' \
    ':(exclude)**/node_modules/**' || true
)"
fail_if_output "No destructive DB commands found in source/scripts" "$DESTRUCTIVE_DB"

log "Checking secret logging guard..."
SECRET_LOGGING="$(
  git grep -n -E 'console\.log\(process\.env|console\.error\(process\.env|console\.warn\(process\.env' -- \
    apps/api/backend/src apps/web/src scripts || true
)"
fail_if_output "No process.env secret logging found" "$SECRET_LOGGING"

log "Checking frontend page/admin raw fetch guard..."
RAW_FETCH="$(
  grep -R "fetch(" -n apps/web/src/pages apps/web/src/admin/pages \
    --include="*.tsx" \
    --include="*.ts" || true
)"
fail_if_output "No raw fetch in frontend page/admin-page layer" "$RAW_FETCH"

log "Running build and flow verification..."
npm run build:web
npm run check:dev-safe
npm run check:app-flow
npm run check:app-flow-full
npm run check:payment-webhook

log "Production readiness guard passed."
