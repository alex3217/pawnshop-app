#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:6002/api}"
SUPER_ADMIN_EMAIL="${SUPER_ADMIN_EMAIL:-superadmin@pawn.local}"
SUPER_ADMIN_PASSWORD="${SUPER_ADMIN_PASSWORD:-SuperAdmin123!}"

echo "===== SUPER ADMIN GOVERNANCE AUDIT CHECK ====="
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
OWNER_A_EMAIL="owner-audit-a-$STAMP@pawn.local"
OWNER_B_EMAIL="owner-audit-b-$STAMP@pawn.local"
SHOP_NAME="Governance Audit Shop $STAMP"

create_owner() {
  local email="$1"

  curl -sS -X POST "$BASE_URL/auth/super-admin/users" \
    -H "Authorization: Bearer $SUPER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\":\"Governance Audit Owner\",
      \"email\":\"$email\",
      \"password\":\"OwnerGov123!\",
      \"role\":\"OWNER\"
    }" \
    | node -e '
      const payload = JSON.parse(require("fs").readFileSync(0, "utf8"));
      if (!payload.user?.id) {
        console.error(JSON.stringify(payload, null, 2));
        process.exit(1);
      }
      process.stdout.write(payload.user.id);
    '
}

OWNER_A_ID="$(create_owner "$OWNER_A_EMAIL")"
OWNER_B_ID="$(create_owner "$OWNER_B_EMAIL")"

echo "✅ Owner A created: $OWNER_A_ID"
echo "✅ Owner B created: $OWNER_B_ID"

CREATE_SHOP_RESPONSE="$(
  curl -sS -X POST "$BASE_URL/super-admin/shops" \
    -H "Authorization: Bearer $SUPER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"ownerId\":\"$OWNER_A_ID\",
      \"name\":\"$SHOP_NAME\",
      \"address\":\"200 Audit Way\",
      \"phone\":\"555-0200\",
      \"description\":\"Super Admin audit governance shop\",
      \"hours\":\"Mon-Fri 9am-6pm\",
      \"subscriptionPlan\":\"PRO\",
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

REASSIGN_RESPONSE="$(
  curl -sS -X PATCH "$BASE_URL/super-admin/shops/$SHOP_ID/owner" \
    -H "Authorization: Bearer $SUPER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"ownerId\":\"$OWNER_B_ID\"}"
)"

node -e '
const payload = JSON.parse(process.argv[1]);
if (!payload.shop?.id) {
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}
if (payload.shop.ownerId !== process.argv[2]) {
  console.error("❌ Shop owner did not change to Owner B");
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}
console.log("✅ Shop reassigned to Owner B");
' "$REASSIGN_RESPONSE" "$OWNER_B_ID"

echo "Checking audit logs for shop actions..."

AUDIT_RESPONSE="$(
  curl -sS "$BASE_URL/super-admin/audit?limit=100&q=$SHOP_ID" \
    -H "Authorization: Bearer $SUPER_TOKEN"
)"

node -e '
const payload = JSON.parse(process.argv[1]);
const rows = payload.rows || payload.data?.rows || [];
const actions = rows.map((row) => row.action);
const required = ["CREATE_SHOP", "REASSIGN_SHOP_OWNER"];
for (const action of required) {
  if (!actions.includes(action)) {
    console.error(`❌ Missing audit action: ${action}`);
    console.error(JSON.stringify({ actions, rows: rows.slice(0, 5) }, null, 2));
    process.exit(1);
  }
}
console.log("✅ Audit logs include CREATE_SHOP and REASSIGN_SHOP_OWNER");
' "$AUDIT_RESPONSE"

echo "✅ SUPER ADMIN GOVERNANCE AUDIT CHECK PASSED"
