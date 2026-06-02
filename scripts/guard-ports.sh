#!/usr/bin/env bash
set -euo pipefail

echo "Checking PawnShop active app/config files for forbidden legacy/non-PawnShop port usage..."

# PawnShop allowed ports:
#   6001 = production
#   6002 = development
#   6003 = staging
#   5176 = frontend dev
#
# Forbidden here means Tire/Tireshop or stale frontend ports inside active PawnShop files.
FORBIDDEN_PORT_RE='(^|[^0-9])(5001|5002|5003|5173|5175)([^0-9]|$)'

TARGETS=(
  "package.json"
  "ecosystem.config.cjs"
  "apps/web/.env"
  "apps/web/.env.development"
  "apps/web/.env.production"
  "apps/web/vite.config.ts"
  "apps/api/backend/.env.example"
  "apps/api/backend/src"
  "apps/web/src"
)

FOUND=0

for target in "${TARGETS[@]}"; do
  [ -e "$target" ] || continue

  if grep -RInE "$FORBIDDEN_PORT_RE" "$target" \
    --exclude-dir=node_modules \
    --exclude-dir=dist \
    --exclude-dir=reports \
    --exclude='*.log' \
    2>/dev/null; then
    FOUND=1
  fi
done

if [ "$FOUND" -eq 1 ]; then
  echo "❌ Found forbidden legacy/non-PawnShop port usage in active PawnShop app/config files"
  exit 1
fi

echo "✅ No forbidden legacy/non-PawnShop port usage found in active PawnShop app/config files"
