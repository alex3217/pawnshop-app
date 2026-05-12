#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:6002/api}"
WEB_BASE="${WEB_BASE:-http://127.0.0.1:5176}"
SUPER_ADMIN_EMAIL="${SUPER_ADMIN_EMAIL:-superadmin@pawn.local}"
SUPER_ADMIN_PASSWORD="${SUPER_ADMIN_PASSWORD:-SuperAdmin123!}"

echo "===== SUPER ADMIN INTEGRATIONS + SETTLEMENTS CONTROLS CHECK ====="
echo "BASE_URL=$BASE_URL"
echo "WEB_BASE=$WEB_BASE"

SUPER_TOKEN="$(
  /usr/bin/curl -sS -X POST "$BASE_URL/auth/login" \
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

for api_path in \
  /super-admin/integrations \
  /super-admin/settlements
do
  /usr/bin/curl -sS -f "$BASE_URL$api_path" \
    -H "Authorization: Bearer $SUPER_TOKEN" >/dev/null
  echo "✅ GET $api_path"
done

for page_path in \
  /super-admin/integrations \
  /super-admin/settlements
do
  STATUS="$(/usr/bin/curl -sS -o /tmp/super-admin-controls-page.html -w "%{http_code}" "$WEB_BASE$page_path")"

  if [ "$STATUS" != "200" ]; then
    echo "❌ $page_path failed: $STATUS"
    exit 1
  fi

  echo "✅ $page_path reachable"
done

echo "Checking static frontend controls..."

rg -n "Integration Control Center|View Details|Sync Jobs|Mappings|Archive|Restore|Export CSV|Shop Governance|System Health" \
  apps/web/src/admin/pages/SuperAdminIntegrationsPage.tsx

rg -n "Settlement Control Center|Review|Edit|Reconcile|Mark Pending|Export CSV|Revenue|Audit Logs|Save Settlement" \
  apps/web/src/admin/pages/SuperAdminSettlementsPage.tsx

echo "Checking API methods and backend routes..."

rg -n "getSuperAdminIntegrationsPaged|archiveSuperAdminIntegration|restoreSuperAdminIntegration|getSuperAdminSettlementsPaged|updateSuperAdminSettlement" \
  apps/web/src/admin/services/adminApi.ts

rg -n "archiveSuperAdminIntegration|restoreSuperAdminIntegration|listSuperAdminIntegrations|listSuperAdminSettlements|updateSuperAdminSettlement|/integrations/:id/archive|/integrations/:id/restore|/settlements/:id" \
  apps/api/backend/src/routes/superAdmin.routes.js \
  apps/api/backend/src/controllers/superAdmin.controller.js

echo "✅ SUPER ADMIN INTEGRATIONS + SETTLEMENTS CONTROLS CHECK PASSED"
