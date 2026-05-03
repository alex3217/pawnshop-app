#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

echo "===== FULL DASHBOARD AUDIT ====="

echo ""
echo "===== PROCESS / PORT SAFETY ====="
./scripts/check-process-boundaries.sh
./scripts/guard-ports.sh

echo ""
echo "===== BUILD / DEV SAFE / ROLE ROUTES ====="
npm run build:web
npm run check:dev-safe
SUPER_ADMIN_EMAIL='superadmin@pawn.local' \
SUPER_ADMIN_PASSWORD='SuperAdmin123!' \
npm run check:role-routes

echo ""
echo "===== REAL REMAINING WORK ====="
./scripts/check-pawnshop-real-remaining.sh

echo ""
echo "===== BUYER DASHBOARD ====="
./scripts/check-buyer-dashboard.sh

echo ""
echo "===== OWNER DASHBOARD ====="
./scripts/check-owner-dashboard.sh

echo ""
echo "===== FINAL GIT STATUS ====="
git status --short

echo ""
echo "✅ Full dashboard audit complete."
