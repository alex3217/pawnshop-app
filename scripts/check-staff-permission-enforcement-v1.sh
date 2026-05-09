#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

API_BASE="${API_BASE:-http://127.0.0.1:6002/api}"
OWNER_EMAIL="${OWNER_EMAIL:-owner1@pawn.local}"
OWNER_PASSWORD="${OWNER_PASSWORD:-Owner123!}"
STAFF_PASSWORD="${STAFF_PASSWORD:-Staff123!}"

OUT="reports/staff-permission-enforcement-v1-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"

echo "===== STAFF PERMISSION ENFORCEMENT V1 AUDIT ====="
echo "Repo: $ROOT"
echo "API_BASE: $API_BASE"
echo "Report: $OUT"

export DATABASE_URL="$(
  node --env-file=apps/api/backend/.env.development -e 'process.stdout.write(process.env.DATABASE_URL || "")'
)"

if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL missing from apps/api/backend/.env.development"
  exit 1
fi

node - <<'NODE'
const raw = process.env.DATABASE_URL || "";
const u = new URL(raw);
u.password = "***";
console.log("Audit DB target:", u.toString());

if (/prod/i.test(u.hostname) || /prod/i.test(u.pathname)) {
  console.error("❌ Refusing production-looking DATABASE_URL.");
  process.exit(1);
}
NODE

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

STAFF_EMAIL="staff.permission.$(date +%s)@pawn.local"

node --input-type=module - "$STAFF_EMAIL" "$STAFF_PASSWORD" <<'NODE'
import { createRequire } from "node:module";
import { prisma } from "./apps/api/backend/src/lib/prisma.js";

const require = createRequire(new URL("./apps/api/backend/package.json", import.meta.url));

let bcrypt;
try {
  bcrypt = require("bcrypt");
} catch {
  bcrypt = require("bcryptjs");
}

const email = process.argv[2];
const password = process.argv[3];

const hash = await bcrypt.hash(password, 12);

await prisma.user.upsert({
  where: { email },
  create: {
    email,
    password: hash,
    name: "Staff Permission Audit",
    role: "CONSUMER",
    isActive: true,
  },
  update: {
    password: hash,
    name: "Staff Permission Audit",
    isActive: true,
  },
});

await prisma.$disconnect();
NODE

echo "✅ Staff login user created: $STAFF_EMAIL"

CREATE_VIEWER_PAYLOAD="$(
  node - <<NODE
console.log(JSON.stringify({
  shopId: "$SHOP_ID",
  email: "$STAFF_EMAIL",
  name: "Staff Permission Audit",
  role: "SHOP_VIEWER",
  status: "ACTIVE",
  permissions: ["inventory:read"]
}));
NODE
)"

VIEWER_RESPONSE="$(
  curl -sS -X POST "$API_BASE/staff" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$CREATE_VIEWER_PAYLOAD" \
    | tee "$OUT/create-viewer-staff.json"
)"

STAFF_ID="$(
  echo "$VIEWER_RESPONSE" | node -e '
let s="";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  const j = JSON.parse(s || "{}");
  process.stdout.write(j.id || j.data?.id || "");
});
'
)"

if [ -z "$STAFF_ID" ]; then
  echo "❌ Staff record create failed"
  cat "$OUT/create-viewer-staff.json"
  exit 1
fi

echo "✅ Staff record linked: $STAFF_ID"

STAFF_TOKEN="$(
  curl -sS -X POST "$API_BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$STAFF_EMAIL\",\"password\":\"$STAFF_PASSWORD\"}" \
    | node -e '
let s="";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  const j = JSON.parse(s || "{}");
  process.stdout.write(j.token || j.accessToken || j.data?.token || j.data?.accessToken || "");
});
'
)"

if [ -z "$STAFF_TOKEN" ]; then
  echo "❌ Staff login failed"
  exit 1
fi

echo "✅ Staff login OK"

VIEWER_READ_STATUS="$(
  curl -sS -o "$OUT/viewer-items-mine.json" -w "%{http_code}" \
    "$API_BASE/items/mine" \
    -H "Authorization: Bearer $STAFF_TOKEN"
)"

if [ "$VIEWER_READ_STATUS" != "200" ]; then
  echo "❌ SHOP_VIEWER should read /items/mine. Got $VIEWER_READ_STATUS"
  cat "$OUT/viewer-items-mine.json"
  exit 1
fi

echo "✅ SHOP_VIEWER can read inventory"

VIEWER_CREATE_STATUS="$(
  curl -sS -o "$OUT/viewer-create-item.json" -w "%{http_code}" \
    -X POST "$API_BASE/items" \
    -H "Authorization: Bearer $STAFF_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"pawnShopId\":\"$SHOP_ID\",\"title\":\"Blocked Viewer Item\",\"price\":100,\"category\":\"Electronics\",\"condition\":\"Good\"}"
)"

if [ "$VIEWER_CREATE_STATUS" != "403" ]; then
  echo "❌ SHOP_VIEWER should be blocked from creating inventory. Got $VIEWER_CREATE_STATUS"
  cat "$OUT/viewer-create-item.json"
  exit 1
fi

echo "✅ SHOP_VIEWER cannot create inventory"

UPDATE_TO_INVENTORY='{"role":"INVENTORY_MANAGER","status":"ACTIVE","permissions":["inventory:read","inventory:write","locations:read"]}'

curl -sS -X PATCH "$API_BASE/staff/$STAFF_ID" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$UPDATE_TO_INVENTORY" \
  | tee "$OUT/update-inventory-manager.json" >/dev/null

echo "✅ Staff updated to INVENTORY_MANAGER"

CREATE_STATUS="$(
  curl -sS -o "$OUT/inventory-manager-create-item.json" -w "%{http_code}" \
    -X POST "$API_BASE/items" \
    -H "Authorization: Bearer $STAFF_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"pawnShopId\":\"$SHOP_ID\",\"title\":\"Staff Permission Item $(date +%s)\",\"price\":100,\"category\":\"Electronics\",\"condition\":\"Good\"}"
)"

if [ "$CREATE_STATUS" != "201" ]; then
  echo "❌ INVENTORY_MANAGER should create inventory. Got $CREATE_STATUS"
  cat "$OUT/inventory-manager-create-item.json"
  exit 1
fi

ITEM_ID="$(
  node - "$OUT/inventory-manager-create-item.json" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const j = JSON.parse(fs.readFileSync(file, "utf8") || "{}");
process.stdout.write(j.id || j.data?.id || j.item?.id || "");
NODE
)"

if [ -z "$ITEM_ID" ]; then
  echo "❌ Created item id missing"
  cat "$OUT/inventory-manager-create-item.json"
  exit 1
fi

echo "✅ INVENTORY_MANAGER created inventory item: $ITEM_ID"

UPDATE_STATUS="$(
  curl -sS -o "$OUT/inventory-manager-update-item.json" -w "%{http_code}" \
    -X PUT "$API_BASE/items/$ITEM_ID" \
    -H "Authorization: Bearer $STAFF_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"title":"Staff Permission Item Updated","price":125,"category":"Electronics","condition":"Good"}'
)"

if [ "$UPDATE_STATUS" != "200" ]; then
  echo "❌ INVENTORY_MANAGER should update inventory. Got $UPDATE_STATUS"
  cat "$OUT/inventory-manager-update-item.json"
  exit 1
fi

echo "✅ INVENTORY_MANAGER updated inventory item"

STAFF_CREATE_STATUS="$(
  curl -sS -o "$OUT/inventory-manager-create-staff.json" -w "%{http_code}" \
    -X POST "$API_BASE/staff" \
    -H "Authorization: Bearer $STAFF_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"shopId\":\"$SHOP_ID\",\"email\":\"blocked.staff.$(date +%s)@pawn.local\",\"role\":\"SHOP_VIEWER\",\"permissions\":[\"inventory:read\"]}"
)"

if [ "$STAFF_CREATE_STATUS" != "403" ]; then
  echo "❌ INVENTORY_MANAGER should not manage staff. Got $STAFF_CREATE_STATUS"
  cat "$OUT/inventory-manager-create-staff.json"
  exit 1
fi

echo "✅ INVENTORY_MANAGER cannot manage staff"

curl -sS -X DELETE "$API_BASE/staff/$STAFF_ID" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  | tee "$OUT/archive-staff.json" >/dev/null

echo "✅ Staff record archived"

echo ""
echo "✅ STAFF PERMISSION ENFORCEMENT V1 AUDIT PASSED"
echo "Report folder:"
echo "$OUT"
