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
PAYLOAD_FILE="$TMP_DIR/stripe-event.json"
SIGNATURE_FILE="$TMP_DIR/stripe-signature.txt"

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
  local token

  request POST "/auth/login" "" "$(EMAIL="$email" PASS="$password" node -e '
    process.stdout.write(JSON.stringify({
      email: process.env.EMAIL,
      password: process.env.PASS
    }))
  ')"

  token="$(
    node -e "
      const fs = require('fs');
      const json = JSON.parse(fs.readFileSync('$LAST_BODY', 'utf8') || '{}');
      process.stdout.write(json.token || json.accessToken || json.data?.token || json.data?.accessToken || '');
    "
  )"

  if [ -z "$token" ]; then
    printf 'Login failed for %s: no token returned\n' "$label" >&2
    cat "$LAST_BODY" >&2 || true
    exit 1
  fi

  pass "$label login"
  printf '%s' "$token"
}

log "Checking webhook secret availability..."
node --env-file=apps/api/backend/.env.development - <<'NODE'
const secret = process.env.STRIPE_WEBHOOK_SECRET || "";
if (!secret || secret.includes("REPLACE_ME")) {
  console.error("STRIPE_WEBHOOK_SECRET is missing or still a placeholder.");
  process.exit(1);
}
console.log("STRIPE_WEBHOOK_SECRET usable:", true);
NODE

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
ITEM_TITLE="Webhook Payment Test Item ${STAMP}"

log "Creating item..."
ITEM_BODY="$(
  TITLE="$ITEM_TITLE" SHOP_ID="$SHOP_ID" node -e '
    process.stdout.write(JSON.stringify({
      pawnShopId: process.env.SHOP_ID,
      title: process.env.TITLE,
      description: "Created by check-payment-webhook",
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
request POST "/auctions/${AUCTION_ID}/bids" "$BUYER_TOKEN" '{"amount":110}'
pass "Bid placed"

log "Owner ending auction..."
request POST "/auctions/${AUCTION_ID}/end" "$OWNER_TOKEN"
SETTLEMENT_ID="$(json_get "json.settlement?.id || json.data?.settlement?.id")"

if [ -z "$SETTLEMENT_ID" ]; then
  printf 'End auction response did not include settlement id\n' >&2
  cat "$LAST_BODY" >&2 || true
  exit 1
fi

pass "Settlement created: $SETTLEMENT_ID"

log "Creating settlement PaymentIntent..."
request POST "/stripe/payment-intents/settlements/${SETTLEMENT_ID}" "$BUYER_TOKEN" '{}'

PAYMENT_INTENT_ID="$(json_get "json.paymentIntentId || json.data?.paymentIntentId || ''")"
CLIENT_SECRET="$(json_get "json.clientSecret || json.data?.clientSecret || ''")"

if [ -z "$PAYMENT_INTENT_ID" ] || [ -z "$CLIENT_SECRET" ]; then
  printf 'PaymentIntent response missing paymentIntentId or clientSecret\n' >&2
  cat "$LAST_BODY" >&2 || true
  exit 1
fi

pass "PaymentIntent created: $PAYMENT_INTENT_ID"

log "Creating signed Stripe payment_intent.succeeded webhook payload..."
PAYLOAD_FILE="$PAYLOAD_FILE" SIGNATURE_FILE="$SIGNATURE_FILE" PAYMENT_INTENT_ID="$PAYMENT_INTENT_ID" SETTLEMENT_ID="$SETTLEMENT_ID" node --env-file=apps/api/backend/.env.development <<'NODE'
const fs = require("fs");
const crypto = require("crypto");

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
if (!webhookSecret || webhookSecret.includes("REPLACE_ME")) {
  console.error("STRIPE_WEBHOOK_SECRET is missing or still a placeholder.");
  process.exit(1);
}

const payload = JSON.stringify({
  id: `evt_local_${Date.now()}`,
  object: "event",
  api_version: "2024-06-20",
  created: Math.floor(Date.now() / 1000),
  type: "payment_intent.succeeded",
  data: {
    object: {
      id: process.env.PAYMENT_INTENT_ID,
      object: "payment_intent",
      metadata: {
        settlementId: process.env.SETTLEMENT_ID,
      },
    },
  },
});

const timestamp = Math.floor(Date.now() / 1000);
const signedPayload = `${timestamp}.${payload}`;
const digest = crypto
  .createHmac("sha256", webhookSecret)
  .update(signedPayload, "utf8")
  .digest("hex");

const signature = `t=${timestamp},v1=${digest}`;

fs.writeFileSync(process.env.PAYLOAD_FILE, payload);
fs.writeFileSync(process.env.SIGNATURE_FILE, signature);
NODE

SIGNATURE="$(cat "$SIGNATURE_FILE")"

log "Posting signed webhook to local API..."
WEBHOOK_STATUS="$(
  curl -sS -o "$LAST_BODY" -w "%{http_code}" \
    -X POST "${API_BASE%/api}/api/webhooks/stripe" \
    -H "Content-Type: application/json" \
    -H "stripe-signature: $SIGNATURE" \
    --data-binary @"$PAYLOAD_FILE"
)"

if [[ "$WEBHOOK_STATUS" != 2* ]]; then
  printf 'Webhook failed with HTTP %s\n' "$WEBHOOK_STATUS" >&2
  cat "$LAST_BODY" >&2 || true
  exit 1
fi

pass "Signed webhook accepted"

log "Verifying settlement status changed to CHARGED..."
request GET "/settlements/mine" "$BUYER_TOKEN"

SETTLEMENT_STATUS="$(
  SETTLEMENT_ID="$SETTLEMENT_ID" node -e "
    const fs = require('fs');
    const json = JSON.parse(fs.readFileSync('$LAST_BODY', 'utf8') || '[]');
    const rows = Array.isArray(json) ? json : (json.rows || json.settlements || json.data || []);
    const found = rows.find((row) => row.id === process.env.SETTLEMENT_ID || row.settlementId === process.env.SETTLEMENT_ID);
    process.stdout.write(String(found?.status || ''));
  "
)"

if [ "$SETTLEMENT_STATUS" != "CHARGED" ]; then
  printf 'Expected settlement status CHARGED, got %s\n' "$SETTLEMENT_STATUS" >&2
  cat "$LAST_BODY" >&2 || true
  exit 1
fi

pass "Settlement status transitioned to CHARGED"
pass "check-payment-webhook passed"
