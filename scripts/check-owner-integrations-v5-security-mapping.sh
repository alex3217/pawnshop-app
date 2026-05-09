#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

API_BASE="${API_BASE:-http://127.0.0.1:6002/api}"
OWNER_EMAIL="${OWNER_EMAIL:-owner1@pawn.local}"
OWNER_PASSWORD="${OWNER_PASSWORD:-Owner123!}"

OUT="reports/owner-integrations-v5-security-mapping-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"

echo "===== OWNER INTEGRATIONS V5 SECURITY + MAPPING AUDIT ====="
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
SECRET_VALUE="super-secret-token-$STAMP"

echo ""
echo "3. Create integration with credential and mapped sample fields"
CREATE_PAYLOAD="$(
  node - <<NODE
console.log(JSON.stringify({
  shopId: "$SHOP_ID",
  name: "Secure Mapping Audit $STAMP",
  type: "API_PULL",
  provider: "secure_mapping_audit",
  status: "NEEDS_SETUP",
  authType: "API_KEY",
  apiKey: "$SECRET_VALUE",
  syncFrequencyMinutes: 15,
  metadata: {
    apiKeyValue: "$SECRET_VALUE",
    bearerToken: "$SECRET_VALUE",
    sampleItems: [
      {
        extSku: "mapped-sku-$STAMP-1",
        extTitle: "Mapped Camera $STAMP",
        extPrice: 149.99,
        extCategory: "Electronics",
        extCondition: "Good",
        extStatus: "AVAILABLE"
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

if grep -q "$SECRET_VALUE" "$OUT/create-integration.json"; then
  echo "❌ Secret leaked in create response"
  cat "$OUT/create-integration.json"
  exit 1
fi

echo "✅ Integration created without leaking credential"

echo ""
echo "4. Verify encrypted credential and scrubbed metadata in DB"
DATABASE_URL="$(
  node --env-file=apps/api/backend/.env.development -e 'process.stdout.write(process.env.DATABASE_URL || "")'
)" \
INTEGRATION_ID="$INTEGRATION_ID" \
SECRET_VALUE="$SECRET_VALUE" \
node --input-type=module <<'NODE'
import { prisma } from "./apps/api/backend/src/lib/prisma.js";

const row = await prisma.inventoryIntegration.findUnique({
  where: { id: process.env.INTEGRATION_ID },
});

if (!row) {
  console.error("Integration missing");
  process.exit(1);
}

const serialized = JSON.stringify(row);

if (serialized.includes(process.env.SECRET_VALUE)) {
  console.error("Secret leaked in database row");
  process.exit(1);
}

if (!row.encryptedCredentials?.ciphertext) {
  console.error("encryptedCredentials missing ciphertext");
  process.exit(1);
}

if (row.metadata?.apiKeyValue || row.metadata?.bearerToken) {
  console.error("metadata still contains credential-like values");
  process.exit(1);
}

await prisma.$disconnect();
NODE

echo "✅ Credential encrypted and metadata scrubbed"

echo ""
echo "5. Create field mappings"
DATABASE_URL="$(
  node --env-file=apps/api/backend/.env.development -e 'process.stdout.write(process.env.DATABASE_URL || "")'
)" \
INTEGRATION_ID="$INTEGRATION_ID" \
node --input-type=module <<'NODE'
import { prisma } from "./apps/api/backend/src/lib/prisma.js";

const rows = [
  ["extSku", "externalId"],
  ["extTitle", "title"],
  ["extPrice", "price"],
  ["extCategory", "category"],
  ["extCondition", "condition"],
  ["extStatus", "status"],
];

for (const [externalField, internalField] of rows) {
  await prisma.inventoryFieldMapping.upsert({
    where: {
      integrationId_externalField_internalField: {
        integrationId: process.env.INTEGRATION_ID,
        externalField,
        internalField,
      },
    },
    create: {
      integrationId: process.env.INTEGRATION_ID,
      externalField,
      internalField,
    },
    update: {},
  });
}

await prisma.$disconnect();
NODE

echo "✅ Field mappings created"

echo ""
echo "6. Run mapped sync"
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
  console.error("Expected completed sync job", j);
  process.exit(1);
}
if (Number(j.job.createdCount || 0) < 1) {
  console.error("Expected mapped item to be created", j.job);
  process.exit(1);
}
NODE

echo "✅ Mapped sync created item"

echo ""
echo "7. Verify mapped item in inventory"
curl -sS "$API_BASE/items/mine" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  | tee "$OUT/items-mine.json" >/dev/null

node - "$OUT/items-mine.json" "$STAMP" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const stamp = process.argv[3];
const rows = JSON.parse(fs.readFileSync(file, "utf8") || "[]");
const found = rows.find((item) => String(item.title || "").includes(`Mapped Camera ${stamp}`));
if (!found) {
  console.error("Mapped synced item not found");
  process.exit(1);
}
NODE

echo "✅ Mapped item visible in owner inventory"

echo ""
echo "8. Archive audit integration"
curl -sS -X DELETE "$API_BASE/integrations/$INTEGRATION_ID" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  | tee "$OUT/archive.json" >/dev/null

echo "✅ Integration archived"

echo ""
echo "✅ OWNER INTEGRATIONS V5 SECURITY + MAPPING AUDIT PASSED"
echo "Report folder:"
echo "$OUT"
