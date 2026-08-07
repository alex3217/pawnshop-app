#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:6001}"
API_URL="${BASE_URL%/}/api"
CURL_CONNECT_TIMEOUT_SECONDS="${CURL_CONNECT_TIMEOUT_SECONDS-5}"
CURL_MAX_TIME_SECONDS="${CURL_MAX_TIME_SECONDS-15}"

validate_timeout() {
  local name="$1"
  local value="$2"
  local maximum="$3"

  if ! [[ "$value" =~ ^[1-9][0-9]*$ ]] || [ "$value" -gt "$maximum" ]; then
    echo "$name must be a positive whole number no greater than $maximum." >&2
    exit 1
  fi
}

validate_timeout "CURL_CONNECT_TIMEOUT_SECONDS" "$CURL_CONNECT_TIMEOUT_SECONDS" 60
validate_timeout "CURL_MAX_TIME_SECONDS" "$CURL_MAX_TIME_SECONDS" 300

if [ "$CURL_CONNECT_TIMEOUT_SECONDS" -gt "$CURL_MAX_TIME_SECONDS" ]; then
  echo "CURL_CONNECT_TIMEOUT_SECONDS must not exceed CURL_MAX_TIME_SECONDS." >&2
  exit 1
fi

CURL_ARGS=(
  -sS
  --connect-timeout "$CURL_CONNECT_TIMEOUT_SECONDS"
  --max-time "$CURL_MAX_TIME_SECONDS"
)

request_json() {
  local label="$1"
  local url="$2"

  echo ""
  echo "Checking $label..."
  body="$(curl "${CURL_ARGS[@]}" "$url")"

  echo "$body" | jq .

  echo "$body" | node -e '
    let input = "";
    process.stdin.on("data", (chunk) => input += chunk);
    process.stdin.on("end", () => {
      let json;
      try {
        json = JSON.parse(input || "{}");
      } catch {
        console.error("Response was not valid JSON.");
        process.exit(1);
      }

      if (json && typeof json === "object" && json.error) {
        console.error("Response contained an error field.");
        console.error(String(json.error));
        process.exit(1);
      }

      if (json && typeof json === "object" && json.success === false) {
        console.error("Response reported success=false.");
        process.exit(1);
      }

      if (json && typeof json === "object" && json.ok === false) {
        console.error("Response reported ok=false.");
        process.exit(1);
      }

      process.exit(0);
    });
  '

  echo "✅ $label"
}

request_json "production health" "$API_URL/health"
request_json "production readiness" "$API_URL/ready"
request_json "public items" "$API_URL/items?limit=5"
request_json "public auctions" "$API_URL/auctions?limit=5"

echo ""
echo "✅ Production smoke test passed."
