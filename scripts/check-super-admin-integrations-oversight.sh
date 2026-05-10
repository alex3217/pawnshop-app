#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:6002/api}"
WEB_BASE="${WEB_BASE:-http://127.0.0.1:5176}"
SUPER_ADMIN_EMAIL="${SUPER_ADMIN_EMAIL:-superadmin@pawn.local}"
SUPER_ADMIN_PASSWORD="${SUPER_ADMIN_PASSWORD:-SuperAdmin123!}"

echo "===== SUPER ADMIN INTEGRATIONS OVERSIGHT CHECK ====="
echo "BASE_URL=$BASE_URL"
echo "WEB_BASE=$WEB_BASE"

echo ""
echo "1. Build"
npm run build:web >/tmp/super-admin-integrations-build.txt
echo "✅ build:web passed"

echo ""
echo "2. Dev-safe"
npm run check:dev-safe >/tmp/super-admin-integrations-dev-safe.txt
echo "✅ check:dev-safe passed"

echo ""
echo "3. Owner integration security/mapping baseline"
./scripts/check-owner-integrations-v5b-field-mapping-ui.sh >/tmp/super-admin-integrations-owner-baseline.txt
echo "✅ owner integration baseline passed"

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
echo "4. API oversight endpoint"
API_RESPONSE="$(
  curl -sS "$BASE_URL/super-admin/integrations?limit=100" \
    -H "Authorization: Bearer $SUPER_TOKEN"
)"

node -e '
const payload = JSON.parse(process.argv[1]);
const rows = payload.rows || payload.data?.rows || payload.integrations || [];
if (!Array.isArray(rows)) {
  console.error("❌ Integrations response rows not found");
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}
const raw = JSON.stringify(payload).toLowerCase();
const forbidden = ["credentialciphertext", "encryptedcredential", "secret", "apikey", "password"];
for (const key of forbidden) {
  if (raw.includes(key)) {
    console.error(`❌ Response appears to expose sensitive key: ${key}`);
    process.exit(1);
  }
}
console.log(`✅ Super Admin integrations endpoint reachable. Rows: ${rows.length}`);
' "$API_RESPONSE"

echo ""
echo "5. Frontend route"
STATUS="$(
  curl -sS -o /tmp/super-admin-integrations.html -w "%{http_code}" \
    "$WEB_BASE/super-admin/integrations"
)"

if [ "$STATUS" != "200" ]; then
  echo "❌ /super-admin/integrations failed: $STATUS"
  exit 1
fi

echo "✅ /super-admin/integrations reachable"

echo ""
echo "6. Static wiring"
rg -n "SuperAdminIntegrationsPage|Integration Oversight|getSuperAdminIntegrationsPaged|archiveSuperAdminIntegration|/super-admin/integrations" \
  apps/web/src/App.tsx \
  apps/web/src/admin/pages/SuperAdminIntegrationsPage.tsx \
  apps/web/src/admin/services/adminApi.ts \
  apps/web/src/admin/config/routes.ts \
  apps/api/backend/src/controllers/superAdmin.controller.js \
  apps/api/backend/src/routes/superAdmin.routes.js

echo ""
echo "✅ SUPER ADMIN INTEGRATIONS OVERSIGHT CHECK PASSED"
