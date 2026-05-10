#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:6002/api}"
SUPER_ADMIN_EMAIL="${SUPER_ADMIN_EMAIL:-superadmin@pawn.local}"
SUPER_ADMIN_PASSWORD="${SUPER_ADMIN_PASSWORD:-SuperAdmin123!}"

echo "===== SUPER ADMIN GOVERNANCE SETUP CHECK ====="
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
OWNER_EMAIL="owner-setup-$STAMP@pawn.local"
SHOP_NAME="Governance Test Shop $STAMP"

echo "Creating owner: $OWNER_EMAIL"

CREATE_OWNER_RESPONSE="$(
  curl -sS -X POST "$BASE_URL/auth/super-admin/users" \
    -H "Authorization: Bearer $SUPER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\":\"Governance Owner $STAMP\",
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

echo "Creating shop for owner..."

CREATE_SHOP_RESPONSE="$(
  curl -sS -X POST "$BASE_URL/super-admin/shops" \
    -H "Authorization: Bearer $SUPER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"ownerId\":\"$OWNER_ID\",
      \"name\":\"$SHOP_NAME\",
      \"address\":\"100 Governance Way\",
      \"phone\":\"555-0100\",
      \"description\":\"Super Admin-created setup shop\",
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

echo "Verifying shop appears in Super Admin shops..."

curl -sS "$BASE_URL/super-admin/shops?limit=100" \
  -H "Authorization: Bearer $SUPER_TOKEN" \
  | node -e '
    let s="";
    process.stdin.on("data", d => s += d);
    process.stdin.on("end", () => {
      const payload = JSON.parse(s);
      const rows = payload.rows || payload.data?.rows || payload.shops || payload.data || [];
      const shopId = process.argv[1];
      const found = Array.isArray(rows) && rows.some((row) => row.id === shopId);
      if (!found) {
        console.error("❌ Created shop not found in Super Admin shops list");
        process.exit(1);
      }
      console.log("✅ Created shop visible in Super Admin shops list");
    });
  ' "$SHOP_ID"

echo "✅ SUPER ADMIN GOVERNANCE SETUP CHECK PASSED"
