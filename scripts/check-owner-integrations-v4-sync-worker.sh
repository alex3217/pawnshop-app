#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

API_BASE="${API_BASE:-http://127.0.0.1:6002/api}"
OWNER_EMAIL="${OWNER_EMAIL:-owner1@pawn.local}"
OWNER_PASSWORD="${OWNER_PASSWORD:-Owner123!}"

OUT="reports/owner-integrations-v4-sync-worker-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"

echo "===== OWNER INTEGRATIONS V4 SYNC WORKER AUDIT ====="
echo "Repo: $ROOT"
echo "API_BASE: $API_BASE"
echo "Report: $OUT"

echo ""
echo "1. Health"
curl -sS "$API_BASE/health" | tee "$OUT/health.json" >/dev/null
echo "✅ Backend health reachable"

echo ""
echo "2. Owner login"
OWNER_TOKEN="$(
  curl -sS -X POST "$API_BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$OWNER_EMAIL\",\"password\":\"$OWNER_PASSWORD\"}" \
    | tee "$OUT/owner-login.json" \
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

echo ""
echo "3. Owner shop"
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
  echo "❌ Owner shop missing"
  exit 1
fi

echo "✅ Owner shop found: $SHOP_ID"

STAMP="$(date +%s)"

echo ""
echo "4. Create API_PULL integration with sample external inventory"
CREATE_PAYLOAD="$(
  node - <<NODE
console.log(JSON.stringify({
  shopId: "$SHOP_ID",
  name: "API Pull Worker Audit $STAMP",
  type: "API_PULL",
  provider: "audit_sample_feed",
  status: "NEEDS_SETUP",
  authType: "NONE",
  syncFrequencyMinutes: 15,
  metadata: {
    sampleItems: [
      {
        externalId: "audit-sku-$STAMP-1",
        title: "API Synced Gold Ring $STAMP",
        description: "Created by owner integrations v4 sync audit",
        price: 199.99,
        category: "Jewelry",
        condition: "Good",
        status: "AVAILABLE"
      },
      {
        externalId: "audit-sku-$STAMP-2",
        title: "API Synced Drill $STAMP",
        description: "Created by owner integrations v4 sync audit",
        price: 89.5,
        category: "Tools",
        condition: "Good",
        status: "AVAILABLE"
      }
    ]
  }
}));
NODE
)"

CREATE_STATUS="$(
  curl -sS -o "$OUT/create-integration.json" -w "%{http_code}" \
    -X POST "$API_BASE/integrations" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$CREATE_PAYLOAD"
)"

if [ "$CREATE_STATUS" != "201" ]; then
  echo "❌ Create integration failed: $CREATE_STATUS"
  cat "$OUT/create-integration.json"
  exit 1
fi

INTEGRATION_ID="$(
  node - "$OUT/create-integration.json" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const j = JSON.parse(fs.readFileSync(file, "utf8") || "{}");
process.stdout.write(j.integration?.id || "");
NODE
)"

if [ -z "$INTEGRATION_ID" ]; then
  echo "❌ Integration id missing"
  cat "$OUT/create-integration.json"
  exit 1
fi

echo "✅ Integration created: $INTEGRATION_ID"

echo ""
echo "5. Run sync worker"
SYNC_STATUS="$(
  curl -sS -o "$OUT/sync.json" -w "%{http_code}" \
    -X POST "$API_BASE/integrations/$INTEGRATION_ID/sync" \
    -H "Authorization: Bearer $OWNER_TOKEN"
)"

if [ "$SYNC_STATUS" != "200" ]; then
  echo "❌ Sync failed: $SYNC_STATUS"
  cat "$OUT/sync.json"
  exit 1
fi

node - "$OUT/sync.json" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const j = JSON.parse(fs.readFileSync(file, "utf8") || "{}");
if (!j.job || j.job.status !== "COMPLETED") {
  console.error("Expected completed job", j);
  process.exit(1);
}
if (Number(j.job.createdCount || 0) < 2) {
  console.error("Expected at least 2 created items", j.job);
  process.exit(1);
}
NODE

echo "✅ Sync worker created inventory items"

echo ""
echo "6. Verify synced items in owner inventory"
ITEMS_STATUS="$(
  curl -sS -o "$OUT/items-mine.json" -w "%{http_code}" \
    "$API_BASE/items/mine" \
    -H "Authorization: Bearer $OWNER_TOKEN"
)"

if [ "$ITEMS_STATUS" != "200" ]; then
  echo "❌ /items/mine failed: $ITEMS_STATUS"
  cat "$OUT/items-mine.json"
  exit 1
fi

node - "$OUT/items-mine.json" "$STAMP" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const stamp = process.argv[3];
const rows = JSON.parse(fs.readFileSync(file, "utf8") || "[]");
const found = rows.filter((item) => String(item.title || "").includes(stamp));
if (found.length < 2) {
  console.error("Expected at least 2 synced items in /items/mine");
  process.exit(1);
}
NODE

echo "✅ Synced items visible in /items/mine"

echo ""
echo "7. Run sync again and verify updates instead of duplicates"
SYNC2_STATUS="$(
  curl -sS -o "$OUT/sync-second.json" -w "%{http_code}" \
    -X POST "$API_BASE/integrations/$INTEGRATION_ID/sync" \
    -H "Authorization: Bearer $OWNER_TOKEN"
)"

if [ "$SYNC2_STATUS" != "200" ]; then
  echo "❌ Second sync failed: $SYNC2_STATUS"
  cat "$OUT/sync-second.json"
  exit 1
fi

node - "$OUT/sync-second.json" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const j = JSON.parse(fs.readFileSync(file, "utf8") || "{}");
if (!j.job || j.job.status !== "COMPLETED") {
  console.error("Expected completed second job", j);
  process.exit(1);
}
if (Number(j.job.updatedCount || 0) < 2) {
  console.error("Expected at least 2 updated items on second sync", j.job);
  process.exit(1);
}
NODE

echo "✅ Second sync updated existing mapped items"

echo ""
echo "8. Archive audit integration"
curl -sS -X DELETE "$API_BASE/integrations/$INTEGRATION_ID" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  | tee "$OUT/archive.json" >/dev/null

echo "✅ Integration archived"

echo ""
echo "✅ OWNER INTEGRATIONS V4 SYNC WORKER AUDIT PASSED"
echo "Report folder:"
echo "$OUT"
