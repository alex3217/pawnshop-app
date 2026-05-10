#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:6002/api}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin1@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin123}"

echo "===== ADMIN CRUD CONTROLS CHECK ====="
echo "BASE_URL=$BASE_URL"

ADMIN_TOKEN="$(
  curl -sS -X POST "$BASE_URL/auth/login" \
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

STAMP="$(date +%s)"
USER_EMAIL="admin-crud-consumer-$STAMP@pawn.local"
OWNER_EMAIL="admin-crud-owner-$STAMP@pawn.local"
SHOP_NAME="Admin CRUD Shop $STAMP"

CREATE_USER_RESPONSE="$(
  curl -sS -X POST "$BASE_URL/admin/users" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\":\"Admin CRUD Consumer\",
      \"email\":\"$USER_EMAIL\",
      \"password\":\"AdminCrud123!\",
      \"role\":\"CONSUMER\"
    }"
)"

USER_ID="$(
  node -e '
    const payload = JSON.parse(process.argv[1]);
    if (!payload.user?.id) {
      console.error(JSON.stringify(payload, null, 2));
      process.exit(1);
    }
    process.stdout.write(payload.user.id);
  ' "$CREATE_USER_RESPONSE"
)"

echo "✅ POST /admin/users created consumer: $USER_ID"

curl -sS -X PATCH "$BASE_URL/admin/users/$USER_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin CRUD Consumer Updated","isActive":true}' \
  | node -e '
    const payload = JSON.parse(require("fs").readFileSync(0, "utf8"));
    if (!payload.user?.id) {
      console.error(JSON.stringify(payload, null, 2));
      process.exit(1);
    }
    console.log("✅ PATCH /admin/users/:id updated user");
  '

CREATE_OWNER_RESPONSE="$(
  curl -sS -X POST "$BASE_URL/admin/users" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\":\"Admin CRUD Owner\",
      \"email\":\"$OWNER_EMAIL\",
      \"password\":\"AdminCrud123!\",
      \"role\":\"OWNER\"
    }"
)"

OWNER_ID="$(
  node -e '
    const payload = JSON.parse(process.argv[1]);
    if (!payload.user?.id) {
      console.error(JSON.stringify(payload, null, 2));
      process.exit(1);
    }
    process.stdout.write(payload.user.id);
  ' "$CREATE_OWNER_RESPONSE"
)"

echo "✅ POST /admin/users created owner: $OWNER_ID"

CREATE_SHOP_RESPONSE="$(
  curl -sS -X POST "$BASE_URL/admin/shops" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"ownerId\":\"$OWNER_ID\",
      \"name\":\"$SHOP_NAME\",
      \"address\":\"100 Admin CRUD Way\",
      \"phone\":\"555-0100\",
      \"description\":\"Admin CRUD smoke test shop\",
      \"hours\":\"Mon-Fri 9am-6pm\"
    }"
)"

SHOP_ID="$(
  node -e '
    const payload = JSON.parse(process.argv[1]);
    if (!payload.shop?.id) {
      console.error(JSON.stringify(payload, null, 2));
      process.exit(1);
    }
    process.stdout.write(payload.shop.id);
  ' "$CREATE_SHOP_RESPONSE"
)"

echo "✅ POST /admin/shops created shop: $SHOP_ID"

curl -sS -X PATCH "$BASE_URL/admin/shops/$SHOP_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin CRUD Shop Updated","phone":"555-0199"}' \
  | node -e '
    const payload = JSON.parse(require("fs").readFileSync(0, "utf8"));
    if (!payload.shop?.id) {
      console.error(JSON.stringify(payload, null, 2));
      process.exit(1);
    }
    console.log("✅ PATCH /admin/shops/:id updated shop");
  '

ITEM_ID="$(
  curl -sS "$BASE_URL/admin/items" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    | node -e '
      const payload = JSON.parse(require("fs").readFileSync(0, "utf8"));
      const rows = Array.isArray(payload) ? payload : payload.rows || payload.items || payload.data || [];
      if (!Array.isArray(rows) || !rows[0]?.id) {
        process.stdout.write("");
        process.exit(0);
      }
      process.stdout.write(rows[0].id);
    '
)"

if [ -n "$ITEM_ID" ]; then
  curl -sS -X PATCH "$BASE_URL/admin/items/$ITEM_ID" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"status":"AVAILABLE"}' \
    | node -e '
      const payload = JSON.parse(require("fs").readFileSync(0, "utf8"));
      if (!payload.item?.id) {
        console.error(JSON.stringify(payload, null, 2));
        process.exit(1);
      }
      console.log("✅ PATCH /admin/items/:id updated item");
    '
else
  echo "⚠️ No item found to test PATCH /admin/items/:id; skipping item update."
fi

echo "✅ ADMIN CRUD CONTROLS CHECK PASSED"
