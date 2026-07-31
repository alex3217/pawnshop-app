#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
FIXTURE="$TMP_DIR/staging.env"

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

use_fixture staging-valid.env; expect_pass "valid deployed fixture"
use_fixture staging-local-valid.env; expect_pass "fully local fixture" local

use_fixture staging-local-valid.env; unset_value PAWN_PORT; expect_fail "missing local PAWN_PORT" local
use_fixture staging-local-valid.env; set_value PAWN_PORT 6004; expect_fail "incorrect local PAWN_PORT" local
use_fixture staging-valid.env; unset_value PAWN_PORT; expect_pass "optional deployed PAWN_PORT"
use_fixture staging-valid.env; set_value PAWN_PORT 0; expect_fail "invalid deployed PAWN_PORT"
use_fixture staging-valid.env; set_value PAWN_PORT 65536; expect_fail "deployed PAWN_PORT above TCP range"
use_fixture staging-valid.env; set_value PORT 1; expect_pass "lowest valid deployed PORT"
use_fixture staging-valid.env; set_value PORT 65535; expect_pass "highest valid deployed PORT"
use_fixture staging-valid.env; set_value PORT 0; expect_fail "zero deployed PORT"
use_fixture staging-valid.env; set_value PORT 65536; expect_fail "deployed PORT above TCP range"

required=(APP_NAME APP_ENV NODE_ENV PORT DATABASE_URL JWT_SECRET INTEGRATION_CREDENTIAL_ENCRYPTION_KEY FRONTEND_URL WEB_URL CORS_ORIGIN CORS_ORIGINS INVITE_ONLY_REGISTRATION_ENABLED AUTH_RATE_LIMIT_ENABLED AUTH_RATE_LIMIT_WINDOW_MS AUTH_RATE_LIMIT_IP_MAX AUTH_RATE_LIMIT_SENSITIVE_IP_MAX AUTH_RATE_LIMIT_IDENTIFIER_MAX AUTH_RATE_LIMIT_COMBINED_MAX TRUST_PROXY SMTP_HOST SMTP_PORT SMTP_SECURE EMAIL_FROM STRIPE_SECRET_KEY STRIPE_PUBLISHABLE_KEY STRIPE_WEBHOOK_SECRET STRIPE_CONNECT_WEBHOOK_SECRET STRIPE_PRICE_PRO STRIPE_PRICE_PREMIUM STRIPE_PRICE_ULTRA STRIPE_PRICE_BUYER_PLUS STRIPE_PRICE_BUYER_PREMIUM STRIPE_PRICE_BUYER_ULTRA AUCTION_SCHEDULER_ENABLED AUCTION_SCHEDULER_INTERVAL_MS AUCTION_SCHEDULER_BATCH_SIZE MARKETPLACE_RESERVATION_SCHEDULER_ENABLED MARKETPLACE_RESERVATION_SCHEDULER_INTERVAL_MS MARKETPLACE_RESERVATION_SCHEDULER_BATCH_SIZE MARKETPLACE_RESERVATION_TTL_MINUTES READINESS_TIMEOUT_MS)
for name in "${required[@]}"; do
  use_fixture staging-valid.env; set_value "$name" ""; expect_fail "missing $name"
  use_fixture staging-valid.env; set_value "$name" "replace_me"; expect_fail "placeholder $name"
done

numeric_settings=(AUTH_RATE_LIMIT_WINDOW_MS AUTH_RATE_LIMIT_IP_MAX AUTH_RATE_LIMIT_SENSITIVE_IP_MAX AUTH_RATE_LIMIT_IDENTIFIER_MAX AUTH_RATE_LIMIT_COMBINED_MAX SMTP_PORT AUCTION_SCHEDULER_INTERVAL_MS AUCTION_SCHEDULER_BATCH_SIZE MARKETPLACE_RESERVATION_SCHEDULER_INTERVAL_MS MARKETPLACE_RESERVATION_SCHEDULER_BATCH_SIZE MARKETPLACE_RESERVATION_TTL_MINUTES READINESS_TIMEOUT_MS)
for name in "${numeric_settings[@]}"; do
  use_fixture staging-valid.env; set_value "$name" 0; expect_fail "zero $name"
  use_fixture staging-valid.env; set_value "$name" malformed; expect_fail "malformed $name"
done

boolean_settings=(INVITE_ONLY_REGISTRATION_ENABLED AUTH_RATE_LIMIT_ENABLED SMTP_SECURE AUCTION_SCHEDULER_ENABLED MARKETPLACE_RESERVATION_SCHEDULER_ENABLED)
for name in "${boolean_settings[@]}"; do
  use_fixture staging-valid.env; set_value "$name" yes; expect_fail "malformed boolean $name"
done
for name in INVITE_ONLY_REGISTRATION_ENABLED AUTH_RATE_LIMIT_ENABLED; do
  use_fixture staging-valid.env; set_value "$name" false; expect_fail "required enabled state $name"
done
for name in AUCTION_SCHEDULER_ENABLED MARKETPLACE_RESERVATION_SCHEDULER_ENABLED; do
  use_fixture staging-valid.env; set_value "$name" true; expect_fail "required disabled state $name"
done

stripe_prices=(STRIPE_PRICE_PRO STRIPE_PRICE_PREMIUM STRIPE_PRICE_ULTRA STRIPE_PRICE_BUYER_PLUS STRIPE_PRICE_BUYER_PREMIUM STRIPE_PRICE_BUYER_ULTRA)
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

echo "Staging readiness fixture tests passed (${#required[@]} required settings, expanded mode/origin/port/format coverage)."
