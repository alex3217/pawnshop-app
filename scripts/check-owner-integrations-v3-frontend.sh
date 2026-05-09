#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

API_BASE="${API_BASE:-http://127.0.0.1:6002/api}"
WEB_BASE="${WEB_BASE:-http://127.0.0.1:5176}"
OWNER_EMAIL="${OWNER_EMAIL:-owner1@pawn.local}"
OWNER_PASSWORD="${OWNER_PASSWORD:-Owner123!}"

OUT="reports/owner-integrations-v3-frontend-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"

echo "===== OWNER INTEGRATIONS V3 FRONTEND AUDIT ====="
echo "Repo: $ROOT"
echo "API_BASE: $API_BASE"
echo "WEB_BASE: $WEB_BASE"
echo "Report: $OUT"

echo ""
echo "1. Build"
npm run build:web | tee "$OUT/build-web.txt"
echo "✅ build:web passed"

echo ""
echo "2. Dev-safe"
npm run check:dev-safe | tee "$OUT/dev-safe.txt"
echo "✅ check:dev-safe passed"

echo ""
echo "3. Backend integration audit"
./scripts/check-owner-integrations-v2-backend.sh | tee "$OUT/backend-v2.txt"
echo "✅ backend integration audit passed"

echo ""
echo "4. Frontend route"
STATUS="$(
  curl -sS -o "$OUT/owner-integrations.html" -w "%{http_code}" \
    "$WEB_BASE/owner/integrations"
)"

if [ "$STATUS" != "200" ]; then
  echo "❌ /owner/integrations failed: $STATUS"
  exit 1
fi

echo "✅ /owner/integrations reachable"

echo ""
echo "5. Static frontend wiring"
rg -n "createInventoryIntegration|testInventoryIntegration|syncInventoryIntegration|getInventoryIntegrationJobs|archiveInventoryIntegration|Saved integrations|Create integration" \
  apps/web/src/pages/OwnerIntegrationsPage.tsx \
  apps/web/src/services/integrations.ts \
  | tee "$OUT/static-wiring.txt"

echo ""
echo "6. Raw network guard"
if rg -n "fetch\\(|axios\\." apps/web/src/pages/OwnerIntegrationsPage.tsx apps/web/src/services/integrations.ts; then
  echo "❌ Raw network call found in integrations frontend"
  exit 1
fi

echo "✅ No raw network calls in integrations frontend"

echo ""
echo "✅ OWNER INTEGRATIONS V3 FRONTEND AUDIT PASSED"
echo "Report folder:"
echo "$OUT"
