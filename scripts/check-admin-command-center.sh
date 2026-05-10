#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:6002/api}"
WEB_BASE="${WEB_BASE:-http://127.0.0.1:5176}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin1@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin123}"

echo "===== ADMIN COMMAND CENTER CHECK ====="
echo "BASE_URL=$BASE_URL"
echo "WEB_BASE=$WEB_BASE"

npm run build:web >/tmp/admin-command-center-build.txt
echo "✅ build:web passed"

npm run check:dev-safe >/tmp/admin-command-center-dev-safe.txt
echo "✅ check:dev-safe passed"

ADMIN_TOKEN="$(
  curl -sS -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
    | node -e '
      let s="";
      process.stdin.on("data", d => s += d);
      process.stdin.on("end", () => {
        const j = JSON.parse(s);
        process.stdout.write(j.token || j.accessToken || j.data?.token || j.data?.accessToken || "");
      });
    '
)"

if [ -z "$ADMIN_TOKEN" ]; then
  echo "❌ Admin login failed"
  exit 1
fi

echo "✅ Admin login"

for path in \
  /auth/me \
  /admin/users \
  /admin/items \
  /admin/shops \
  /admin/subscriptions \
  /settlements
do
  curl -sS -f "$BASE_URL$path" \
    -H "Authorization: Bearer $ADMIN_TOKEN" >/dev/null
  echo "✅ GET $path"
done

for path in \
  /admin \
  /admin/risk \
  /admin/support \
  /admin/system \
  /admin/audit \
  /admin/orders
do
  STATUS="$(
    curl -sS -o /tmp/admin-page.html -w "%{http_code}" "$WEB_BASE$path"
  )"

  if [ "$STATUS" != "200" ]; then
    echo "❌ $path failed: $STATUS"
    exit 1
  fi

  echo "✅ $path reachable"
done

rg -n "Admin Command Center|Risk Center|Support Center|Operational Notes|Settlement Queue|System Status" \
  apps/web/src/admin/pages/AdminOverviewPage.tsx \
  apps/web/src/admin/pages/AdminWorkspacePage.tsx

echo "✅ ADMIN COMMAND CENTER CHECK PASSED"
