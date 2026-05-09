#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

API_BASE="${API_BASE:-http://127.0.0.1:6002/api}"
OWNER_EMAIL="${OWNER_EMAIL:-owner1@pawn.local}"
OWNER_PASSWORD="${OWNER_PASSWORD:-Owner123!}"

OUT="reports/staff-access-v1-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"

echo "===== STAFF ACCESS V1 AUDIT ====="
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

SHOP_ID="$(
  curl -sS "$API_BASE/shops/mine" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    | tee "$OUT/shops-mine.json" \
    | node -e '
let s="";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  const j = JSON.parse(s || "[]");
  const rows = Array.isArray(j) ? j : Array.isArray(j.data) ? j.data : [];
  process.stdout.write(rows[0]?.id || "");
});
'
)"

if [ -z "$SHOP_ID" ]; then
  echo "❌ Owner shop not found"
  exit 1
fi

echo "✅ Owner shop found: $SHOP_ID"

STAFF_EMAIL="staff.audit.$(date +%s)@pawn.local"

CREATE_PAYLOAD="$(
  node - <<NODE
console.log(JSON.stringify({
  shopId: "$SHOP_ID",
  email: "$STAFF_EMAIL",
  name: "Staff Audit User",
  phone: "555-9191",
  role: "INVENTORY",
  permissions: ["inventory:read", "inventory:write", "locations:read"]
}));
NODE
)"

echo "$CREATE_PAYLOAD" > "$OUT/create-payload.json"

CREATE_RESPONSE="$(
  curl -sS -X POST "$API_BASE/staff" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$CREATE_PAYLOAD" \
    | tee "$OUT/create-response.json"
)"

STAFF_ID="$(
  echo "$CREATE_RESPONSE" | node -e '
let s="";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  const j = JSON.parse(s || "{}");
  process.stdout.write(j.id || j.data?.id || "");
});
'
)"

if [ -z "$STAFF_ID" ]; then
  echo "❌ Staff create failed"
  cat "$OUT/create-response.json"
  exit 1
fi

echo "✅ Staff created: $STAFF_ID"

UPDATE_PAYLOAD='{"role":"AUCTION","status":"ACTIVE","permissions":["auctions:read","auctions:write","inventory:read"]}'

echo "$UPDATE_PAYLOAD" > "$OUT/update-payload.json"

UPDATE_RESPONSE="$(
  curl -sS -X PATCH "$API_BASE/staff/$STAFF_ID" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$UPDATE_PAYLOAD" \
    | tee "$OUT/update-response.json"
)"

echo "$UPDATE_RESPONSE" | node -e '
let s="";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  const j = JSON.parse(s || "{}");

  if (j.role !== "AUCTION") {
    console.error("Expected role AUCTION, got", j.role);
    process.exit(1);
  }

  if (j.status !== "ACTIVE") {
    console.error("Expected status ACTIVE, got", j.status);
    process.exit(1);
  }

  if (!Array.isArray(j.permissions) || !j.permissions.includes("auctions:write")) {
    console.error("Expected auctions:write permission");
    process.exit(1);
  }
});
'

echo "✅ Staff role/status/permissions updated"

curl -sS "$API_BASE/staff/mine" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  | tee "$OUT/staff-mine.json" >/dev/null

node - "$OUT/staff-mine.json" "$STAFF_ID" <<'NODE'
const fs = require("fs");

const file = process.argv[2];
const staffId = process.argv[3];

const payload = JSON.parse(fs.readFileSync(file, "utf8") || "[]");
const rows = Array.isArray(payload) ? payload : Array.isArray(payload.data) ? payload.data : [];

const found = rows.find((row) => row.id === staffId);

if (!found) {
  console.error("Created staff member not visible in /staff/mine");
  process.exit(1);
}

if (found.role !== "AUCTION") {
  console.error("Staff role not visible as AUCTION");
  process.exit(1);
}

if (!Array.isArray(found.permissions) || !found.permissions.includes("auctions:write")) {
  console.error("Staff permissions not visible in /staff/mine");
  process.exit(1);
}

console.log("✅ Created staff appears in /staff/mine with updated role and permissions");
NODE

ARCHIVE_RESPONSE="$(
  curl -sS -X DELETE "$API_BASE/staff/$STAFF_ID" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    | tee "$OUT/archive-response.json"
)"

echo "$ARCHIVE_RESPONSE" | node -e '
let s="";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  const j = JSON.parse(s || "{}");

  if (j.status !== "ARCHIVED") {
    console.error("Expected ARCHIVED status, got", j.status);
    process.exit(1);
  }
});
'

echo "✅ Staff archived"

echo ""
echo "✅ STAFF ACCESS V1 AUDIT PASSED"
echo "Report folder:"
echo "$OUT"
