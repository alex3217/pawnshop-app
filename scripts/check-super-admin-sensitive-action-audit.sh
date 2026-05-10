#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:6002/api}"
SUPER_ADMIN_EMAIL="${SUPER_ADMIN_EMAIL:-superadmin@pawn.local}"
SUPER_ADMIN_PASSWORD="${SUPER_ADMIN_PASSWORD:-SuperAdmin123!}"

echo "===== SUPER ADMIN SENSITIVE ACTION AUDIT CHECK ====="
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

if [ -z "$SUPER_TOKEN" ]; then
  echo "❌ Super Admin login failed"
  exit 1
fi

echo "✅ Super Admin login"

STAMP="$(date +%s)"
OWNER_EMAIL="sensitive-owner-$STAMP@pawn.local"
SHOP_NAME="Sensitive Audit Shop $STAMP"

CREATE_OWNER_RESPONSE="$(
  curl -sS -X POST "$BASE_URL/auth/super-admin/users" \
    -H "Authorization: Bearer $SUPER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\":\"Sensitive Audit Owner\",
      \"email\":\"$OWNER_EMAIL\",
      \"password\":\"OwnerGov123!\",
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

echo "✅ Owner created: $OWNER_ID"

echo "Updating user role and status..."

curl -sS -X PATCH "$BASE_URL/super-admin/users/$OWNER_ID" \
  -H "Authorization: Bearer $SUPER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role":"CONSUMER"}' >/dev/null

curl -sS -X PATCH "$BASE_URL/super-admin/users/$OWNER_ID" \
  -H "Authorization: Bearer $SUPER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"isActive":false}' >/dev/null

curl -sS -X PATCH "$BASE_URL/super-admin/users/$OWNER_ID" \
  -H "Authorization: Bearer $SUPER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"isActive":true}' >/dev/null

curl -sS -X PATCH "$BASE_URL/super-admin/users/$OWNER_ID" \
  -H "Authorization: Bearer $SUPER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role":"OWNER"}' >/dev/null

echo "✅ User sensitive actions performed"

CREATE_SHOP_RESPONSE="$(
  curl -sS -X POST "$BASE_URL/super-admin/shops" \
    -H "Authorization: Bearer $SUPER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"ownerId\":\"$OWNER_ID\",
      \"name\":\"$SHOP_NAME\",
      \"address\":\"300 Sensitive Audit Way\",
      \"phone\":\"555-0300\",
      \"description\":\"Sensitive audit test shop\",
      \"hours\":\"Mon-Fri 9am-6pm\",
      \"subscriptionPlan\":\"FREE\",
      \"subscriptionStatus\":\"ACTIVE\"
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

echo "✅ Shop created: $SHOP_ID"

echo "Updating shop plan/status/disable/restore..."

curl -sS -X PATCH "$BASE_URL/super-admin/shops/$SHOP_ID" \
  -H "Authorization: Bearer $SUPER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"subscriptionPlan":"PRO"}' >/dev/null

curl -sS -X PATCH "$BASE_URL/super-admin/shops/$SHOP_ID" \
  -H "Authorization: Bearer $SUPER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"subscriptionStatus":"PAUSED"}' >/dev/null

curl -sS -X PATCH "$BASE_URL/super-admin/shops/$SHOP_ID" \
  -H "Authorization: Bearer $SUPER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"isDeleted":true}' >/dev/null

curl -sS -X PATCH "$BASE_URL/super-admin/shops/$SHOP_ID" \
  -H "Authorization: Bearer $SUPER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"isDeleted":false}' >/dev/null

echo "✅ Shop sensitive actions performed"

sleep 1

USER_AUDIT="$(
  curl -sS "$BASE_URL/super-admin/audit?limit=100&q=$OWNER_ID" \
    -H "Authorization: Bearer $SUPER_TOKEN"
)"

SHOP_AUDIT="$(
  curl -sS "$BASE_URL/super-admin/audit?limit=100&q=$SHOP_ID" \
    -H "Authorization: Bearer $SUPER_TOKEN"
)"

node -e '
const userPayload = JSON.parse(process.argv[1]);
const shopPayload = JSON.parse(process.argv[2]);

const userRows = userPayload.rows || userPayload.data?.rows || [];
const shopRows = shopPayload.rows || shopPayload.data?.rows || [];

const userActions = userRows.map((row) => row.action);
const shopActions = shopRows.map((row) => row.action);

const requiredUser = ["UPDATE_USER_ROLE", "DEACTIVATE_USER", "ACTIVATE_USER"];
const requiredShop = ["UPDATE_SHOP_PLAN", "UPDATE_SHOP_STATUS", "DISABLE_SHOP", "RESTORE_SHOP"];

for (const action of requiredUser) {
  if (!userActions.includes(action)) {
    console.error(`❌ Missing user audit action: ${action}`);
    console.error(JSON.stringify({ userActions, userRows: userRows.slice(0, 8) }, null, 2));
    process.exit(1);
  }
}

for (const action of requiredShop) {
  if (!shopActions.includes(action)) {
    console.error(`❌ Missing shop audit action: ${action}`);
    console.error(JSON.stringify({ shopActions, shopRows: shopRows.slice(0, 8) }, null, 2));
    process.exit(1);
  }
}

console.log("✅ User audit actions found:", requiredUser.join(", "));
console.log("✅ Shop audit actions found:", requiredShop.join(", "));
' "$USER_AUDIT" "$SHOP_AUDIT"

echo "✅ SUPER ADMIN SENSITIVE ACTION AUDIT CHECK PASSED"
