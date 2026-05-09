#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

API_BASE="${API_BASE:-http://127.0.0.1:6002/api}"
OWNER_EMAIL="${OWNER_EMAIL:-owner1@pawn.local}"
OWNER_PASSWORD="${OWNER_PASSWORD:-Owner123!}"

OUT="reports/owner-integrations-v2-backend-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"

echo "===== OWNER INTEGRATIONS V2 BACKEND AUDIT ====="
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

echo ""
echo "4. Create integration"
CREATE_PAYLOAD="$(
  node - <<NODE
console.log(JSON.stringify({
  shopId: "$SHOP_ID",
  name: "CSV Import Connector Audit",
  type: "CSV_UPLOAD",
  provider: "internal_csv",
  status: "NEEDS_SETUP",
  authType: "NONE",
  metadata: {
    audit: true,
    source: "check-owner-integrations-v2-backend"
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
process.stdout.write(j.integration?.id || j.data?.integration?.id || "");
NODE
)"

if [ -z "$INTEGRATION_ID" ]; then
  echo "❌ Integration id missing"
  cat "$OUT/create-integration.json"
  exit 1
fi

echo "✅ Integration created: $INTEGRATION_ID"

echo ""
echo "5. List integrations"
LIST_STATUS="$(
  curl -sS -o "$OUT/list-integrations.json" -w "%{http_code}" \
    "$API_BASE/integrations/mine" \
    -H "Authorization: Bearer $OWNER_TOKEN"
)"

if [ "$LIST_STATUS" != "200" ]; then
  echo "❌ List integrations failed: $LIST_STATUS"
  cat "$OUT/list-integrations.json"
  exit 1
fi

node - "$OUT/list-integrations.json" "$INTEGRATION_ID" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const id = process.argv[3];
const j = JSON.parse(fs.readFileSync(file, "utf8") || "{}");
const rows = Array.isArray(j.integrations) ? j.integrations : [];
if (!rows.some((row) => row.id === id)) {
  console.error("Created integration missing from /integrations/mine");
  process.exit(1);
}
NODE

echo "✅ Integration appears in mine list"

echo ""
echo "6. Test integration"
TEST_STATUS="$(
  curl -sS -o "$OUT/test-integration.json" -w "%{http_code}" \
    -X POST "$API_BASE/integrations/$INTEGRATION_ID/test" \
    -H "Authorization: Bearer $OWNER_TOKEN"
)"

if [ "$TEST_STATUS" != "200" ]; then
  echo "❌ Test integration failed: $TEST_STATUS"
  cat "$OUT/test-integration.json"
  exit 1
fi

echo "✅ Integration test endpoint passed"

echo ""
echo "7. Sync integration"
SYNC_STATUS="$(
  curl -sS -o "$OUT/sync-integration.json" -w "%{http_code}" \
    -X POST "$API_BASE/integrations/$INTEGRATION_ID/sync" \
    -H "Authorization: Bearer $OWNER_TOKEN"
)"

if [ "$SYNC_STATUS" != "200" ]; then
  echo "❌ Sync integration failed: $SYNC_STATUS"
  cat "$OUT/sync-integration.json"
  exit 1
fi

echo "✅ Integration sync endpoint passed"

echo ""
echo "8. Jobs/logs"
for path in jobs logs; do
  STATUS="$(
    curl -sS -o "$OUT/integration-$path.json" -w "%{http_code}" \
      "$API_BASE/integrations/$INTEGRATION_ID/$path" \
      -H "Authorization: Bearer $OWNER_TOKEN"
  )"

  if [ "$STATUS" != "200" ]; then
    echo "❌ Integration $path failed: $STATUS"
    cat "$OUT/integration-$path.json"
    exit 1
  fi

  echo "✅ Integration $path reachable"
done

echo ""
echo "9. Archive integration"
DELETE_STATUS="$(
  curl -sS -o "$OUT/delete-integration.json" -w "%{http_code}" \
    -X DELETE "$API_BASE/integrations/$INTEGRATION_ID" \
    -H "Authorization: Bearer $OWNER_TOKEN"
)"

if [ "$DELETE_STATUS" != "200" ]; then
  echo "❌ Delete/archive integration failed: $DELETE_STATUS"
  cat "$OUT/delete-integration.json"
  exit 1
fi

echo "✅ Integration archived"

echo ""
echo "✅ OWNER INTEGRATIONS V2 BACKEND AUDIT PASSED"
echo "Report folder:"
echo "$OUT"
