#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:6002/api}"
WEB_BASE="${WEB_BASE:-http://127.0.0.1:5176}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin1@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin123}"

echo "===== SUPER ADMIN NATIVE ADD ITEM CHECK ====="

ADMIN_TOKEN="$(
  /usr/bin/curl -sS -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
    | node -e '
      let s="";
      process.stdin.on("data", d => s += d);
      process.stdin.on("end", () => {
        const j = JSON.parse(s);
        process.stdout.write(j.token || j.accessToken || j.data?.token || j.data?.accessToken || "");
      });
    '
)"

if [ -z "$ADMIN_TOKEN" ]; then
  echo "❌ Admin login failed"
  exit 1
fi

echo "✅ Admin login"

SHOP_ID="$(
  /usr/bin/curl -sS "$BASE_URL/admin/shops" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    | node -e '
      const payload = JSON.parse(require("fs").readFileSync(0, "utf8"));
      const rows = Array.isArray(payload) ? payload : payload.rows || payload.shops || payload.data || [];
      if (!Array.isArray(rows) || !rows[0]?.id) process.exit(1);
      process.stdout.write(rows[0].id);
    '
)"

STAMP="$(date +%s)"

CREATE_RESPONSE="$(
  /usr/bin/curl -sS -X POST "$BASE_URL/admin/items" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"shopId\":\"$SHOP_ID\",
      \"title\":\"Native Add Item $STAMP\",
      \"description\":\"Created from Super Admin native add item check\",
      \"price\":99.99,
      \"currency\":\"USD\",
      \"category\":\"Test\",
      \"condition\":\"USED\",
      \"status\":\"AVAILABLE\"
    }"
)"

ITEM_ID="$(
  node -e '
    const payload = JSON.parse(process.argv[1]);
    if (!payload.item?.id) {
      console.error(JSON.stringify(payload, null, 2));
      process.exit(1);
    }
    process.stdout.write(payload.item.id);
  ' "$CREATE_RESPONSE"
)"

echo "✅ POST /admin/items created item: $ITEM_ID"

UPDATE_RESPONSE="$(
  /usr/bin/curl -sS -X PATCH "$BASE_URL/admin/items/$ITEM_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"status":"SOLD"}'
)"

node -e '
  const payload = JSON.parse(process.argv[1]);
  if (!payload.item?.id) {
    console.error(JSON.stringify(payload, null, 2));
    process.exit(1);
  }
  console.log("✅ PATCH /admin/items/:id updated created item");
' "$UPDATE_RESPONSE"

STATUS="$(/usr/bin/curl -sS -o /tmp/native-add-item-page.html -w "%{http_code}" "$WEB_BASE/super-admin/inventory")"
if [ "$STATUS" != "200" ]; then
  echo "❌ /super-admin/inventory failed: $STATUS"
  exit 1
fi

echo "✅ /super-admin/inventory reachable"

rg -n "Add Item|Create Item|createAdminItem|CreateAdminItemInput|POST /api/admin/items|router.post\\(\"/items\"" \
  apps/web/src/pages/AdminItemsPage.tsx \
  apps/web/src/admin/services/adminApi.ts \
  apps/api/backend/src/routes/admin.routes.js \
  apps/api/backend/src/controllers/admin.controller.js

echo "✅ SUPER ADMIN NATIVE ADD ITEM CHECK PASSED"
