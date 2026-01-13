#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Only flag likely "port usage" patterns (not random numbers in docs/data)
PATTERN='(:500[1-3]\b|localhost:500[1-3]\b|PORT[[:space:]]*=[[:space:]]*500[1-3]\b|PORT:[[:space:]]*500[1-3]\b)'

echo "Checking PawnShop for forbidden Tire Marketplace port usage (5001/5002/5003)..."

# IMPORTANT: exclude this script so it doesn't match itself
if rg -n --hidden \
  --glob '!**/node_modules/**' \
  --glob '!.git/**' \
  --glob '!scripts/guard-ports.sh' \
  "$PATTERN" . ; then
  echo "❌ Found forbidden Tire Marketplace port usage in PawnShop repo"
  exit 1
fi

echo "✅ No forbidden Tire Marketplace port usage found"
