#!/usr/bin/env bash
set -euo pipefail

API_URL="${STAGING_API_URL:-}"
EXPECTED_SERVICE="pawnloop-api"
EXPECTED_ENV="staging"

if [ -z "$API_URL" ]; then
  echo "STAGING_API_URL is required (for example, the canonical Render API origin)." >&2
  exit 1
fi

NORMALIZED_API_URL="$(node -e '
  try {
    const url = new URL(process.argv[1]);
    const raw = process.argv[1];
    const withoutTrailingSlash = raw.endsWith("/") ? raw.slice(0, -1) : raw;
    if (
      url.protocol !== "https:" || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash ||
      withoutTrailingSlash !== url.origin
    ) process.exit(1);
    process.stdout.write(url.origin);
  } catch { process.exit(1); }
' "$API_URL")" || {
  echo "STAGING_API_URL must be a credential-free HTTPS origin with no path, query, or fragment." >&2
  exit 1
}

if [ "${1:-}" = "--validate-url-only" ]; then
  echo "STAGING_API_URL format is valid."
  exit 0
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

check_endpoint() {
  local endpoint="$1"
  local expected_ready="$2"
  local headers="$TMP_DIR/headers"
  local body="$TMP_DIR/body"
  local status

  status="$(curl --silent --show-error --max-redirs 0 --request GET \
    --connect-timeout 5 --max-time 15 \
    --dump-header "$headers" --output "$body" --write-out '%{http_code}' \
    "${NORMALIZED_API_URL}${endpoint}")"

  RESPONSE_STATUS="$status" RESPONSE_HEADERS="$headers" RESPONSE_BODY="$body" \
    EXPECTED_SERVICE="$EXPECTED_SERVICE" EXPECTED_ENV="$EXPECTED_ENV" EXPECTED_READY="$expected_ready" \
    node <<'NODE'
const fs = require("node:fs");
const status = process.env.RESPONSE_STATUS;
const headers = fs.readFileSync(process.env.RESPONSE_HEADERS, "utf8").toLowerCase();
let body;
try { body = JSON.parse(fs.readFileSync(process.env.RESPONSE_BODY, "utf8")); }
catch { console.error("Response body was not valid JSON."); process.exit(1); }
const failures = [];
if (status !== "200") failures.push("HTTP status must be 200");
if (body.ok !== true || body.success !== true) failures.push("health identity must report success");
if (body.service !== process.env.EXPECTED_SERVICE) failures.push("service identity did not match");
if (body.env !== process.env.EXPECTED_ENV) failures.push("environment identity did not match");
if (process.env.EXPECTED_READY === "true" && (body.ready !== true || body.dependencies?.database !== "ok")) failures.push("readiness/database state was not ready");
if (!/(?:^|\r?\n)cache-control:\s*[^\r\n]*no-store/i.test(headers)) failures.push("Cache-Control must include no-store");
if (!/(?:^|\r?\n)x-content-type-options:\s*nosniff/i.test(headers)) failures.push("X-Content-Type-Options must be nosniff");
if (/(?:^|\r?\n)x-powered-by:/i.test(headers)) failures.push("X-Powered-By must not be exposed");
if (failures.length) { for (const failure of failures) console.error(`- ${failure}`); process.exit(1); }
NODE
  echo "Passed ${endpoint} staging smoke check."
}

check_endpoint "/api/health" false
check_endpoint "/api/ready" true
echo "Staging smoke check passed (read-only endpoints only)."
