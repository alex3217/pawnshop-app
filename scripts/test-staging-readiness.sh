#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
FIXTURE="$TMP_DIR/staging.env"
FAKE_BIN="$TMP_DIR/fake-bin"

use_fixture() { cp "$ROOT/scripts/test/fixtures/$1" "$FIXTURE"; }
set_value() { sed -i.bak "s|^$1=.*|$1=$2|" "$FIXTURE"; rm "$FIXTURE.bak"; }
unset_value() { sed -i.bak "/^$1=/d" "$FIXTURE"; rm "$FIXTURE.bak"; }

expect_pass() {
  local label="$1"
  if ! STAGING_ENV_FILE="$FIXTURE" STAGING_VALIDATION_MODE="${2:-deployed}" \
    bash "$ROOT/scripts/check-staging-readiness.sh" >/dev/null; then
    echo "FAIL: expected pass: $label" >&2; exit 1
  fi
}

expect_fail() {
  local label="$1"
  if STAGING_ENV_FILE="$FIXTURE" STAGING_VALIDATION_MODE="${2:-deployed}" \
    bash "$ROOT/scripts/check-staging-readiness.sh" >/dev/null 2>&1; then
    echo "FAIL: expected failure: $label" >&2; exit 1
  fi
}

expect_smoke_url_pass() {
  if ! STAGING_API_URL="$1" bash "$ROOT/scripts/check-staging-smoke.sh" --validate-url-only >/dev/null; then
    echo "FAIL: expected STAGING_API_URL format to pass: $2" >&2; exit 1
  fi
}

expect_smoke_url_fail() {
  if STAGING_API_URL="$1" bash "$ROOT/scripts/check-staging-smoke.sh" --validate-url-only >/dev/null 2>&1; then
    echo "FAIL: expected STAGING_API_URL format to fail: $2" >&2; exit 1
  fi
}

mkdir -p "$FAKE_BIN"
cat >"$FAKE_BIN/curl" <<'FAKE_CURL'
#!/usr/bin/env bash
set -euo pipefail
headers=""
body=""
method=""
url=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --dump-header) headers="$2"; shift 2 ;;
    --output) body="$2"; shift 2 ;;
    --request) method="$2"; shift 2 ;;
    --connect-timeout|--max-time|--max-redirs|--write-out) shift 2 ;;
    --silent|--show-error) shift ;;
    *) url="$1"; shift ;;
  esac
done

if [ "$method" != "GET" ]; then
  echo "Synthetic smoke fixture received a non-GET request." >&2
  exit 1
fi
case "$url" in
  https://api.staging.invalid/api/health|https://api.staging.invalid/api/ready) ;;
  *) echo "Synthetic smoke fixture received an unexpected URL." >&2; exit 1 ;;
esac

printf 'HTTP/1.1 200 OK\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n\r\n' >"$headers"
printf '{"ok":true,"success":true,"service":"%s","env":"%s","ready":true,"dependencies":{"database":"ok"}}\n' \
  "${FAKE_SMOKE_SERVICE:-pawnloop-api}" "${FAKE_SMOKE_ENV:-staging}" >"$body"
printf '200'
FAKE_CURL
chmod 755 "$FAKE_BIN/curl"

expect_smoke_response_pass() {
  local label="$1"
  if ! PATH="$FAKE_BIN:$PATH" STAGING_API_URL="https://api.staging.invalid" \
    STAGING_EXPECTED_SERVICE="another-service" STAGING_EXPECTED_ENV="production" \
    bash "$ROOT/scripts/check-staging-smoke.sh" >/dev/null; then
    echo "FAIL: expected synthetic smoke response to pass: $label" >&2; exit 1
  fi
}

expect_smoke_response_fail() {
  local label="$1"
  if PATH="$FAKE_BIN:$PATH" STAGING_API_URL="https://api.staging.invalid" \
    STAGING_EXPECTED_SERVICE="another-service" STAGING_EXPECTED_ENV="production" \
    FAKE_SMOKE_SERVICE="another-service" FAKE_SMOKE_ENV="production" \
    bash "$ROOT/scripts/check-staging-smoke.sh" >/dev/null 2>&1; then
    echo "FAIL: expected synthetic smoke response to fail: $label" >&2; exit 1
  fi
}

use_fixture staging-valid.env; expect_pass "valid deployed fixture"
use_fixture staging-local-valid.env; expect_pass "fully local fixture" local

use_fixture staging-valid.env; unset_value STAGING_DATABASE_HOST; expect_fail "missing deployed STAGING_DATABASE_HOST"
use_fixture staging-valid.env; set_value DATABASE_URL postgresql:///pawnloop_staging; expect_fail "DATABASE_URL without hostname"
use_fixture staging-valid.env; set_value STAGING_DATABASE_HOST placeholder.invalid; expect_fail "placeholder staging database host"
invalid_staging_hosts=(
  'https://staging-db.invalid'
  'user:pass@staging-db.invalid'
  'staging-db.invalid:5432'
  'staging-db.invalid/path'
  'staging-db.invalid?query=1'
  '"staging-db.invalid#fragment"'
  'localhost'
  'db.localhost'
  '127.0.0.1'
  '127.0.0.2'
  '::1'
)
for bad in "${invalid_staging_hosts[@]}"; do
  use_fixture staging-valid.env; set_value STAGING_DATABASE_HOST "$bad"; expect_fail "invalid staging database host: $bad"
done
use_fixture staging-valid.env; set_value STAGING_DATABASE_HOST other-staging-db.invalid; expect_fail "database hostname mismatch"
use_fixture staging-valid.env; set_value STAGING_DATABASE_HOST STAGING-DB.INVALID; expect_pass "case-insensitive database hostname match"

use_fixture staging-local-valid.env; unset_value PAWN_PORT; expect_fail "missing local PAWN_PORT" local
use_fixture staging-local-valid.env; set_value PAWN_PORT 6004; expect_fail "incorrect local PAWN_PORT" local
use_fixture staging-valid.env; unset_value PAWN_PORT; expect_pass "optional deployed PAWN_PORT"
use_fixture staging-valid.env; set_value PAWN_PORT 0; expect_fail "invalid deployed PAWN_PORT"
use_fixture staging-valid.env; set_value PAWN_PORT 65536; expect_fail "deployed PAWN_PORT above TCP range"
use_fixture staging-valid.env; set_value PORT 1; expect_pass "lowest valid deployed PORT"
use_fixture staging-valid.env; set_value PORT 65535; expect_pass "highest valid deployed PORT"
use_fixture staging-valid.env; set_value PORT 0; expect_fail "zero deployed PORT"
use_fixture staging-valid.env; set_value PORT 65536; expect_fail "deployed PORT above TCP range"

required=(APP_NAME APP_ENV NODE_ENV APP_VERSION PORT API_ORIGIN DATABASE_URL STAGING_DATABASE_HOST JWT_SECRET INTEGRATION_CREDENTIAL_ENCRYPTION_KEY FRONTEND_URL WEB_URL CORS_ORIGIN CORS_ORIGINS INVITE_ONLY_REGISTRATION_ENABLED AUTH_RATE_LIMIT_ENABLED AUTH_RATE_LIMIT_WINDOW_MS AUTH_RATE_LIMIT_IP_MAX AUTH_RATE_LIMIT_SENSITIVE_IP_MAX AUTH_RATE_LIMIT_IDENTIFIER_MAX AUTH_RATE_LIMIT_COMBINED_MAX TRUST_PROXY MFA_MODE EMAIL_PROVIDER SMTP_HOST SMTP_PORT SMTP_SECURE SMTP_USER SMTP_PASS SMTP_CONNECTION_TIMEOUT_MS SMTP_GREETING_TIMEOUT_MS SMTP_SOCKET_TIMEOUT_MS EMAIL_FROM STRIPE_SECRET_KEY STRIPE_PUBLISHABLE_KEY STRIPE_WEBHOOK_SECRET STRIPE_CONNECT_ENABLED STRIPE_CONNECT_WEBHOOK_SECRET STRIPE_PRICE_PRO STRIPE_PRICE_PREMIUM STRIPE_PRICE_ULTRA STRIPE_PRICE_BUYER_PLUS_MONTHLY STRIPE_PRICE_BUYER_PLUS_YEARLY STRIPE_PRICE_BUYER_PREMIUM_MONTHLY STRIPE_PRICE_BUYER_PREMIUM_YEARLY STRIPE_PRICE_BUYER_ULTRA_MONTHLY STRIPE_PRICE_BUYER_ULTRA_YEARLY AUCTION_SCHEDULER_ENABLED AUCTION_SCHEDULER_INTERVAL_MS AUCTION_SCHEDULER_BATCH_SIZE MARKETPLACE_RESERVATION_SCHEDULER_ENABLED MARKETPLACE_RESERVATION_SCHEDULER_INTERVAL_MS MARKETPLACE_RESERVATION_SCHEDULER_BATCH_SIZE MARKETPLACE_RESERVATION_TTL_MINUTES SCHEDULER_OWNER READINESS_TIMEOUT_MS DURABLE_UPLOADS_ENABLED UPLOAD_STORAGE_ENDPOINT UPLOAD_STORAGE_REGION UPLOAD_STORAGE_BUCKET UPLOAD_STORAGE_ACCESS_KEY_ID UPLOAD_STORAGE_SECRET_ACCESS_KEY UPLOAD_STORAGE_PUBLIC_BASE_URL UPLOAD_STORAGE_FORCE_PATH_STYLE UPLOAD_MAX_FILE_BYTES UPLOAD_MAX_FILES UPLOAD_MAX_AGGREGATE_BYTES UPLOAD_MAX_WIDTH UPLOAD_MAX_HEIGHT UPLOAD_MAX_PIXELS UPLOAD_RATE_LIMIT_WINDOW_MS UPLOAD_RATE_LIMIT_USER_MAX UPLOAD_RATE_LIMIT_IP_MAX UPLOAD_MAX_CONCURRENT UPLOAD_STORAGE_TIMEOUT_MS)
for name in "${required[@]}"; do
  use_fixture staging-valid.env; set_value "$name" ""; expect_fail "missing $name"
  use_fixture staging-valid.env; set_value "$name" "replace_me"; expect_fail "placeholder $name"
done

numeric_settings=(AUTH_RATE_LIMIT_WINDOW_MS AUTH_RATE_LIMIT_IP_MAX AUTH_RATE_LIMIT_SENSITIVE_IP_MAX AUTH_RATE_LIMIT_IDENTIFIER_MAX AUTH_RATE_LIMIT_COMBINED_MAX SMTP_PORT AUCTION_SCHEDULER_INTERVAL_MS AUCTION_SCHEDULER_BATCH_SIZE MARKETPLACE_RESERVATION_SCHEDULER_INTERVAL_MS MARKETPLACE_RESERVATION_SCHEDULER_BATCH_SIZE MARKETPLACE_RESERVATION_TTL_MINUTES READINESS_TIMEOUT_MS UPLOAD_MAX_FILE_BYTES UPLOAD_MAX_FILES UPLOAD_MAX_AGGREGATE_BYTES UPLOAD_MAX_WIDTH UPLOAD_MAX_HEIGHT UPLOAD_MAX_PIXELS UPLOAD_RATE_LIMIT_WINDOW_MS UPLOAD_RATE_LIMIT_USER_MAX UPLOAD_RATE_LIMIT_IP_MAX UPLOAD_MAX_CONCURRENT UPLOAD_STORAGE_TIMEOUT_MS)
for name in "${numeric_settings[@]}"; do
  use_fixture staging-valid.env; set_value "$name" 0; expect_fail "zero $name"
  use_fixture staging-valid.env; set_value "$name" malformed; expect_fail "malformed $name"
done

boolean_settings=(INVITE_ONLY_REGISTRATION_ENABLED AUTH_RATE_LIMIT_ENABLED SMTP_SECURE AUCTION_SCHEDULER_ENABLED MARKETPLACE_RESERVATION_SCHEDULER_ENABLED DURABLE_UPLOADS_ENABLED UPLOAD_STORAGE_FORCE_PATH_STYLE)
for name in "${boolean_settings[@]}"; do
  use_fixture staging-valid.env; set_value "$name" yes; expect_fail "malformed boolean $name"
done
for name in INVITE_ONLY_REGISTRATION_ENABLED AUTH_RATE_LIMIT_ENABLED; do
  use_fixture staging-valid.env; set_value "$name" false; expect_fail "required enabled state $name"
done
for name in AUCTION_SCHEDULER_ENABLED MARKETPLACE_RESERVATION_SCHEDULER_ENABLED; do
  use_fixture staging-valid.env; set_value "$name" true; expect_fail "required disabled state $name"
done

stripe_prices=(STRIPE_PRICE_PRO STRIPE_PRICE_PREMIUM STRIPE_PRICE_ULTRA STRIPE_PRICE_BUYER_PLUS_MONTHLY STRIPE_PRICE_BUYER_PLUS_YEARLY STRIPE_PRICE_BUYER_PREMIUM_MONTHLY STRIPE_PRICE_BUYER_PREMIUM_YEARLY STRIPE_PRICE_BUYER_ULTRA_MONTHLY STRIPE_PRICE_BUYER_ULTRA_YEARLY)
for name in "${stripe_prices[@]}"; do
  use_fixture staging-valid.env; set_value "$name" malformed_price; expect_fail "malformed $name"
done
for name in STRIPE_WEBHOOK_SECRET STRIPE_CONNECT_WEBHOOK_SECRET; do
  use_fixture staging-valid.env; set_value "$name" malformed_secret; expect_fail "malformed $name"
done

invalid_cases=(
  'APP_NAME|other-service' 'APP_ENV|production' 'NODE_ENV|production'
  'DATABASE_URL|not-a-url' 'DATABASE_URL|postgresql://user:pass@localhost/staging'
  'DATABASE_URL|postgresql://user:pass@127.0.0.2/staging'
  'JWT_SECRET|short' 'INTEGRATION_CREDENTIAL_ENCRYPTION_KEY|short'
  'TRUST_PROXY|0' 'SMTP_HOST|smtp.invalid:587' 'SMTP_PORT|65536'
  'EMAIL_FROM|not-an-email' 'STRIPE_SECRET_KEY|sk_live_synthetic'
  'STRIPE_PUBLISHABLE_KEY|pk_live_synthetic'
  'AUTH_RATE_LIMIT_IDENTIFIER_MAX|5' 'AUCTION_SCHEDULER_BATCH_SIZE|101'
  'MARKETPLACE_RESERVATION_SCHEDULER_BATCH_SIZE|101'
)
for item in "${invalid_cases[@]}"; do
  name="${item%%|*}"; bad="${item#*|}"
  use_fixture staging-valid.env; set_value "$name" "$bad"; expect_fail "malformed/insecure $name"
done

origin_cases=(
  'FRONTEND_URL|https://user:pass@web.staging.invalid'
  'WEB_URL|https://user@web.staging.invalid'
  'CORS_ORIGIN|https://user:pass@web.staging.invalid'
  'CORS_ORIGINS|https://web.staging.invalid,https://user@admin.staging.invalid'
  'FRONTEND_URL|https://web.staging.invalid/app'
  'WEB_URL|https://web.staging.invalid?query=1'
  'CORS_ORIGIN|"https://web.staging.invalid#fragment"'
  'CORS_ORIGINS|https://web.staging.invalid,https://admin.staging.invalid/path'
  'CORS_ORIGINS|https://web.staging.invalid,https://admin.staging.invalid?query=1'
  'CORS_ORIGINS|"https://web.staging.invalid,https://admin.staging.invalid#fragment"'
  'FRONTEND_URL|https://web.staging.invalid/'
  'FRONTEND_URL|https://preview.localhost'
  'CORS_ORIGINS|https://web.staging.invalid,https://admin.staging.invalid/'
)
for item in "${origin_cases[@]}"; do
  name="${item%%|*}"; bad="${item#*|}"
  use_fixture staging-valid.env; set_value "$name" "$bad"; expect_fail "noncanonical origin $name"
done

use_fixture staging-valid.env; set_value FRONTEND_URL https://web.staging.invalid:8443; expect_pass "legitimate non-default origin port"
use_fixture staging-local-valid.env; set_value FRONTEND_URL ftp://localhost:5173; expect_fail "non-HTTP local origin" local

expect_smoke_url_pass "https://api.staging.invalid" "canonical origin"
expect_smoke_url_pass "https://api.staging.invalid/" "normalized trailing slash"
expect_smoke_url_pass "https://api.staging.invalid:8443" "non-default port"
expect_smoke_url_fail "https://user:pass@api.staging.invalid" "credential-bearing URL"
expect_smoke_url_fail "http://api.staging.invalid" "insecure URL"
expect_smoke_url_fail "https://api.staging.invalid/path" "path-bearing URL"
expect_smoke_url_fail "https://api.staging.invalid?query=1" "query-bearing URL"
expect_smoke_url_fail "https://api.staging.invalid#fragment" "fragment-bearing URL"
expect_smoke_url_fail "https://api.staging.invalid:65536" "invalid port"
expect_smoke_response_pass "ambient identity overrides are ignored"
expect_smoke_response_fail "non-staging identity cannot be approved by ambient overrides"

echo "Staging readiness fixture tests passed (${#required[@]} common required settings plus the deployed database-host contract and fixed smoke identity)."
