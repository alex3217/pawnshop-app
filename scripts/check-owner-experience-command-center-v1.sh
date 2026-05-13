#!/usr/bin/env bash
set -euo pipefail

WEB_BASE="${WEB_BASE:-http://127.0.0.1:5176}"
BASE_URL="${BASE_URL:-http://127.0.0.1:6002/api}"
OWNER_EMAIL="${OWNER_EMAIL:-owner1@pawn.local}"
OWNER_PASSWORD="${OWNER_PASSWORD:-Owner123!}"

echo "===== OWNER EXPERIENCE COMMAND CENTER V1 CHECK ====="
echo "BASE_URL=$BASE_URL"
echo "WEB_BASE=$WEB_BASE"

OWNER_TOKEN="$(
  /usr/bin/curl -sS -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$OWNER_EMAIL\",\"password\":\"$OWNER_PASSWORD\"}" \
    | node -e '
      let s="";
      process.stdin.on("data", d => s += d);
      process.stdin.on("end", () => {
        const j = JSON.parse(s);
        process.stdout.write(j.token || j.accessToken || j.data?.token || j.data?.accessToken || "");
      });
    '
)"

if [ -z "$OWNER_TOKEN" ]; then
  echo "❌ Owner login failed"
  exit 1
fi

echo "✅ Owner login"

for api_path in \
  /auth/me \
  /shops/mine \
  /items/mine \
  /auctions/mine \
  /offers/owner \
  /settlements/mine
do
  /usr/bin/curl -sS -f "$BASE_URL$api_path" \
    -H "Authorization: Bearer $OWNER_TOKEN" >/dev/null
  echo "✅ GET $api_path"
done

for page_path in \
  /owner \
  /owner/inventory \
  /owner/items/new \
  /owner/bulk-upload \
  /owner/scan-console \
  /owner/auctions \
  /owner/integrations \
  /owner/subscription
do
  STATUS="$(/usr/bin/curl -sS -o /tmp/owner-page-check.html -w "%{http_code}" "$WEB_BASE$page_path")"
  if [ "$STATUS" != "200" ]; then
    echo "❌ $page_path failed: $STATUS"
    exit 1
  fi
  echo "✅ $page_path reachable"
done

echo "Checking owner dashboard controls..."

rg -n "Owner Command Center|Shop Health|Quick Actions|Inventory Health|Offers|Auctions|Settlements|Integration|Add Item|Bulk Upload|Scan Console|Create Auction" \
  apps/web/src/pages/OwnerDashboardPage.tsx

echo "Checking owner inventory controls..."

rg -n "Inventory Command Center|Search|Add Item|Edit|Mark Sold|Delete|Bulk Upload|Scan Console|Export|Filter|Sort" \
  apps/web/src/pages/OwnerInventoryPage.tsx

echo "✅ OWNER EXPERIENCE COMMAND CENTER V1 CHECK PASSED"
