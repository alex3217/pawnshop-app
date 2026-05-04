#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

TS="$(date +%Y%m%d-%H%M%S)"
OUT="reports/auction-bid-e2e-$TS"
mkdir -p "$OUT"

API_BASE="${API_BASE:-http://127.0.0.1:6002/api}"
WEB_BASE="${WEB_BASE:-http://127.0.0.1:5176}"
BUYER_EMAIL="${BUYER_EMAIL:-buyer@pawn.local}"
BUYER_PASSWORD="${BUYER_PASSWORD:-Buyer123!}"
OWNER_EMAIL="${OWNER_EMAIL:-owner1@pawn.local}"
OWNER_PASSWORD="${OWNER_PASSWORD:-Owner123!}"

echo "===== AUCTION BID E2E AUDIT ====="
echo "Repo: $ROOT"
echo "Report: $OUT"
echo "API_BASE: $API_BASE"
echo "WEB_BASE: $WEB_BASE"

node - "$API_BASE" "$WEB_BASE" "$BUYER_EMAIL" "$BUYER_PASSWORD" "$OWNER_EMAIL" "$OWNER_PASSWORD" "$OUT" <<'NODE'
const [apiBase, webBase, buyerEmail, buyerPassword, ownerEmail, ownerPassword, outDir] =
  process.argv.slice(2);

const fs = require("fs");

function write(name, data) {
  fs.writeFileSync(
    `${outDir}/${name}`,
    typeof data === "string" ? data : JSON.stringify(data, null, 2),
  );
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
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
  let payload = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!res.ok) {
    const err = new Error(`${method} ${path} failed with ${res.status}`);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }

  return payload;
}

function extractToken(payload) {
  return (
    payload?.token ||
    payload?.accessToken ||
    payload?.data?.token ||
    payload?.data?.accessToken ||
    ""
  );
}

function listFrom(payload, keys = []) {
  if (Array.isArray(payload)) return payload;
  if (!isObject(payload)) return [];

  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key];
  }

  if (isObject(payload.data)) {
    for (const key of keys) {
      if (Array.isArray(payload.data[key])) return payload.data[key];
    }
    if (Array.isArray(payload.data)) return payload.data;
  }

  if (Array.isArray(payload.rows)) return payload.rows;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.data)) return payload.data;

  return [];
}

function unwrap(payload, keys = []) {
  if (!payload) return null;

  if (isObject(payload.data)) {
    for (const key of keys) {
      if (isObject(payload.data[key])) return payload.data[key];
    }
    if (payload.data.id) return payload.data;
  }

  for (const key of keys) {
    if (isObject(payload[key])) return payload[key];
  }

  if (payload.id) return payload;

  return payload;
}

async function main() {
  console.log("1. Health check");
  const health = await request("GET", "/health", { auth: false });
  write("01-health.json", health);
  console.log("✅ Backend health OK");

  console.log("2. Login owner and buyer");
  const ownerLogin = await request("POST", "/auth/login", {
    auth: false,
    body: { email: ownerEmail, password: ownerPassword },
  });
  const buyerLogin = await request("POST", "/auth/login", {
    auth: false,
    body: { email: buyerEmail, password: buyerPassword },
  });

  const ownerToken = extractToken(ownerLogin);
  const buyerToken = extractToken(buyerLogin);

  write("02-owner-login.json", ownerLogin);
  write("03-buyer-login.json", buyerLogin);

  if (!ownerToken) throw new Error("Owner token missing");
  if (!buyerToken) throw new Error("Buyer token missing");

  console.log("✅ Owner and buyer login OK");

  console.log("3. Load owner shops");
  const shopsPayload = await request("GET", "/shops/mine", { token: ownerToken });
  write("04-owner-shops.json", shopsPayload);

  const shops = listFrom(shopsPayload, ["shops", "rows", "items", "data"]);
  const shop = shops[0];

  if (!shop?.id) {
    throw new Error("Owner has no shop. Create an owner shop before auction E2E.");
  }

  console.log(`✅ Using shop: ${shop.name || shop.id}`);

  console.log("4. Create test item");
  const suffix = Date.now();
  const itemPayload = await request("POST", "/items", {
    token: ownerToken,
    body: {
      pawnShopId: shop.id,
      title: `Auction E2E Test Item ${suffix}`,
      description: "Created by scripts/check-auction-bid-e2e.sh",
      price: 125,
      images: [],
      category: "Electronics",
      condition: "Good",
    },
  });

  write("05-created-item.json", itemPayload);
  const item = unwrap(itemPayload, ["item"]);
  if (!item?.id) throw new Error("Created item id missing");

  console.log(`✅ Created item: ${item.id}`);

  console.log("5. Create live auction");
  const now = Date.now();
  const startsAt = new Date(now - 60_000).toISOString();
  const endsAt = new Date(now + 30 * 60_000).toISOString();

  const auctionPayload = await request("POST", "/auctions", {
    token: ownerToken,
    body: {
      itemId: item.id,
      shopId: shop.id,
      startingPrice: 100,
      minIncrement: 10,
      startsAt,
      endsAt,
    },
  });

  write("06-created-auction.json", auctionPayload);
  const auction = unwrap(auctionPayload, ["auction"]);
  if (!auction?.id) throw new Error("Created auction id missing");

  console.log(`✅ Created auction: ${auction.id}`);

  console.log("6. Confirm public auction detail");
  const beforeBid = await request("GET", `/auctions/${encodeURIComponent(auction.id)}`, {
    auth: false,
  });
  write("07-auction-before-bid.json", beforeBid);

  const before = unwrap(beforeBid, ["auction"]);
  const current = Number(before?.currentPrice ?? before?.startingPrice ?? before?.startPrice ?? 100);
  const increment = Number(before?.minIncrement ?? 10);
  const bidAmount = current + increment;

  console.log(`✅ Auction current=${current}, increment=${increment}, bid=${bidAmount}`);

  console.log("7. Place buyer bid");
  const bidPayload = await request(
    "POST",
    `/auctions/${encodeURIComponent(auction.id)}/bids`,
    {
      token: buyerToken,
      body: { amount: bidAmount },
    },
  );

  write("08-bid-response.json", bidPayload);
  console.log("✅ Buyer bid accepted");

  console.log("8. Confirm auction updated");
  const afterBid = await request("GET", `/auctions/${encodeURIComponent(auction.id)}`, {
    auth: false,
  });
  write("09-auction-after-bid.json", afterBid);

  const after = unwrap(afterBid, ["auction"]);
  const afterPrice = Number(after?.currentPrice ?? 0);

  if (!(afterPrice >= bidAmount)) {
    throw new Error(`Auction currentPrice did not update. expected >= ${bidAmount}, got ${afterPrice}`);
  }

  console.log(`✅ Auction currentPrice updated to ${afterPrice}`);

  console.log("9. Confirm buyer my bids contains auction");
  const myBidsPayload = await request("GET", "/bids/mine", { token: buyerToken });
  write("10-buyer-my-bids.json", myBidsPayload);

  const myBids = listFrom(myBidsPayload, ["bids", "rows", "items", "data"]);
  const hasBid = JSON.stringify(myBidsPayload).includes(auction.id);

  if (!hasBid) {
    throw new Error("Buyer /bids/mine does not include new auction bid");
  }

  console.log(`✅ Buyer /bids/mine includes new bid. Bid records visible: ${myBids.length}`);

  console.log("10. Confirm owner auction view");
  const ownerAuctions = await request("GET", "/auctions/mine", { token: ownerToken });
  write("11-owner-auctions.json", ownerAuctions);

  if (!JSON.stringify(ownerAuctions).includes(auction.id)) {
    throw new Error("Owner /auctions/mine does not include new auction");
  }

  console.log("✅ Owner /auctions/mine includes auction");

  console.log("11. Confirm frontend routes load");
  const frontendRoutes = [
    "/auctions",
    `/auctions/${auction.id}`,
    "/my-bids",
    "/owner/auctions",
  ];

  const frontendResults = [];

  for (const route of frontendRoutes) {
    const res = await fetch(`${webBase}${route}`);
    frontendResults.push({ route, status: res.status });
    if (!(String(res.status).startsWith("2") || String(res.status).startsWith("3"))) {
      throw new Error(`Frontend route ${route} failed with ${res.status}`);
    }
  }

  write("12-frontend-routes.json", frontendResults);
  console.log("✅ Frontend auction routes reachable");

  const summary = {
    success: true,
    shopId: shop.id,
    itemId: item.id,
    auctionId: auction.id,
    bidAmount,
    currentPriceAfterBid: afterPrice,
    reportDir: outDir,
  };

  write("SUMMARY.json", summary);

  console.log("");
  console.log("===== AUCTION BID E2E PASSED =====");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error("");
  console.error("===== AUCTION BID E2E FAILED =====");
  console.error(err.message);
  if (err.status) console.error("HTTP status:", err.status);
  if (err.payload) console.error(JSON.stringify(err.payload, null, 2));
  process.exit(1);
});
NODE

echo ""
echo "Report folder:"
echo "$OUT"
