#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

API_BASE="${API_BASE:-http://127.0.0.1:6002/api}"
WEB_BASE="${WEB_BASE:-http://127.0.0.1:5176}"
OWNER_EMAIL="${OWNER_EMAIL:-owner1@pawn.local}"
OWNER_PASSWORD="${OWNER_PASSWORD:-Owner123!}"

OUT="reports/owner-integrations-v1-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"

echo "===== OWNER INTEGRATIONS V1 AUDIT ====="
echo "Repo: $ROOT"
echo "API_BASE: $API_BASE"
echo "WEB_BASE: $WEB_BASE"
echo "Report: $OUT"

echo ""
echo "1. Build"
npm run build:web | tee "$OUT/build-web.txt"
echo "✅ build:web passed"

echo ""
echo "2. Dev safe"
npm run check:dev-safe | tee "$OUT/dev-safe.txt"
echo "✅ check:dev-safe passed"

echo ""
echo "3. Owner login"
OWNER_TOKEN="$(
  curl -sS -X POST "$API_BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$OWNER_EMAIL\",\"password\":\"$OWNER_PASSWORD\"}" \
    | tee "$OUT/owner-login.json" \
    | node -e '
let s="";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  const j = JSON.parse(s || "{}");
  process.stdout.write(j.token || j.accessToken || j.data?.token || j.data?.accessToken || "");
});
'
)"

if [ -z "$OWNER_TOKEN" ]; then
  echo "❌ Owner login failed"
  exit 1
fi

echo "✅ Owner login OK"

echo ""
echo "4. Owner shop availability"
SHOP_STATUS="$(
  curl -sS -o "$OUT/shops-mine.json" -w "%{http_code}" \
    "$API_BASE/shops/mine" \
    -H "Authorization: Bearer $OWNER_TOKEN"
)"

if [ "$SHOP_STATUS" != "200" ]; then
  echo "❌ /shops/mine failed: $SHOP_STATUS"
  cat "$OUT/shops-mine.json"
  exit 1
fi

SHOP_COUNT="$(
  node - "$OUT/shops-mine.json" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const j = JSON.parse(fs.readFileSync(file, "utf8") || "[]");
const rows = Array.isArray(j) ? j : Array.isArray(j.data) ? j.data : [];
process.stdout.write(String(rows.length));
NODE
)"

echo "✅ Owner shops reachable: $SHOP_COUNT"

echo ""
echo "5. Frontend route reachability"
INTEGRATIONS_STATUS="$(
  curl -sS -o "$OUT/owner-integrations.html" -w "%{http_code}" \
    "$WEB_BASE/owner/integrations"
)"

if [ "$INTEGRATIONS_STATUS" != "200" ]; then
  echo "❌ /owner/integrations failed: $INTEGRATIONS_STATUS"
  exit 1
fi

echo "✅ Frontend /owner/integrations reachable"

echo ""
echo "6. Static route/nav checks"
rg -n "OwnerIntegrationsPage|/owner/integrations|Integrations" \
  apps/web/src/App.tsx \
  apps/web/src/components/SiteLayout.tsx \
  apps/web/src/pages/OwnerIntegrationsPage.tsx \
  apps/web/src/services/integrations.ts \
  | tee "$OUT/static-route-nav.txt"

echo ""
echo "7. Raw network guard"
if rg -n "fetch\\(|axios\\." apps/web/src/pages/OwnerIntegrationsPage.tsx apps/web/src/services/integrations.ts; then
  echo "❌ Raw network call found in integrations page/service"
  exit 1
fi

echo "✅ No raw network calls in owner integrations page/service"

echo ""
echo "✅ OWNER INTEGRATIONS V1 AUDIT PASSED"
echo "Report folder:"
echo "$OUT"
