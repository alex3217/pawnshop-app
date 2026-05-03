#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

TS="$(date +%Y%m%d-%H%M%S)"
OUT="reports/buyer-dashboard-$TS"
mkdir -p "$OUT"

API_BASE="${API_BASE:-http://127.0.0.1:6002/api}"
WEB_BASE="${WEB_BASE:-http://127.0.0.1:5176}"
BUYER_EMAIL="${BUYER_EMAIL:-buyer@pawn.local}"
BUYER_PASSWORD="${BUYER_PASSWORD:-Buyer123!}"

echo "===== BUYER / CONSUMER DASHBOARD AUDIT ====="
echo "Repo: $ROOT"
echo "Report: $OUT"
echo "API_BASE: $API_BASE"
echo "WEB_BASE: $WEB_BASE"
echo "Buyer: $BUYER_EMAIL"

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

section "2. Buyer routes in App.tsx"
{
  rg -n "consumerRoutes|CONSUMER_ROLES|/my-bids|/bids|/my-wins|/watchlist|/saved-searches|/offers" \
    apps/web/src/App.tsx || true
} | tee "$OUT/02-buyer-routes.txt"

section "3. Buyer pages"
{
  find apps/web/src/pages -maxdepth 1 -type f \
    | rg 'MyBidsPage|MyWinsPage|WatchlistPage|SavedSearchesPage|OffersPage|MarketplacePage|AuctionDetailPage|ItemDetailPage|ShopDetailPage' \
    | sort || true
} | tee "$OUT/03-buyer-pages.txt"

section "4. Buyer services"
{
  find apps/web/src/services -maxdepth 1 -type f \
    | rg 'bids|settlements|watchlist|savedSearches|offers|buyerPlans|auctions|items|shops|apiClient|auth' \
    | sort || true
} | tee "$OUT/04-buyer-services.txt"

section "5. Buyer UI debt scan"
{
  echo "Buyer placeholder/stub scan:"
  rg -n --hidden \
    --glob '!node_modules/**' \
    --glob '!dist/**' \
    --glob '!build/**' \
    --glob '!reports/**' \
    -i 'scaffold stub|Replace with real UI|placeholderRoute|FeaturePlaceholderPage|coming soon|not implemented|mock data' \
    apps/web/src/pages/MyBidsPage.tsx \
    apps/web/src/pages/MyWinsPage.tsx \
    apps/web/src/pages/WatchlistPage.tsx \
    apps/web/src/pages/SavedSearchesPage.tsx \
    apps/web/src/pages/OffersPage.tsx \
    apps/web/src/pages/MarketplacePage.tsx \
    apps/web/src/pages/AuctionDetailPage.tsx \
    apps/web/src/pages/ItemDetailPage.tsx \
    apps/web/src/pages/ShopDetailPage.tsx 2>/dev/null || echo "✅ No buyer page placeholders found"

  echo ""
  echo "Buyer raw network call scan:"
  rg -n 'fetch\(|axios\.|XMLHttpRequest' \
    apps/web/src/pages/MyBidsPage.tsx \
    apps/web/src/pages/MyWinsPage.tsx \
    apps/web/src/pages/WatchlistPage.tsx \
    apps/web/src/pages/SavedSearchesPage.tsx \
    apps/web/src/pages/OffersPage.tsx \
    apps/web/src/pages/MarketplacePage.tsx \
    apps/web/src/pages/AuctionDetailPage.tsx \
    apps/web/src/pages/ItemDetailPage.tsx \
    apps/web/src/pages/ShopDetailPage.tsx 2>/dev/null || echo "✅ No raw fetch in buyer pages"
} | tee "$OUT/05-buyer-ui-debt.txt"

section "6. Buyer login"
LOGIN_JSON="$(
  curl -sS -X POST "$API_BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$BUYER_EMAIL\",\"password\":\"$BUYER_PASSWORD\"}" || true
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
  echo "❌ Buyer login failed or token missing"
  cat "$OUT/06-login-response.json"
  exit 1
fi

echo "✅ Buyer login token received" | tee "$OUT/06-login-status.txt"

section "7. Buyer API endpoints"
{
  for api_route in \
    "/auth/me" \
    "/bids/mine" \
    "/settlements/mine" \
    "/watchlist/mine" \
    "/saved-searches/mine" \
    "/buyer-plans/mine" \
    "/offers/mine" \
    "/auctions?limit=5" \
    "/items?limit=5" \
    "/shops?limit=5"
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
} | tee "$OUT/07-buyer-api-endpoints.txt"

section "8. Buyer frontend routes"
{
  for web_route in \
    "/marketplace" \
    "/auctions" \
    "/my-bids" \
    "/my-wins" \
    "/watchlist" \
    "/saved-searches" \
    "/offers"
  do
    code="$(curl -sS -o /dev/null -w "%{http_code}" "$WEB_BASE$web_route" || true)"

    if [[ "$code" == 2* || "$code" == 3* ]]; then
      echo "✅ $code $web_route"
    else
      echo "❌ $code $web_route"
    fi
  done
} | tee "$OUT/08-buyer-frontend-routes.txt"

section "9. Buyer dashboard summary"
{
  echo "Report folder: $OUT"
  echo ""
  echo "Review these:"
  echo "$OUT/05-buyer-ui-debt.txt"
  echo "$OUT/07-buyer-api-endpoints.txt"
  echo "$OUT/08-buyer-frontend-routes.txt"
} | tee "$OUT/SUMMARY.txt"

echo ""
echo "✅ Buyer dashboard audit complete."
echo "Report folder:"
echo "$OUT"
