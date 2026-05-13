#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:6002/api}"
WEB_BASE="${WEB_BASE:-http://127.0.0.1:5176}"
OWNER_EMAIL="${OWNER_EMAIL:-owner1@pawn.local}"
OWNER_PASSWORD="${OWNER_PASSWORD:-Owner123!}"

echo "===== OWNER INTEGRATIONS + AUCTIONS COMMAND CENTER V1 CHECK ====="

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
  /integrations/mine \
  /auctions/mine
do
  /usr/bin/curl -sS -f "$BASE_URL$api_path" \
    -H "Authorization: Bearer $OWNER_TOKEN" >/dev/null
  echo "✅ GET $api_path"
done

for page_path in \
  /owner/integrations \
  /owner/auctions \
  /owner/auctions/new \
  /owner/inventory
do
  STATUS="$(/usr/bin/curl -sS -o /tmp/owner-command-page.html -w "%{http_code}" "$WEB_BASE$page_path")"
  if [ "$STATUS" != "200" ]; then
    echo "❌ $page_path failed: $STATUS"
    exit 1
  fi
  echo "✅ $page_path reachable"
done

echo "Checking integrations controls..."
rg -n "Integration Command Center|Search integrations|Status Filter|Provider Filter|Connect Integration|Sync Now|Test|View Jobs|View Mappings|Add Mapping|Archive/Delete|Export CSV|Field mappings|Add mapping|Remove" \
  apps/web/src/pages/OwnerIntegrationsPage.tsx \
  apps/web/src/services/integrations.ts

echo "Checking auctions controls..."
rg -n "Auction Command Center|Daily Auction Controls|Search auctions|Create Auction|Inventory|Export CSV|View auction|view item|Cancel Auction|End Auction|filteredAuctions|owner-auctions.csv|statusFilter" \
  apps/web/src/pages/OwnerAuctionsPage.tsx \
  apps/web/src/services/auctions.ts

echo "✅ OWNER INTEGRATIONS + AUCTIONS COMMAND CENTER V1 CHECK PASSED"
