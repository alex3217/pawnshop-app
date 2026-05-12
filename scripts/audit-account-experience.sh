#!/usr/bin/env bash
set -euo pipefail

REPORT_DIR="reports/account-experience"
STAMP="$(date +%Y%m%d-%H%M%S)"
REPORT="$REPORT_DIR/account-experience-audit-$STAMP.txt"

mkdir -p "$REPORT_DIR"

{
  echo "===== ACCOUNT EXPERIENCE AUDIT ====="
  echo "Generated: $(date)"
  echo "Repo: $(pwd)"
  echo

  echo "===== GIT STATE ====="
  /usr/bin/git branch --show-current
  /usr/bin/git status --short
  /usr/bin/git log --oneline -12
  echo

  echo "===== APP ROUTES ====="
  rg -n "path:|RouteConfig|adminRoutes|superAdminRoutes|owner|buyer|watchlist|saved-searches|settlements|integrations|inventory|auctions|offers|staff|locations|subscription|settings" \
    apps/web/src/App.tsx \
    apps/web/src/admin/config/routes.ts \
    apps/web/src/admin/config/sidebar.ts \
    -S || true
  echo

  echo "===== PAGE FILES ====="
  find apps/web/src -type f \( -name "*Page.tsx" -o -name "*Page.jsx" \) | sort
  echo

  echo "===== OWNER PAGE CONTROLS ====="
  rg -n "Search|Add|Create|Edit|Delete|Restore|Disable|Archive|Sync|Upload|Bulk|Export|Refresh|Filter|Sort|Cancel|Start|End|Accept|Reject|Counter|Staff|Location|Subscription|Settings|Inventory|Auction|Offer|Settlement|Integration" \
    apps/web/src/pages \
    apps/web/src/owner \
    apps/web/src/admin/pages \
    -S || true
  echo

  echo "===== BUYER PAGE CONTROLS ====="
  rg -n "Search|Filter|Save|Watch|Bid|Offer|Buy|Checkout|Cart|Settlement|Saved|Watchlist|Auction|Message|Share|Sort|Refresh|Details" \
    apps/web/src/pages \
    -S || true
  echo

  echo "===== ADMIN / SUPER ADMIN CONTROLS ====="
  rg -n "Command Center|Control Center|Search|Add|Create|Edit|Delete|Restore|Disable|Archive|Review|Reconcile|Escalate|Audit|Export|Refresh|Feature Flags|Commission|Listing Rules|Auction Rules|System Health" \
    apps/web/src/admin/pages \
    apps/web/src/pages/Admin*.tsx \
    -S || true
  echo

  echo "===== STUB / PLACEHOLDER / TODO CHECK ====="
  rg -n "stub|placeholder|TODO|FIXME|coming soon|not implemented|Replace with real UI|scaffold" \
    apps/web/src apps/api/backend/src scripts \
    -S || true
  echo

  echo "===== RAW FETCH CHECK ====="
  rg -n "fetch\\(" apps/web/src -S || true
  echo

  echo "===== SERVICES/API CLIENT CHECK ====="
  rg -n "apiClient|adminApi|owner|items|shops|offers|settlements|integrations|watchlist|savedSearches|staff|locations" \
    apps/web/src/services apps/web/src/admin/services \
    -S || true
  echo

  echo "===== BACKEND ROUTES BY DOMAIN ====="
  rg -n "router\\.(get|post|patch|put|delete)\\(" apps/api/backend/src/routes -S || true
  echo

  echo "===== DATABASE MODELS ====="
  rg -n "model User|model PawnShop|model Item|model Auction|model Offer|model Settlement|model InventoryIntegration|model InventorySyncJob|model Staff|model Location|model PlatformSetting" \
    apps/api/backend/prisma/schema.prisma \
    -C 20 || true
  echo

  echo "===== BUILD CHECK ====="
  npm run build:web
  echo

  echo "===== DEV SAFE CHECK ====="
  npm run check:dev-safe
  echo

  echo "===== ROLE ROUTE CHECK ====="
  SUPER_ADMIN_EMAIL='superadmin@pawn.local' SUPER_ADMIN_PASSWORD='SuperAdmin123!' npm run check:role-routes
  echo

  echo "===== SUPER ADMIN CHECKS ====="
  ./scripts/check-super-admin-system-health.sh || true
  ./scripts/check-super-admin-master-controls.sh || true
  ./scripts/check-super-admin-native-add-item.sh || true
  ./scripts/check-super-admin-integrations-settlements-controls.sh || true
  echo

  echo "===== PAGE REACHABILITY ====="
  for path in \
    / \
    /marketplace \
    /shops \
    /auctions \
    /watchlist \
    /saved-searches \
    /my-bids \
    /my-wins \
    /offers \
    /settlements \
    /owner \
    /owner/dashboard \
    /owner/inventory \
    /owner/integrations \
    /owner/auctions \
    /owner/locations \
    /owner/staff \
    /owner/subscription \
    /admin \
    /admin/users \
    /admin/shops \
    /admin/inventory \
    /super-admin \
    /super-admin/users \
    /super-admin/shops \
    /super-admin/inventory \
    /super-admin/integrations \
    /super-admin/settlements \
    /super-admin/platform-settings \
    /super-admin/audit \
    /super-admin/system
  do
    STATUS="$(/usr/bin/curl -sS -o /tmp/account-page-check.html -w "%{http_code}" "http://127.0.0.1:5176$path" || true)"
    echo "$STATUS $path"
  done

} 2>&1 | tee "$REPORT"

echo
echo "Saved report:"
echo "$REPORT"
