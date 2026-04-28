#!/usr/bin/env bash
set -euo pipefail

WEB_PORT="${WEB_PORT:-5176}"
API_PORT="${API_PORT:-6002}"
WEB_URL="http://127.0.0.1:${WEB_PORT}"
API_URL="http://127.0.0.1:${API_PORT}"

echo "Checking backend..."
curl -fsS "${API_URL}/api/health" >/dev/null || curl -fsS "${API_URL}/health" >/dev/null

echo "Checking frontend..."
curl -fsS "${WEB_URL}" >/dev/null

echo "Checking frontend proxy auth..."
curl -fsS -X POST "${WEB_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"buyer@pawn.local","password":"Buyer123!"}' \
  | node -e '
let s="";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  const j = JSON.parse(s);
  if (!j.token || !j.user) {
    console.error("Proxy auth failed: missing token/user");
    process.exit(1);
  }
  console.log("OK:", j.user.email, j.user.role);
});
'

echo "Checking forbidden stale port references..."
if rg -n "127\.0\.0\.1:6001|localhost:6001|VITE_API_TARGET.*6001" apps/web --glob '!node_modules'; then
  echo "ERROR: frontend still references old backend port 6001"
  exit 1
fi

echo "✅ Dev wiring locked: frontend ${WEB_PORT} -> backend ${API_PORT}"
