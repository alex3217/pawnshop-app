#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:6002/api}"
WEB_BASE="${WEB_BASE:-http://127.0.0.1:5176}"
SUPER_ADMIN_EMAIL="${SUPER_ADMIN_EMAIL:-superadmin@pawn.local}"
SUPER_ADMIN_PASSWORD="${SUPER_ADMIN_PASSWORD:-SuperAdmin123!}"

echo "===== SUPER ADMIN SYSTEM HEALTH CHECK ====="
echo "BASE_URL=$BASE_URL"
echo "WEB_BASE=$WEB_BASE"

SUPER_TOKEN="$(
  curl -sS -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$SUPER_ADMIN_EMAIL\",\"password\":\"$SUPER_ADMIN_PASSWORD\"}" \
    | node -e '
      let s="";
      process.stdin.on("data", d => s += d);
      process.stdin.on("end", () => {
        const j = JSON.parse(s);
        process.stdout.write(j.token || j.accessToken || j.data?.token || j.data?.accessToken || "");
      });
    '
)"

if [ -z "$SUPER_TOKEN" ]; then
  echo "❌ Super Admin login failed"
  exit 1
fi

echo "✅ Super Admin login"

echo ""
echo "1. API endpoint"
API_RESPONSE="$(
  curl -sS "$BASE_URL/super-admin/system" \
    -H "Authorization: Bearer $SUPER_TOKEN"
)"

node -e '
const payload = JSON.parse(process.argv[1]);
if (!payload || payload.success !== true) {
  console.error("❌ System health response missing success=true");
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}
if (!payload.checks?.database) {
  console.error("❌ System health response missing database check");
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}
if (!payload.env?.runtime) {
  console.error("❌ System health response missing runtime info");
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}
if (JSON.stringify(payload).includes("sk_") || JSON.stringify(payload).includes("sk-")) {
  console.error("❌ System health response appears to expose a secret key");
  process.exit(1);
}
console.log("✅ /super-admin/system API health payload valid");
' "$API_RESPONSE"

echo ""
echo "2. Frontend route"
STATUS="$(
  curl -sS -o /tmp/super-admin-system-health.html -w "%{http_code}" \
    "$WEB_BASE/super-admin/system"
)"

if [ "$STATUS" != "200" ]; then
  echo "❌ /super-admin/system failed: $STATUS"
  exit 1
fi

echo "✅ /super-admin/system reachable"

echo ""
echo "3. Static wiring"
rg -n "SuperAdminSystemHealthPage|System Health|getSuperAdminSystemHealth|/super-admin/system" \
  apps/web/src/App.tsx \
  apps/web/src/admin/pages/SuperAdminSystemHealthPage.tsx \
  apps/web/src/admin/services/adminApi.ts \
  apps/web/src/admin/config/routes.ts \
  apps/api/backend/src/controllers/superAdmin.controller.js \
  apps/api/backend/src/routes/superAdmin.routes.js

echo ""
echo "✅ SUPER ADMIN SYSTEM HEALTH CHECK PASSED"
