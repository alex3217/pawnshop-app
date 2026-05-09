#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

API_BASE="${API_BASE:-http://127.0.0.1:6002/api}"
OWNER_EMAIL="${OWNER_EMAIL:-owner1@pawn.local}"
OWNER_PASSWORD="${OWNER_PASSWORD:-Owner123!}"

OUT="reports/owner-staff-permissions-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"

echo "===== OWNER STAFF / PERMISSIONS AUDIT ====="
echo "Repo: $ROOT"
echo "API_BASE: $API_BASE"
echo "Report: $OUT"

OWNER_TOKEN="$(
  curl -sS -X POST "$API_BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$OWNER_EMAIL\",\"password\":\"$OWNER_PASSWORD\"}" \
    | node -e '
let s="";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  const j = JSON.parse(s || "{}");
  process.stdout.write(j.token || j.accessToken || j.data?.token || j.data?.accessToken || "");
});
'
)"

if [ -z "$OWNER_TOKEN" ]; then
  echo "❌ Owner login failed"
  exit 1
fi

echo "✅ Owner login OK"

curl -sS "$API_BASE/shops/mine" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  | tee "$OUT/shops-mine.json" >/dev/null

curl -sS "$API_BASE/staff/mine" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  | tee "$OUT/staff-mine.json" >/dev/null

echo ""
echo "===== STATIC STAFF CAPABILITY CHECK =====" | tee "$OUT/static-staff-capability.txt"

{
  echo ""
  echo "Staff schema terms:"
  rg -n "model Staff|enum Staff|staff|permission|role|shopId|pawnShopId|userId" apps/api/backend/prisma/schema.prisma || true

  echo ""
  echo "Staff controller terms:"
  rg -n "permission|role|shopId|pawnShopId|ownerId|userId|invite|email|create|update|remove|delete" apps/api/backend/src/controllers/staff.controller.js || true

  echo ""
  echo "Staff frontend terms:"
  rg -n "permission|role|shop|invite|email|create|update|remove|delete" apps/web/src/pages/OwnerStaffPage.tsx apps/web/src/services/staff.ts || true
} | tee -a "$OUT/static-staff-capability.txt"

echo ""
echo "===== SUMMARY ====="

node - "$OUT/staff-mine.json" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const payload = JSON.parse(fs.readFileSync(file, "utf8") || "{}");

const rows =
  Array.isArray(payload) ? payload :
  Array.isArray(payload.data) ? payload.data :
  Array.isArray(payload.staff) ? payload.staff :
  Array.isArray(payload.rows) ? payload.rows :
  [];

const hasRole = rows.some((row) => Object.prototype.hasOwnProperty.call(row, "role"));
const hasPermissions = rows.some((row) =>
  Object.prototype.hasOwnProperty.call(row, "permissions") ||
  Object.prototype.hasOwnProperty.call(row, "permission")
);
const hasShopScope = rows.some((row) =>
  Object.prototype.hasOwnProperty.call(row, "shopId") ||
  Object.prototype.hasOwnProperty.call(row, "pawnShopId")
);
const hasUserLink = rows.some((row) =>
  Object.prototype.hasOwnProperty.call(row, "userId") ||
  Object.prototype.hasOwnProperty.call(row, "email")
);

console.log(JSON.stringify({
  staffCount: rows.length,
  hasRole,
  hasPermissions,
  hasShopScope,
  hasUserLink,
}, null, 2));

if (!hasRole || !hasShopScope) {
  process.exitCode = 2;
}
NODE

STATUS="$?"

if [ "$STATUS" = "0" ]; then
  echo "✅ Staff records appear to include role/shop-scope basics."
else
  echo "⚠️ Staff records may not include full role/shop-scope data. Review report."
fi

echo ""
echo "Report folder:"
echo "$OUT"
