#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-${BASE_URL:-http://127.0.0.1:6002}}"
HEALTH_URL="${BASE_URL%/}/api/health"

printf 'Checking deployment health: %s\n' "$HEALTH_URL"

BODY="$(curl -sS "$HEALTH_URL")"

printf '%s\n' "$BODY" | jq .

printf '%s\n' "$BODY" | node -e '
let input = "";
process.stdin.on("data", (chunk) => input += chunk);
process.stdin.on("end", () => {
  const json = JSON.parse(input || "{}");
  if (!json.ok && !json.success) {
    console.error("Health check failed.");
    process.exit(1);
  }

  console.log(`✅ Healthy: ${json.service || "service"} ${json.env || ""}`);
});
'
