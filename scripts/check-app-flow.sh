#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:-http://127.0.0.1:6002/api}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:6002/api/health}"

BUYER_EMAIL="${BUYER_EMAIL:-buyer@pawn.local}"
BUYER_PASSWORD="${BUYER_PASSWORD:-Buyer123!}"

OWNER_EMAIL="${OWNER_EMAIL:-owner1@pawn.local}"
OWNER_PASSWORD="${OWNER_PASSWORD:-Owner123!}"

ADMIN_EMAIL="${ADMIN_EMAIL:-admin1@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin123}"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

LAST_BODY="$TMP_DIR/last-body.json"

log() {
  printf '\n%s\n' "$1" >&2
}

pass() {
  printf '✅ %s\n' "$1" >&2
}

fail() {
  printf '❌ %s\n' "$1" >&2
  exit 1
}

request() {
  local method="$1"
  local path="$2"
  local token="${3:-}"
  local body="${4:-}"
  local url="${API_BASE}${path}"
  local status

  if [ -n "$body" ]; then
    if [ -n "$token" ]; then
      status="$(
        curl -sS -o "$LAST_BODY" -w "%{http_code}" \
          -X "$method" "$url" \
          -H "Content-Type: application/json" \
          -H "Authorization: Bearer $token" \
          --data "$body"
      )"
    else
      status="$(
        curl -sS -o "$LAST_BODY" -w "%{http_code}" \
          -X "$method" "$url" \
          -H "Content-Type: application/json" \
          --data "$body"
      )"
    fi
  else
    if [ -n "$token" ]; then
      status="$(
        curl -sS -o "$LAST_BODY" -w "%{http_code}" \
          -X "$method" "$url" \
          -H "Authorization: Bearer $token"
      )"
    else
      status="$(
        curl -sS -o "$LAST_BODY" -w "%{http_code}" \
          -X "$method" "$url"
      )"
    fi
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

  cat "$LAST_BODY" >/dev/null
}

json_body_login() {
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
      try {
        const json = JSON.parse(input || "{}");
        const token =
          json.token ||
          json.accessToken ||
          json.data?.token ||
          json.data?.accessToken ||
          json.user?.token ||
          "";
        process.stdout.write(token);
      } catch {
        process.stdout.write("");
      }
    });
  '
}

login() {
  local label="$1"
  local email="$2"
  local password="$3"
  local body
  local token

  body="$(json_body_login "$email" "$password")"
  request POST "/auth/login" "" "$body"
  token="$(cat "$LAST_BODY" | extract_token)"

  if [ -z "$token" ]; then
    printf '\nLogin response for %s did not include a token:\n' "$label" >&2
    cat "$LAST_BODY" >&2 || true
    printf '\n' >&2
    exit 1
  fi

  pass "$label login"
  printf '%s' "$token"
}

log "Checking backend health..."
curl -sS "$HEALTH_URL" > "$LAST_BODY"
node -e '
  const fs = require("fs");
  const json = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (!json.ok && !json.success) process.exit(1);
' "$LAST_BODY" || fail "Backend health failed"
pass "Backend health"

log "Checking public marketplace endpoints..."
request GET "/items?limit=5"
pass "Public items endpoint"

request GET "/auctions?limit=5"
pass "Public auctions endpoint"

log "Checking auth..."
BUYER_TOKEN="$(login "Buyer" "$BUYER_EMAIL" "$BUYER_PASSWORD")"
OWNER_TOKEN="$(login "Owner" "$OWNER_EMAIL" "$OWNER_PASSWORD")"
ADMIN_TOKEN="$(login "Admin" "$ADMIN_EMAIL" "$ADMIN_PASSWORD")"

log "Checking buyer flow visibility..."
request GET "/bids/mine" "$BUYER_TOKEN"
pass "Buyer bids endpoint"

request GET "/settlements/mine" "$BUYER_TOKEN"
pass "Buyer settlements/wins endpoint"

log "Checking owner flow visibility..."
request GET "/shops/mine" "$OWNER_TOKEN"
pass "Owner shops endpoint"

request GET "/items/mine" "$OWNER_TOKEN"
pass "Owner items endpoint"

request GET "/staff/mine" "$OWNER_TOKEN"
pass "Owner staff endpoint"

request GET "/auctions/mine" "$OWNER_TOKEN"
pass "Owner auctions endpoint"

log "Checking admin flow visibility..."
request GET "/admin/shops" "$ADMIN_TOKEN"
pass "Admin shops endpoint"

request GET "/auctions?limit=5" "$ADMIN_TOKEN"
pass "Admin auctions visibility"

request GET "/admin/users" "$ADMIN_TOKEN"
pass "Admin users endpoint"

log "App flow smoke test completed."
pass "check:app-flow passed"
