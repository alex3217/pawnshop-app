#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

TS="$(date +%Y%m%d-%H%M%S)"
OUT="reports/settlement-payment-audit-$TS"
mkdir -p "$OUT"

API_BASE="${API_BASE:-http://127.0.0.1:6002/api}"
WEB_BASE="${WEB_BASE:-http://127.0.0.1:5176}"

BUYER_EMAIL="${BUYER_EMAIL:-buyer@pawn.local}"
BUYER_PASSWORD="${BUYER_PASSWORD:-Buyer123!}"

ADMIN_EMAIL="${ADMIN_EMAIL:-admin1@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin123}"

SUPER_ADMIN_EMAIL="${SUPER_ADMIN_EMAIL:-superadmin@pawn.local}"
SUPER_ADMIN_PASSWORD="${SUPER_ADMIN_PASSWORD:-SuperAdmin123!}"

echo "===== SETTLEMENT / PAYMENT AUDIT ====="
echo "Repo: $ROOT"
echo "Report: $OUT"
echo "API_BASE: $API_BASE"
echo "WEB_BASE: $WEB_BASE"

node - "$API_BASE" "$WEB_BASE" "$BUYER_EMAIL" "$BUYER_PASSWORD" "$ADMIN_EMAIL" "$ADMIN_PASSWORD" "$SUPER_ADMIN_EMAIL" "$SUPER_ADMIN_PASSWORD" "$OUT" <<'NODE'
const [
  apiBase,
  webBase,
  buyerEmail,
  buyerPassword,
  adminEmail,
  adminPassword,
  superAdminEmail,
  superAdminPassword,
  outDir,
] = process.argv.slice(2);

const fs = require("fs");

function write(name, data) {
  fs.writeFileSync(`${outDir}/${name}`, JSON.stringify(data, null, 2));
}

async function request(method, path, { token, body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  return {
    ok: res.ok,
    status: res.status,
    path,
    payload,
  };
}

function tokenFrom(payload) {
  return (
    payload?.token ||
    payload?.accessToken ||
    payload?.data?.token ||
    payload?.data?.accessToken ||
    ""
  );
}

function listFrom(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.settlements)) return payload.settlements;
  if (Array.isArray(payload?.data?.settlements)) return payload.data.settlements;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

async function login(label, email, password) {
  const result = await request("POST", "/auth/login", {
    auth: false,
    body: { email, password },
  });

  write(`login-${label}.json`, result);

  if (!result.ok) {
    throw new Error(`${label} login failed with ${result.status}`);
  }

  const token = tokenFrom(result.payload);
  if (!token) {
    throw new Error(`${label} login did not return token`);
  }

  console.log(`✅ ${label} login OK`);
  return token;
}

async function assert2xx(label, method, path, token, fileName) {
  const result = await request(method, path, { token });
  write(fileName, result);

  if (!result.ok) {
    throw new Error(`${label} failed: ${method} ${path} returned ${result.status}`);
  }

  console.log(`✅ ${label}: ${result.status} ${path}`);
  return result.payload;
}

async function main() {
  console.log("1. Health");
  const health = await request("GET", "/health", { auth: false });
  write("01-health.json", health);
  if (!health.ok) throw new Error(`Health failed ${health.status}`);
  console.log("✅ Backend health OK");

  console.log("2. Login roles");
  const buyerToken = await login("buyer", buyerEmail, buyerPassword);
  const adminToken = await login("admin", adminEmail, adminPassword);
  const superAdminToken = await login("super-admin", superAdminEmail, superAdminPassword);

  console.log("3. Buyer settlement/win surfaces");
  const buyerSettlementsPayload = await assert2xx(
    "Buyer settlements",
    "GET",
    "/settlements/mine",
    buyerToken,
    "10-buyer-settlements.json",
  );

  const buyerSettlements = listFrom(buyerSettlementsPayload);
  const charged = buyerSettlements.filter((s) => String(s.status).toUpperCase() === "CHARGED");
  const pending = buyerSettlements.filter((s) => String(s.status).toUpperCase() === "PENDING");
  const withPi = buyerSettlements.filter((s) => s.stripePaymentIntent);

  console.log(`✅ Buyer settlements count: ${buyerSettlements.length}`);
  console.log(`✅ Buyer pending settlements: ${pending.length}`);
  console.log(`✅ Buyer charged settlements: ${charged.length}`);
  console.log(`✅ Buyer settlements with payment intents: ${withPi.length}`);

  const myWins = await request("GET", "/my-wins", { token: buyerToken });
  write("11-buyer-my-wins-direct.json", myWins);

  const settlementsWinsAlias = await request("GET", "/settlements/mine", { token: buyerToken });
  write("12-buyer-wins-alias-source.json", settlementsWinsAlias);

  console.log(`ℹ️ /my-wins direct status: ${myWins.status}`);

  console.log("4. Admin settlement surfaces");
  const adminSettlementsPayload = await assert2xx(
    "Admin settlements",
    "GET",
    "/settlements",
    adminToken,
    "20-admin-settlements.json",
  );

  const adminSettlements = listFrom(adminSettlementsPayload);
  console.log(`✅ Admin settlements count: ${adminSettlements.length}`);

  console.log("5. Super Admin settlement/revenue surfaces");
  const superSettlementsPayload = await assert2xx(
    "Super Admin settlements",
    "GET",
    "/super-admin/settlements",
    superAdminToken,
    "30-super-admin-settlements.json",
  );

  const superRevenuePayload = await assert2xx(
    "Super Admin revenue",
    "GET",
    "/super-admin/revenue",
    superAdminToken,
    "31-super-admin-revenue.json",
  );

  const superSettlements = listFrom(superSettlementsPayload);
  console.log(`✅ Super Admin settlements count: ${superSettlements.length}`);
  console.log("✅ Super Admin revenue reachable");

  console.log("6. Frontend route reachability");
  const frontendRoutes = [
    "/my-wins",
    "/super-admin/settlements",
    "/super-admin/revenue",
    "/admin/revenue",
  ];

  const frontendResults = [];
  for (const route of frontendRoutes) {
    const res = await fetch(`${webBase}${route}`);
    frontendResults.push({ route, status: res.status });
    if (!(String(res.status).startsWith("2") || String(res.status).startsWith("3"))) {
      throw new Error(`Frontend route ${route} failed with ${res.status}`);
    }
    console.log(`✅ Frontend ${route}: ${res.status}`);
  }
  write("40-frontend-routes.json", frontendResults);

  const summary = {
    success: true,
    buyerSettlements: buyerSettlements.length,
    buyerPendingSettlements: pending.length,
    buyerChargedSettlements: charged.length,
    buyerSettlementsWithPaymentIntent: withPi.length,
    adminSettlements: adminSettlements.length,
    superAdminSettlements: superSettlements.length,
    myWinsDirectStatus: myWins.status,
    reportDir: outDir,
  };

  write("SUMMARY.json", summary);

  console.log("");
  console.log("===== SETTLEMENT / PAYMENT AUDIT PASSED =====");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error("");
  console.error("===== SETTLEMENT / PAYMENT AUDIT FAILED =====");
  console.error(err.message);
  process.exit(1);
});
NODE

echo ""
echo "Report folder:"
echo "$OUT"
