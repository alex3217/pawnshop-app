#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:6002/api}"
SUPER_ADMIN_EMAIL="${SUPER_ADMIN_EMAIL:-superadmin@pawn.local}"
SUPER_ADMIN_PASSWORD="${SUPER_ADMIN_PASSWORD:-SuperAdmin123!}"
OWNER_EMAIL="${OWNER_EMAIL:-owner1@pawn.local}"
OWNER_PASSWORD="${OWNER_PASSWORD:-Owner123!}"

echo "===== SUPER ADMIN INVENTORY MODERATION CHECK ====="
echo "BASE_URL=$BASE_URL"

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

OWNER_TOKEN="$(
  curl -sS -X POST "$BASE_URL/auth/login" \
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

if [ -z "$SUPER_TOKEN" ]; then
  echo "❌ Super Admin login failed"
  exit 1
fi

if [ -z "$OWNER_TOKEN" ]; then
  echo "❌ Owner login failed"
  exit 1
fi

echo "✅ Super Admin login"
echo "✅ Owner login"

SHOP_ID="$(
  curl -sS "$BASE_URL/shops/mine" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    | node -e '
      const payload = JSON.parse(require("fs").readFileSync(0, "utf8"));
      const rows = Array.isArray(payload) ? payload : payload.rows || payload.shops || payload.data || [];
      if (!Array.isArray(rows) || !rows[0]?.id) {
        console.error(JSON.stringify(payload, null, 2));
        process.exit(1);
      }
      process.stdout.write(rows[0].id);
    '
)"

echo "✅ Owner shop found: $SHOP_ID"

STAMP="$(date +%s)"
ITEM_TITLE="Moderation Audit Item $STAMP"

CREATE_ITEM_RESPONSE="$(
  curl -sS -X POST "$BASE_URL/items" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"pawnShopId\":\"$SHOP_ID\",
      \"title\":\"$ITEM_TITLE\",
      \"description\":\"Item created for Super Admin inventory moderation audit.\",
      \"price\":99,
      \"category\":\"Electronics\",
      \"condition\":\"Good\",
      \"status\":\"AVAILABLE\"
    }"
)"

ITEM_ID="$(
  node -e '
    const payload = JSON.parse(process.argv[1]);
    const item = payload.item || payload.data?.item || payload.data || payload;
    if (!item?.id) {
      console.error(JSON.stringify(payload, null, 2));
      process.exit(1);
    }
    process.stdout.write(item.id);
  ' "$CREATE_ITEM_RESPONSE"
)"

echo "✅ Item created: $ITEM_ID"

echo "Soft-deleting item as Super Admin..."

curl -sS -X DELETE "$BASE_URL/admin/items/$ITEM_ID" \
  -H "Authorization: Bearer $SUPER_TOKEN" >/dev/null

echo "✅ Item remove request sent"

echo "Restoring item as Super Admin..."

curl -sS -X PATCH "$BASE_URL/admin/items/$ITEM_ID/restore" \
  -H "Authorization: Bearer $SUPER_TOKEN" >/dev/null

echo "✅ Item restore request sent"

sleep 1

AUDIT_RESPONSE="$(
  curl -sS "$BASE_URL/super-admin/audit?limit=100&q=$ITEM_ID" \
    -H "Authorization: Bearer $SUPER_TOKEN"
)"

node -e '
const payload = JSON.parse(process.argv[1]);
const rows = payload.rows || payload.data?.rows || [];
const actions = rows.map((row) => row.action);
const required = ["MODERATE_ITEM_REMOVE", "MODERATE_ITEM_RESTORE"];

for (const action of required) {
  if (!actions.includes(action)) {
    console.error(`❌ Missing inventory audit action: ${action}`);
    console.error(JSON.stringify({ actions, rows: rows.slice(0, 8) }, null, 2));
    process.exit(1);
  }
}

console.log("✅ Inventory moderation audit actions found:", required.join(", "));
' "$AUDIT_RESPONSE"

echo "✅ SUPER ADMIN INVENTORY MODERATION CHECK PASSED"
