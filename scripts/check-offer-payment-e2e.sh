#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

TS="$(date +%Y%m%d-%H%M%S)"
OUT="reports/offer-payment-e2e-$TS"
mkdir -p "$OUT"

API_BASE="${API_BASE:-http://127.0.0.1:6002/api}"
API_ROOT="${API_ROOT:-http://127.0.0.1:6002}"

BUYER_EMAIL="${BUYER_EMAIL:-buyer@pawn.local}"
BUYER_PASSWORD="${BUYER_PASSWORD:-Buyer123!}"
OWNER_EMAIL="${OWNER_EMAIL:-owner1@pawn.local}"
OWNER_PASSWORD="${OWNER_PASSWORD:-Owner123!}"

LAST_BODY="$OUT/last-response.json"

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
  local url="$API_BASE$path"
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

  cp "$LAST_BODY" "$OUT/$(printf '%s-%s.json' "$method" "$(echo "$path" | tr '/:?=&' '_____')" | sed 's/__*/_/g')"

  if [[ "$status" != 2* ]]; then
    printf '\nRequest failed: %s %s\nHTTP %s\n' "$method" "$url" "$status" >&2
    printf 'Response body:\n' >&2
    cat "$LAST_BODY" >&2 || true
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

echo "===== OFFER PAYMENT E2E ====="
echo "Repo: $ROOT"
echo "Report: $OUT"
echo "API_BASE: $API_BASE"

log "Checking webhook secret..."
node --env-file=apps/api/backend/.env.development - <<'NODE'
const secret = process.env.STRIPE_WEBHOOK_SECRET || "";
if (!secret || secret.includes("REPLACE_ME")) {
  console.error("STRIPE_WEBHOOK_SECRET is missing or placeholder.");
  process.exit(1);
}
console.log("STRIPE_WEBHOOK_SECRET usable:", true);
NODE

log "Logging in..."
BUYER_TOKEN="$(login "Buyer" "$BUYER_EMAIL" "$BUYER_PASSWORD")"
OWNER_TOKEN="$(login "Owner" "$OWNER_EMAIL" "$OWNER_PASSWORD")"

log "Finding owner shop..."
request GET "/shops/mine" "$OWNER_TOKEN"
SHOP_ID="$(json_get "(Array.isArray(json) ? json : (json.rows || json.shops || json.data || []))[0]?.id || ''")"

log "Cleanup old offer/payment E2E test listings..."
OWNER_EMAIL="$OWNER_EMAIL" SHOP_ID="$SHOP_ID" DRY_RUN=false ./scripts/cleanup-e2e-test-listings.sh || true

if [ -z "$SHOP_ID" ]; then
  echo "Owner has no shop." >&2
  exit 1
fi

pass "Owner shop found: $SHOP_ID"

log "Creating item..."
ITEM_BODY="$(
  SHOP_ID="$SHOP_ID" node -e '
    process.stdout.write(JSON.stringify({
      shopId: process.env.SHOP_ID,
      pawnShopId: process.env.SHOP_ID,
      title: `Offer Payment Test Item ${Date.now()}`,
      description: "Created by check-offer-payment-e2e",
      category: "Electronics",
      condition: "Good",
      price: 125,
      status: "AVAILABLE"
    }))
  '
)"

request POST "/items" "$OWNER_TOKEN" "$ITEM_BODY"
ITEM_ID="$(json_get "json.id || json.item?.id || json.data?.id || ''")"

if [ -z "$ITEM_ID" ]; then
  echo "Item create response missing id." >&2
  cat "$LAST_BODY" >&2 || true
  exit 1
fi

pass "Item created: $ITEM_ID"

log "Buyer creating offer..."
OFFER_BODY="$(
  ITEM_ID="$ITEM_ID" node -e '
    process.stdout.write(JSON.stringify({
      itemId: process.env.ITEM_ID,
      amount: 75,
      message: "Offer payment E2E"
    }))
  '
)"

request POST "/offers" "$BUYER_TOKEN" "$OFFER_BODY"
OFFER_ID="$(json_get "json.id || json.offer?.id || json.data?.id || ''")"

if [ -z "$OFFER_ID" ]; then
  echo "Offer create response missing id." >&2
  cat "$LAST_BODY" >&2 || true
  exit 1
fi

pass "Offer created: $OFFER_ID"

log "Owner accepting offer..."
request POST "/offers/$OFFER_ID/accept" "$OWNER_TOKEN" "{}"

SETTLEMENT_ID="$(json_get "json.settlement?.id || json.data?.settlement?.id || ''")"
OFFER_STATUS="$(json_get "json.status || json.offer?.status || json.data?.status || ''")"

if [ "$OFFER_STATUS" != "ACCEPTED" ] || [ -z "$SETTLEMENT_ID" ]; then
  echo "Accepted offer did not return settlement." >&2
  cat "$LAST_BODY" >&2 || true
  exit 1
fi

pass "Offer accepted and settlement created: $SETTLEMENT_ID"

log "Creating settlement PaymentIntent..."
request POST "/stripe/payment-intents/settlements/$SETTLEMENT_ID" "$BUYER_TOKEN" "{}"

PAYMENT_INTENT_ID="$(json_get "json.paymentIntentId || json.data?.paymentIntentId || ''")"
CLIENT_SECRET="$(json_get "json.clientSecret || json.data?.clientSecret || ''")"

if [ -z "$PAYMENT_INTENT_ID" ] || [ -z "$CLIENT_SECRET" ]; then
  echo "PaymentIntent response missing paymentIntentId or clientSecret." >&2
  cat "$LAST_BODY" >&2 || true
  exit 1
fi

pass "PaymentIntent created: $PAYMENT_INTENT_ID"

log "Creating signed Stripe webhook payload..."
WEBHOOK_DIR="$OUT/webhook"
mkdir -p "$WEBHOOK_DIR"

SETTLEMENT_ID="$SETTLEMENT_ID" \
OFFER_ID="$OFFER_ID" \
PAYMENT_INTENT_ID="$PAYMENT_INTENT_ID" \
WEBHOOK_DIR="$WEBHOOK_DIR" \
node --env-file=apps/api/backend/.env.development --input-type=module <<'NODE'
import crypto from "node:crypto";
import fs from "node:fs";

const settlementId = process.env.SETTLEMENT_ID;
const offerId = process.env.OFFER_ID;
const paymentIntentId = process.env.PAYMENT_INTENT_ID;
const out = process.env.WEBHOOK_DIR;
const secret = process.env.STRIPE_WEBHOOK_SECRET || "";

if (!secret || secret.includes("REPLACE_ME")) {
  throw new Error("STRIPE_WEBHOOK_SECRET is missing or placeholder.");
}

const payload = JSON.stringify({
  id: `evt_offer_payment_${Date.now()}`,
  object: "event",
  api_version: "2024-06-20",
  created: Math.floor(Date.now() / 1000),
  type: "payment_intent.succeeded",
  data: {
    object: {
      id: paymentIntentId,
      object: "payment_intent",
      amount: 7500,
      currency: "usd",
      status: "succeeded",
      metadata: {
        settlementId,
        offerId,
        auctionId: "",
      },
    },
  },
});

const timestamp = Math.floor(Date.now() / 1000);
const signature = crypto
  .createHmac("sha256", secret)
  .update(`${timestamp}.${payload}`, "utf8")
  .digest("hex");

fs.writeFileSync(`${out}/stripe-event.json`, payload);
fs.writeFileSync(`${out}/stripe-signature.txt`, `t=${timestamp},v1=${signature}`);
NODE

log "Posting signed Stripe webhook..."
SIG="$(cat "$WEBHOOK_DIR/stripe-signature.txt")"

curl -sS -o "$OUT/webhook-response.json" -w "%{http_code}" \
  -X POST "$API_ROOT/api/webhooks/stripe" \
  -H "Content-Type: application/json" \
  -H "stripe-signature: $SIG" \
  --data-binary @"$WEBHOOK_DIR/stripe-event.json" > "$OUT/webhook-status.txt"

WEBHOOK_STATUS="$(cat "$OUT/webhook-status.txt")"

if [[ "$WEBHOOK_STATUS" != 2* ]]; then
  echo "Webhook failed with HTTP $WEBHOOK_STATUS" >&2
  cat "$OUT/webhook-response.json" >&2 || true
  exit 1
fi

pass "Signed webhook accepted"

log "Verifying settlement is CHARGED..."
request GET "/settlements/$SETTLEMENT_ID" "$BUYER_TOKEN"

FINAL_STATUS="$(json_get "json.status || json.settlement?.status || json.data?.status || ''")"
FINAL_PI="$(json_get "json.stripePaymentIntent || json.settlement?.stripePaymentIntent || json.data?.stripePaymentIntent || ''")"

if [ "$FINAL_STATUS" != "CHARGED" ]; then
  echo "Expected CHARGED settlement, got $FINAL_STATUS" >&2
  cat "$LAST_BODY" >&2 || true
  exit 1
fi

if [ "$FINAL_PI" != "$PAYMENT_INTENT_ID" ]; then
  echo "Expected PaymentIntent $PAYMENT_INTENT_ID, got $FINAL_PI" >&2
  cat "$LAST_BODY" >&2 || true
  exit 1
fi

pass "Offer settlement transitioned to CHARGED"

echo ""
echo "===== OFFER PAYMENT E2E PASSED ====="
node -e "
  console.log(JSON.stringify({
    success: true,
    itemId: '$ITEM_ID',
    offerId: '$OFFER_ID',
    settlementId: '$SETTLEMENT_ID',
    paymentIntentId: '$PAYMENT_INTENT_ID',
    reportDir: '$OUT'
  }, null, 2));
"
