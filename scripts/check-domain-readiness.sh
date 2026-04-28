#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-pawnloop.com}"
WWW_DOMAIN="${WWW_DOMAIN:-www.pawnloop.com}"
API_DOMAIN="${API_DOMAIN:-api.pawnloop.com}"

check_dns() {
  local label="$1"
  local host="$2"

  echo ""
  echo "Checking DNS for $label: $host"

  if command -v dig >/dev/null 2>&1; then
    dig +short "$host" || true
  else
    nslookup "$host" || true
  fi
}

check_https_json() {
  local label="$1"
  local url="$2"

  echo ""
  echo "Checking HTTPS JSON for $label: $url"

  BODY="$(curl -sS --max-time 10 "$url")"

  echo "$BODY" | jq .

  echo "$BODY" | node -e '
    let input = "";
    process.stdin.on("data", (chunk) => input += chunk);
    process.stdin.on("end", () => {
      const json = JSON.parse(input || "{}");
      if (!json.ok && !json.success) {
        console.error("Endpoint did not report ok/success.");
        process.exit(1);
      }
      console.log("✅ JSON health response is healthy.");
    });
  '
}

check_dns "frontend root" "$DOMAIN"
check_dns "frontend www" "$WWW_DOMAIN"
check_dns "backend api" "$API_DOMAIN"

echo ""
echo "DNS checks complete."

echo ""
echo "Checking API health if HTTPS is already configured..."
check_https_json "production API health" "https://${API_DOMAIN}/api/health"

echo ""
echo "✅ Domain readiness check passed."
