#!/usr/bin/env bash
set -euo pipefail

API="${API:-http://127.0.0.1:6002/api}"

BUYER_EMAIL="${BUYER_EMAIL:-buyer@pawn.local}"
BUYER_PASSWORD="${BUYER_PASSWORD:-Buyer123!}"

OWNER_EMAIL="${OWNER_EMAIL:-owner1@pawn.local}"
OWNER_PASSWORD="${OWNER_PASSWORD:-Owner123!}"

ADMIN_EMAIL="${ADMIN_EMAIL:-admin1@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin123}"

SUPER_ADMIN_EMAIL="${SUPER_ADMIN_EMAIL:-}"
SUPER_ADMIN_PASSWORD="${SUPER_ADMIN_PASSWORD:-}"

LAST_BODY="$(mktemp)"
trap 'rm -f "$LAST_BODY"' EXIT

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
  local expected_prefix="${4:-2}"
  local url="${API}${path}"
  local status

  if [ -n "$token" ]; then
    status="$(
      curl -sS -o "$LAST_BODY" -w "%{http_code}" \
        -X "$method" "$url" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $token"
    )"
  else
    status="$(
      curl -sS -o "$LAST_BODY" -w "%{http_code}" \
        -X "$method" "$url" \
        -H "Content-Type: application/json"
    )"
  fi

  if [[ "$status" != ${expected_prefix}* ]]; then
    echo "" >&2
    echo "❌ Request failed: $method $url" >&2
    echo "Expected HTTP ${expected_prefix}xx, got HTTP $status" >&2
    echo "Response body:" >&2
    cat "$LAST_BODY" >&2 || true
    echo "" >&2
    exit 1
  fi

  pass "$method $path"
}

login() {
  local label="$1"
  local email="$2"
  local password="$3"
  local body
  local status
  local token

  body="$(EMAIL="$email" PASS="$password" node -e '
    process.stdout.write(JSON.stringify({
      email: process.env.EMAIL,
      password: process.env.PASS
    }))
  ')"

  status="$(
    curl -sS -o "$LAST_BODY" -w "%{http_code}" \
      -X POST "$API/auth/login" \
      -H "Content-Type: application/json" \
      --data "$body"
  )"

  if [[ "$status" != 2* ]]; then
    echo "❌ $label login failed: HTTP $status" >&2
    cat "$LAST_BODY" >&2 || true
    exit 1
  fi

  token="$(
    node -e "
      const fs = require('fs');
      const json = JSON.parse(fs.readFileSync('$LAST_BODY', 'utf8') || '{}');
      process.stdout.write(json.token || json.accessToken || json.data?.token || json.data?.accessToken || '');
    "
  )"

  if [ -z "$token" ]; then
    echo "❌ $label login returned no token" >&2
    cat "$LAST_BODY" >&2 || true
    exit 1
  fi

  pass "$label login"
  printf '%s' "$token"
}

log "Checking health/public API..."
request GET "/health"
request GET "/items?limit=5"
request GET "/auctions?limit=5"
request GET "/shops?limit=5"
request GET "/locations?limit=5"
request GET "/seller-plans"
request GET "/buyer-plans"

log "Logging in by role..."
BUYER_TOKEN="$(login "Buyer" "$BUYER_EMAIL" "$BUYER_PASSWORD")"
OWNER_TOKEN="$(login "Owner" "$OWNER_EMAIL" "$OWNER_PASSWORD")"
ADMIN_TOKEN="$(login "Admin" "$ADMIN_EMAIL" "$ADMIN_PASSWORD")"

log "Buyer route checks..."
request GET "/auth/me" "$BUYER_TOKEN"
request GET "/bids/mine" "$BUYER_TOKEN"
request GET "/settlements/mine" "$BUYER_TOKEN"
request GET "/watchlist/mine" "$BUYER_TOKEN"
request GET "/saved-searches/mine" "$BUYER_TOKEN"
request GET "/buyer-plans/mine" "$BUYER_TOKEN"
request GET "/offers/mine" "$BUYER_TOKEN"

log "Owner route checks..."
request GET "/auth/me" "$OWNER_TOKEN"
request GET "/shops/mine" "$OWNER_TOKEN"
request GET "/items/mine" "$OWNER_TOKEN"
request GET "/locations/mine" "$OWNER_TOKEN"
request GET "/staff/mine" "$OWNER_TOKEN"
request GET "/auctions/mine" "$OWNER_TOKEN"
request GET "/offers/owner" "$OWNER_TOKEN"
request GET "/settlements/mine" "$OWNER_TOKEN"

log "Admin route checks..."
request GET "/auth/me" "$ADMIN_TOKEN"
request GET "/admin/users" "$ADMIN_TOKEN"
request GET "/admin/items" "$ADMIN_TOKEN"
request GET "/admin/shops" "$ADMIN_TOKEN"
request GET "/admin/subscriptions" "$ADMIN_TOKEN"
request GET "/settlements" "$ADMIN_TOKEN"

log "Negative permission checks..."
request GET "/admin/users" "$BUYER_TOKEN" "4"
request GET "/admin/users" "$OWNER_TOKEN" "4"

log "Super admin route checks..."
if [ -n "$SUPER_ADMIN_EMAIL" ] && [ -n "$SUPER_ADMIN_PASSWORD" ]; then
  SUPER_ADMIN_TOKEN="$(login "Super admin" "$SUPER_ADMIN_EMAIL" "$SUPER_ADMIN_PASSWORD")"
  request GET "/super-admin/overview" "$SUPER_ADMIN_TOKEN"
  request GET "/super-admin/users" "$SUPER_ADMIN_TOKEN"
  request GET "/super-admin/shops" "$SUPER_ADMIN_TOKEN"
  request GET "/super-admin/plans/seller" "$SUPER_ADMIN_TOKEN"
  request GET "/super-admin/plans/buyer" "$SUPER_ADMIN_TOKEN"
  request GET "/super-admin/buyer-subscriptions" "$SUPER_ADMIN_TOKEN"
  request GET "/super-admin/settlements" "$SUPER_ADMIN_TOKEN"
  request GET "/super-admin/revenue" "$SUPER_ADMIN_TOKEN"
  request GET "/super-admin/platform-settings" "$SUPER_ADMIN_TOKEN"
  request GET "/super-admin/audit" "$SUPER_ADMIN_TOKEN"
else
  echo "⚠️  Super admin route checks skipped. Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD to test them." >&2
fi

echo ""
echo "✅ Role route smoke test passed."
