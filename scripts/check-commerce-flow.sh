#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export SUPER_ADMIN_EMAIL="${SUPER_ADMIN_EMAIL:-superadmin1@example.com}"
export SUPER_ADMIN_PASSWORD="${SUPER_ADMIN_PASSWORD:-SuperAdmin123!}"

echo "===== COMMERCE FLOW CHECK ====="
echo "Repo: $ROOT"
echo ""

echo "0. Cleanup old E2E test listings"
OWNER_EMAIL="${OWNER_EMAIL:-owner1@pawn.local}" DRY_RUN=false ./scripts/cleanup-e2e-test-listings.sh || true


echo "1. Web build"
npm run build:web

echo ""
echo "2. Dev-safe wiring"
npm run check:dev-safe

echo ""
echo "3. Role-route smoke"
npm run check:role-routes

echo ""
echo "4. Auction bid E2E"
./scripts/check-auction-bid-e2e.sh

echo ""
echo "5. Settlement/payment audit"
./scripts/check-settlement-payment-audit.sh

echo ""
echo "6. Signed Stripe webhook settlement charge audit"
./scripts/check-payment-webhook.sh

echo ""
echo "✅ COMMERCE FLOW CHECK PASSED"
