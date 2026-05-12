#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:6002/api}"
WEB_BASE="${WEB_BASE:-http://127.0.0.1:5176}"
SUPER_ADMIN_EMAIL="${SUPER_ADMIN_EMAIL:-superadmin@pawn.local}"
SUPER_ADMIN_PASSWORD="${SUPER_ADMIN_PASSWORD:-SuperAdmin123!}"

echo "===== SUPER ADMIN CONTROL SURFACES CHECK ====="
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

for path in \
  /super-admin \
  /super-admin/users \
  /super-admin/shops \
  /super-admin/inventory
do
  STATUS="$(curl -sS -o /tmp/super-admin-control-page.html -w "%{http_code}" "$WEB_BASE$path")"

  if [ "$STATUS" != "200" ]; then
    echo "❌ $path failed: $STATUS"
    exit 1
  fi

  echo "✅ $path reachable"
done

rg -n "Platform Control Command Center|Primary Control Surfaces|Operations & Governance|Review-Only Surfaces|Search / Add / Edit Users|Search / Add / Edit Shops|Search / Edit / Moderate Inventory" \
  apps/web/src/admin/pages/SuperAdminOverviewPage.tsx

rg -n "User & Role Command Center|Shop Governance Command Center|Inventory Control Command Center|Super Admin Users & Roles|Super Admin Shop Management|Super Admin Inventory Control|Add User|Add Shop|Edit|Export CSV|Delete|Restore|Disable|Deactivate|Activate" \
  apps/web/src/pages/AdminUsersPage.tsx \
  apps/web/src/admin/pages/AdminShopsPage.tsx \
  apps/web/src/pages/AdminItemsPage.tsx

rg -n 'path: "users".*AdminUsersPage|path: "shops".*AdminShopsPage|path: "inventory".*AdminItemsPage' \
  apps/web/src/App.tsx

echo "✅ SUPER ADMIN CONTROL SURFACES CHECK PASSED"
