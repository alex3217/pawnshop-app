#!/usr/bin/env bash
set -euo pipefail

echo "Checking PawnShop active app/config files for forbidden legacy port usage..."

BAD_HITS="$(
  rg -n --hidden \
    --glob '!node_modules/**' \
    --glob '!.git/**' \
    --glob '!dist/**' \
    --glob '!build/**' \
    --glob '!coverage/**' \
    --glob '!reports/**' \
    --glob '!package-lock.json' \
    --glob '!scripts/**' \
    'dev-6002|prod-6001|staging-6003|pawn-dev-6002|pawn-prod-6001|pawn-staging-6003' \
    apps package.json pnpm-lock.yaml package-lock.json vite.config.* tsconfig*.json 2>/dev/null || true
)"

if [ -n "$BAD_HITS" ]; then
  echo "$BAD_HITS"
  echo "❌ Found forbidden legacy app port usage in active PawnShop app/config files"
  exit 1
fi

echo "✅ No forbidden legacy app port usage found in active PawnShop app/config files"
