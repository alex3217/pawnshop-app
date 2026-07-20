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
