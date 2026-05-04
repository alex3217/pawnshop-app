#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

echo "===== PAWNSHOP FULL E2E AUDIT ====="

echo ""
echo "===== 1. CLEAN OLD TEST LISTINGS IF NEEDED ====="
DRY_RUN=false LIMIT=25 ./scripts/cleanup-e2e-test-listings.sh

echo ""
echo "===== 2. DASHBOARDS / BUILD / ROLE ROUTES ====="
./scripts/check-dashboards.sh

echo ""
echo "===== 3. AUCTION BID E2E ====="
./scripts/check-auction-bid-e2e.sh

echo ""
echo "===== 4. SETTLEMENT / PAYMENT SURFACE AUDIT ====="
./scripts/check-settlement-payment-audit.sh

echo ""
echo "===== 5. STRIPE WEBHOOK PAYMENT E2E ====="
npm run check:payment-webhook

echo ""
echo "===== 6. FINAL GIT STATUS ====="
git status --short

echo ""
echo "✅ PAWNSHOP FULL E2E AUDIT PASSED"
