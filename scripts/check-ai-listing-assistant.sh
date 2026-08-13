#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:6002/api}"
OWNER_EMAIL="${OWNER_EMAIL:-owner1@pawn.local}"
OWNER_PASSWORD="${OWNER_PASSWORD:-Owner123!}"

echo "Checking AI Listing Assistant endpoint..."

TOKEN="$(
  curl -sS -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$OWNER_EMAIL\",\"password\":\"$OWNER_PASSWORD\"}" \
    | node -e '
      let s="";
      process.stdin.on("data", d => s += d);
      process.stdin.on("end", () => {
        try {
          const j = JSON.parse(s);
          process.stdout.write(j.token || j.accessToken || j.data?.token || j.data?.accessToken || "");
        } catch {
          process.stdout.write("");
        }
      });
    '
)"

if [ -z "$TOKEN" ]; then
  echo "❌ Owner login failed or token missing."
  exit 1
fi

echo "✅ Owner login"

SHOP_ID="$(
  curl -sS "$BASE_URL/shops/mine" \
    -H "Authorization: Bearer $TOKEN" \
    | node -e '
      let s="";
      process.stdin.on("data", d => s += d);
      process.stdin.on("end", () => {
        try {
          const j = JSON.parse(s);
          const shops = Array.isArray(j) ? j : j.shops || j.data?.shops || j.data || [];
          process.stdout.write(String(shops[0]?.id || ""));
        } catch { process.stdout.write(""); }
      });
    '
)"

if [ -z "$SHOP_ID" ]; then
  echo "❌ Owner has no managed shop for the AI inventory smoke test."
  exit 1
fi

RESPONSE="$(
  curl -sS -X POST "$BASE_URL/ai/listing-assistant" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"context\": \"INVENTORY_ITEM\",
      \"pawnShopId\": \"$SHOP_ID\",
      \"title\": \"used dewalt drill\",
      \"description\": \"works good comes with battery\",
      \"price\": \"89\",
      \"category\": \"Tools\",
      \"condition\": \"Good\",
      \"shopName\": \"Smoke Test Shop\"
    }"
)"

node -e '
const payload = JSON.parse(process.argv[1]);
if (!payload.success) {
  console.error("❌ AI endpoint did not return success.");
  process.exit(1);
}
const description = payload.data?.description;
if (!description) {
  console.error("❌ AI response missing description.");
  process.exit(1);
}
console.log("✅ POST /ai/listing-assistant");
console.log("Description:", description);
' "$RESPONSE"
