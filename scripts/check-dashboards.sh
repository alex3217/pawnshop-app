#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

echo "===== FULL DASHBOARD AUDIT ====="

echo ""
echo "===== CLEAN LEGACY 5002 IF PRESENT ====="
PID="$(/usr/sbin/lsof -tiTCP:5002 -sTCP:LISTEN -n -P | head -1 || true)"

if [ -n "$PID" ]; then
  echo "Found legacy process on 5002: $PID"
  /usr/sbin/lsof -iTCP:5002 -sTCP:LISTEN -n -P || true
  echo "Killing legacy process on 5002..."
  kill "$PID" || true
  sleep 2
else
  echo "✅ No legacy process listening on 5002"
fi

echo ""
echo "===== VERIFY 5002 IS CLEAN ====="
if /usr/sbin/lsof -iTCP:5002 -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  echo "❌ 5002 is still listening after cleanup:"
  /usr/sbin/lsof -iTCP:5002 -sTCP:LISTEN -n -P || true
  exit 1
else
  echo "✅ 5002 is clean"
fi

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
