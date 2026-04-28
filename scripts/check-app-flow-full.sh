#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:6002/api}"

BUYER_EMAIL="${BUYER_EMAIL:-buyer@pawn.local}"
BUYER_PASSWORD="${BUYER_PASSWORD:-Buyer123!}"

OWNER_EMAIL="${OWNER_EMAIL:-owner1@pawn.local}"
OWNER_PASSWORD="${OWNER_PASSWORD:-Owner123!}"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

LAST_BODY="$TMP_DIR/last-body.json"

log() {
  printf '\n%s\n' "$1" >&2
}

pass() {
  printf '✅ %s\n' "$1" >&2
}

request() {
  local method="$1"
  local path="$2"
  local token="${3:-}"
  local body="${4:-}"
  local url="${API_BASE}${path}"
  local status

  if [ -n "$body" ]; then
    status="$(
      curl -sS -o "$LAST_BODY" -w "%{http_code}" \
        -X "$method" "$url" \
        -H "Content-Type: application/json" \
        ${token:+-H "Authorization: Bearer $token"} \
        --data "$body"
    )"
  else
    status="$(
      curl -sS -o "$LAST_BODY" -w "%{http_code}" \
        -X "$method" "$url" \
        ${token:+-H "Authorization: Bearer $token"}
    )"
  fi

  if [[ "$status" != 2* ]]; then
    printf '\nRequest failed: %s %s\nHTTP %s\n' "$method" "$url" "$status" >&2
    printf 'Response body:\n' >&2
    if [ -s "$LAST_BODY" ]; then
      cat "$LAST_BODY" >&2 || true
    else
      printf '<empty body>' >&2
    fi
    printf '\n' >&2
    exit 1
  fi
}

login_body() {
  EMAIL="$1" PASS="$2" node -e '
    process.stdout.write(JSON.stringify({
      email: process.env.EMAIL,
      password: process.env.PASS
    }))
  '
}

extract_token() {
  node -e '
    let input = "";
    process.stdin.on("data", (chunk) => input += chunk);
    process.stdin.on("end", () => {
      const json = JSON.parse(input || "{}");
      process.stdout.write(
        json.token ||
        json.accessToken ||
        json.data?.token ||
        json.data?.accessToken ||
        ""
      );
    });
  '
}

json_get() {
  local expr="$1"
  node -e "
    const fs = require('fs');
    const json = JSON.parse(fs.readFileSync('$LAST_BODY', 'utf8') || '{}');
    const value = $expr;
    process.stdout.write(value == null ? '' : String(value));
  "
}

login() {
  local label="$1"
  local email="$2"
  local password="$3"
  local body
  local token

  body="$(login_body "$email" "$password")"
  request POST "/auth/login" "" "$body"
  token="$(cat "$LAST_BODY" | extract_token)"

  if [ -z "$token" ]; then
    printf 'Login failed for %s: no token returned\n' "$label" >&2
    cat "$LAST_BODY" >&2 || true
    exit 1
  fi

  pass "$label login"
  printf '%s' "$token"
}

log "Logging in..."
BUYER_TOKEN="$(login "Buyer" "$BUYER_EMAIL" "$BUYER_PASSWORD")"
OWNER_TOKEN="$(login "Owner" "$OWNER_EMAIL" "$OWNER_PASSWORD")"

log "Finding owner shop..."
request GET "/shops/mine" "$OWNER_TOKEN"
SHOP_ID="$(json_get "Array.isArray(json) ? json[0]?.id : (json.rows?.[0]?.id || json.shops?.[0]?.id || json.data?.[0]?.id || json.data?.shops?.[0]?.id)")"

if [ -z "$SHOP_ID" ]; then
  printf 'No owner shop found for %s\n' "$OWNER_EMAIL" >&2
  cat "$LAST_BODY" >&2 || true
  exit 1
fi

pass "Owner shop found: $SHOP_ID"

STAMP="$(date +%s)"
ITEM_TITLE="Full Flow Test Item ${STAMP}"

log "Creating item..."
ITEM_BODY="$(
  TITLE="$ITEM_TITLE" SHOP_ID="$SHOP_ID" node -e '
    process.stdout.write(JSON.stringify({
      pawnShopId: process.env.SHOP_ID,
      title: process.env.TITLE,
      description: "Created by check:app-flow-full",
      price: 125,
      category: "Electronics",
      condition: "Good",
      images: []
    }))
  '
)"

request POST "/items" "$OWNER_TOKEN" "$ITEM_BODY"
ITEM_ID="$(json_get "json.id || json.item?.id || json.data?.id || json.data?.item?.id")"

if [ -z "$ITEM_ID" ]; then
  printf 'Item creation response did not include item id\n' >&2
  cat "$LAST_BODY" >&2 || true
  exit 1
fi

pass "Item created: $ITEM_ID"

log "Creating auction..."
STARTS_AT="$(node -e 'console.log(new Date(Date.now() - 60_000).toISOString())')"
ENDS_AT="$(node -e 'console.log(new Date(Date.now() + 60 * 60_000).toISOString())')"

AUCTION_BODY="$(
  ITEM_ID="$ITEM_ID" SHOP_ID="$SHOP_ID" STARTS_AT="$STARTS_AT" ENDS_AT="$ENDS_AT" node -e '
    process.stdout.write(JSON.stringify({
      itemId: process.env.ITEM_ID,
      shopId: process.env.SHOP_ID,
      startingPrice: 100,
      minIncrement: 10,
      startsAt: process.env.STARTS_AT,
      endsAt: process.env.ENDS_AT,
      status: "LIVE"
    }))
  '
)"

request POST "/auctions" "$OWNER_TOKEN" "$AUCTION_BODY"
AUCTION_ID="$(json_get "json.id || json.auction?.id || json.data?.id || json.data?.auction?.id")"

if [ -z "$AUCTION_ID" ]; then
  printf 'Auction creation response did not include auction id\n' >&2
  cat "$LAST_BODY" >&2 || true
  exit 1
fi

pass "Auction created: $AUCTION_ID"

log "Buyer placing bid..."
BID_BODY='{"amount":110}'
request POST "/auctions/${AUCTION_ID}/bids" "$BUYER_TOKEN" "$BID_BODY"
pass "Bid placed"

log "Owner ending auction..."
request POST "/auctions/${AUCTION_ID}/end" "$OWNER_TOKEN"
SETTLEMENT_ID="$(json_get "json.settlement?.id || json.data?.settlement?.id")"

if [ -z "$SETTLEMENT_ID" ]; then
  printf 'End auction response did not include settlement id\n' >&2
  cat "$LAST_BODY" >&2 || true
  exit 1
fi

pass "Auction ended and settlement created: $SETTLEMENT_ID"

log "Verifying buyer settlements..."
request GET "/settlements/mine" "$BUYER_TOKEN"

FOUND_SETTLEMENT="$(
  AUCTION_ID="$AUCTION_ID" node -e "
    const fs = require('fs');
    const json = JSON.parse(fs.readFileSync('$LAST_BODY', 'utf8') || '[]');
    const rows = Array.isArray(json) ? json : (json.rows || json.settlements || json.data || []);
    const found = rows.find((row) => row.auctionId === process.env.AUCTION_ID);
    process.stdout.write(found?.id || '');
  "
)"

if [ -z "$FOUND_SETTLEMENT" ]; then
  printf 'Buyer settlements did not include auction settlement %s\n' "$AUCTION_ID" >&2
  cat "$LAST_BODY" >&2 || true
  exit 1
fi

pass "Buyer sees settlement/win: $FOUND_SETTLEMENT"

log "Full app flow smoke test completed."
pass "check:app-flow-full passed"
