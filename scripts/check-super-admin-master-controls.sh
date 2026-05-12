#!/usr/bin/env bash
set -euo pipefail

WEB_BASE="${WEB_BASE:-http://127.0.0.1:5176}"

echo "===== SUPER ADMIN MASTER CONTROLS CHECK ====="

for path in \
  /super-admin/shops \
  /super-admin/inventory \
  /super-admin/platform-settings
do
  STATUS="$(/usr/bin/curl -sS -o /tmp/super-admin-master-page.html -w "%{http_code}" "$WEB_BASE$path")"
  if [ "$STATUS" != "200" ]; then
    echo "❌ $path failed: $STATUS"
    exit 1
  fi
  echo "✅ $path reachable"
done

rg -n "Shop Master Controls|Inventory Master Controls|View|Inventory|Integrations|Settlements|Audit|Mark Sold|Add Item|Soft-Code Control Center|Feature Flags|Commission Rules|Listing Rules|Auction Rules" \
  apps/web/src/admin/pages/AdminShopsPage.tsx \
  apps/web/src/pages/AdminItemsPage.tsx \
  apps/web/src/admin/pages/SuperAdminPlatformSettingsPage.tsx

echo "✅ SUPER ADMIN MASTER CONTROLS CHECK PASSED"
