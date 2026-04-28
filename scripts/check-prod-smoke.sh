#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:6001}"
API_URL="${BASE_URL%/}/api"

request_json() {
  local label="$1"
  local url="$2"

  echo ""
  echo "Checking $label..."
  body="$(curl -sS "$url")"

  echo "$body" | jq .

  echo "$body" | node -e '
    let input = "";
    process.stdin.on("data", (chunk) => input += chunk);
    process.stdin.on("end", () => {
      try {
        JSON.parse(input || "{}");
        process.exit(0);
      } catch {
        console.error("Response was not valid JSON.");
        process.exit(1);
      }
    });
  '

  echo "✅ $label"
}

request_json "production health" "$API_URL/health"
request_json "public items" "$API_URL/items?limit=5"
request_json "public auctions" "$API_URL/auctions?limit=5"

echo ""
echo "✅ Production smoke test passed."
