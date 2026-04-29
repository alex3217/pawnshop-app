#!/usr/bin/env bash
set -euo pipefail

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

printf '\nChecking tracked real env files...\n'
TRACKED_ENV="$(
  git ls-files | grep -E '(^|/)\.env($|\.development|\.production|\.staging|\.backup|\.bak)' || true
)"
fail_if_output "No real env files are tracked" "$TRACKED_ENV"

printf '\nChecking backend .env.example completeness...\n'
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

printf '\nChecking web .env.example completeness...\n'
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

printf '\nChecking destructive DB command guard...\n'
DESTRUCTIVE_DB="$(
  git grep -n -E 'force: true|sync\(|deleteMany|drop table|truncate table|DELETE FROM|delete from' -- \
    apps/api/backend/src \
    apps/api/backend/prisma \
    scripts \
    ':(exclude)scripts/check-prod-readiness.sh' \
    ':(exclude)scripts/check-static-safety.sh' \
    ':(exclude)**/node_modules/**' || true
)"
fail_if_output "No destructive DB commands found in source/scripts" "$DESTRUCTIVE_DB"

printf '\nChecking secret logging guard...\n'
SECRET_LOGGING="$(
  git grep -n -E 'console\.log\(process\.env|console\.error\(process\.env|console\.warn\(process\.env' -- \
    apps/api/backend/src apps/web/src scripts || true
)"
fail_if_output "No process.env secret logging found" "$SECRET_LOGGING"

printf '\nChecking frontend page/admin raw fetch guard...\n'
RAW_FETCH="$(
  grep -R "fetch(" -n apps/web/src/pages apps/web/src/admin/pages \
    --include="*.tsx" \
    --include="*.ts" || true
)"
fail_if_output "No raw fetch in frontend page/admin-page layer" "$RAW_FETCH"

printf '\n✅ Static safety guard passed.\n'
