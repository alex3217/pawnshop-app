#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

TS="$(date +%Y%m%d-%H%M%S)"
OUT="reports/owner-dashboard-$TS"
mkdir -p "$OUT"

API_BASE="${API_BASE:-http://127.0.0.1:6002/api}"
WEB_BASE="${WEB_BASE:-http://127.0.0.1:5176}"
OWNER_EMAIL="${OWNER_EMAIL:-owner1@pawn.local}"
OWNER_PASSWORD="${OWNER_PASSWORD:-Owner123!}"

echo "===== OWNER DASHBOARD AUDIT ====="
echo "Repo: $ROOT"
echo "Report: $OUT"
echo "API_BASE: $API_BASE"
echo "WEB_BASE: $WEB_BASE"
echo "Owner: $OWNER_EMAIL"

section() {
  echo ""
  echo "===== $1 ====="
}

section "1. Runtime and app safety checks"
{
  ./scripts/check-process-boundaries.sh || true
  ./scripts/guard-ports.sh || true

  echo ""
  npm run build:web

  echo ""
  npm run check:dev-safe

  echo ""
  SUPER_ADMIN_EMAIL='superadmin@pawn.local' \
  SUPER_ADMIN_PASSWORD='SuperAdmin123!' \
  npm run check:role-routes
} 2>&1 | tee "$OUT/01-runtime-build-routes.txt"

section "2. Owner routes in App.tsx"
{
  rg -n "ownerRoutes|OWNER_ROLES|/owner|/owner/inventory|/owner/locations|/owner/staff|/owner/auctions|/owner/subscription|/owner/items/new|/owner/bulk-upload|/owner/scan-console" \
    apps/web/src/App.tsx || true
} | tee "$OUT/02-owner-routes.txt"

section "3. Owner pages"
{
  find apps/web/src/pages -maxdepth 1 -type f \
    | rg 'OwnerDashboardPage|OwnerInventoryPage|OwnerLocationsPage|OwnerStaffPage|OwnerAuctionsPage|OwnerSubscriptionPage|CreateItemPage|CreateAuctionPage|CreateShopPage|BulkUploadPage|ScanConsolePage|OwnerItemEditPage' \
    | sort || true
} | tee "$OUT/03-owner-pages.txt"

section "4. Owner services"
{
  find apps/web/src/services -maxdepth 1 -type f \
    | rg 'ownerWorkspace|items|shops|locations|staff|auctions|offers|settlements|uploads|apiClient|auth' \
    | sort || true
} | tee "$OUT/04-owner-services.txt"

section "5. Owner UI debt scan"
{
  echo "Owner placeholder/stub scan:"
  rg -n --hidden \
    --glob '!node_modules/**' \
    --glob '!dist/**' \
    --glob '!build/**' \
    --glob '!reports/**' \
    -i 'scaffold stub|Replace with real UI|placeholderRoute|FeaturePlaceholderPage|coming soon|not implemented|mock data' \
    apps/web/src/pages/OwnerDashboardPage.tsx \
    apps/web/src/pages/OwnerInventoryPage.tsx \
    apps/web/src/pages/OwnerLocationsPage.tsx \
    apps/web/src/pages/OwnerStaffPage.tsx \
    apps/web/src/pages/OwnerAuctionsPage.tsx \
    apps/web/src/pages/OwnerSubscriptionPage.tsx \
    apps/web/src/pages/CreateItemPage.tsx \
    apps/web/src/pages/CreateAuctionPage.tsx \
    apps/web/src/pages/CreateShopPage.tsx \
    apps/web/src/pages/BulkUploadPage.tsx \
    apps/web/src/pages/ScanConsolePage.tsx \
    apps/web/src/pages/OwnerItemEditPage.tsx 2>/dev/null || echo "✅ No owner page placeholders found"

  echo ""
  echo "Owner raw network call scan:"
  rg -n 'fetch\(|axios\.|XMLHttpRequest' \
    apps/web/src/pages/OwnerDashboardPage.tsx \
    apps/web/src/pages/OwnerInventoryPage.tsx \
    apps/web/src/pages/OwnerLocationsPage.tsx \
    apps/web/src/pages/OwnerStaffPage.tsx \
    apps/web/src/pages/OwnerAuctionsPage.tsx \
    apps/web/src/pages/OwnerSubscriptionPage.tsx \
    apps/web/src/pages/CreateItemPage.tsx \
    apps/web/src/pages/CreateAuctionPage.tsx \
    apps/web/src/pages/CreateShopPage.tsx \
    apps/web/src/pages/BulkUploadPage.tsx \
    apps/web/src/pages/ScanConsolePage.tsx \
    apps/web/src/pages/OwnerItemEditPage.tsx 2>/dev/null || echo "✅ No raw fetch in owner pages"
} | tee "$OUT/05-owner-ui-debt.txt"

section "6. Owner login"
LOGIN_JSON="$(
  curl -sS -X POST "$API_BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$OWNER_EMAIL\",\"password\":\"$OWNER_PASSWORD\"}" || true
)"

printf '%s\n' "$LOGIN_JSON" > "$OUT/06-login-response.json"

TOKEN="$(
  printf '%s' "$LOGIN_JSON" | node -e '
    let s="";
    process.stdin.on("data", d => s += d);
    process.stdin.on("end", () => {
      try {
        const j = JSON.parse(s || "{}");
        process.stdout.write(j.token || j.accessToken || j.data?.token || j.data?.accessToken || "");
      } catch {
        process.stdout.write("");
      }
    });
  '
)"

if [ -z "$TOKEN" ]; then
  echo "❌ Owner login failed or token missing"
  cat "$OUT/06-login-response.json"
  exit 1
fi

echo "✅ Owner login token received" | tee "$OUT/06-login-status.txt"

section "7. Owner API endpoints"
{
  for api_route in \
    "/auth/me" \
    "/shops/mine" \
    "/items/mine" \
    "/locations/mine" \
    "/staff/mine" \
    "/auctions/mine" \
    "/offers/owner" \
    "/settlements/mine" \
    "/seller-plans"
  do
    safe_name="$(printf '%s' "$api_route" | tr '/?' '__' | tr -cd '[:alnum:]_=-')"
    code="$(curl -sS -o "$OUT/api-$safe_name.json" -w "%{http_code}" \
      -H "Authorization: Bearer $TOKEN" \
      "$API_BASE$api_route" || true)"

    if [[ "$code" == 2* ]]; then
      echo "✅ $code $api_route"
    else
      echo "❌ $code $api_route"
      cat "$OUT/api-$safe_name.json" || true
    fi
  done
} | tee "$OUT/07-owner-api-endpoints.txt"

section "8. Owner frontend routes"
{
  for web_route in \
    "/owner" \
    "/owner/inventory" \
    "/owner/locations" \
    "/owner/staff" \
    "/owner/auctions" \
    "/owner/auctions/new" \
    "/owner/items/new" \
    "/owner/shops/new" \
    "/owner/bulk-upload" \
    "/owner/scan-console" \
    "/owner/subscription"
  do
    code="$(curl -sS -o /dev/null -w "%{http_code}" "$WEB_BASE$web_route" || true)"

    if [[ "$code" == 2* || "$code" == 3* ]]; then
      echo "✅ $code $web_route"
    else
      echo "❌ $code $web_route"
    fi
  done
} | tee "$OUT/08-owner-frontend-routes.txt"

section "9. Owner dashboard summary"
{
  echo "Report folder: $OUT"
  echo ""
  echo "Review these:"
  echo "$OUT/05-owner-ui-debt.txt"
  echo "$OUT/07-owner-api-endpoints.txt"
  echo "$OUT/08-owner-frontend-routes.txt"
} | tee "$OUT/SUMMARY.txt"

echo ""
echo "✅ Owner dashboard audit complete."
echo "Report folder:"
echo "$OUT"
