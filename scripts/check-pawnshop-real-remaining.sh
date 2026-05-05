#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

TS="$(date +%Y%m%d-%H%M%S)"
OUT="reports/pawnshop-real-remaining-$TS"
mkdir -p "$OUT"

echo "===== PAWNSHOP REAL REMAINING WORK AUDIT ====="
echo "Repo: $ROOT"
echo "Report: $OUT"
echo ""

echo "===== 1. APP HEALTH SIGNALS =====" | tee "$OUT/01-health-signals.txt"

{
  echo "Build:"
  npm run build:web >/tmp/pawnshop-build-real.log 2>&1 && echo "✅ build:web passed" || echo "❌ build:web failed"

  echo ""
  echo "Dev-safe:"
  npm run check:dev-safe >/tmp/pawnshop-devsafe-real.log 2>&1 && echo "✅ check:dev-safe passed" || echo "❌ check:dev-safe failed"

  echo ""
  echo "Role routes:"
  SUPER_ADMIN_EMAIL='superadmin@pawn.local' SUPER_ADMIN_PASSWORD='SuperAdmin123!' npm run check:role-routes >/tmp/pawnshop-role-routes-real.log 2>&1 && echo "✅ check:role-routes passed" || echo "❌ check:role-routes failed"

  echo ""
  echo "Backend health:"
  curl -fsS http://127.0.0.1:6002/api/health >/dev/null && echo "✅ backend 6002 healthy" || echo "❌ backend 6002 unhealthy"

  echo ""
  echo "Frontend health:"
  curl -fsS http://127.0.0.1:5176 >/dev/null && echo "✅ frontend 5176 reachable" || echo "❌ frontend 5176 unreachable"
} | tee -a "$OUT/01-health-signals.txt"

echo ""
echo "===== 2. REAL UI PLACEHOLDERS / STUBS =====" | tee "$OUT/02-real-ui-stubs.txt"

(
  rg -n --hidden \
    --glob '!node_modules/**' \
    --glob '!.git/**' \
    --glob '!dist/**' \
    --glob '!build/**' \
    --glob '!coverage/**' \
    --glob '!reports/**' \
    --glob '!package-lock.json' \
    --glob '!apps/web/src/services/auth.ts' \
    --glob '!scripts/check-dashboards.sh' \
    --glob '!reports/**' \
    --glob '!scripts/check-pawnshop-real-remaining.sh' \
    --glob '!scripts/check-pawnshop-progress.sh' \
    --glob '!scripts/audit-pawnshop-cleanliness.sh' \
    --glob '!scripts/guard-ports.sh' \
    --glob '!scripts/check-process-boundaries.sh' \
    -i 'scaffold stub|Replace with real UI|FeaturePlaceholderPage|placeholderRoute|adminPlaceholderRoutes|coming soon|not implemented|mock data' \
    apps/web/src apps/api/backend/src 2>/dev/null || true
) | tee -a "$OUT/02-real-ui-stubs.txt"

echo ""
echo "===== 3. TODO / FIXME ONLY =====" | tee "$OUT/03-todo-fixme.txt"

(
  rg -n --hidden \
    --glob '!node_modules/**' \
    --glob '!.git/**' \
    --glob '!dist/**' \
    --glob '!build/**' \
    --glob '!coverage/**' \
    --glob '!reports/**' \
    --glob '!package-lock.json' \
    --glob '!apps/web/src/services/auth.ts' \
    --glob '!scripts/check-dashboards.sh' \
    --glob '!reports/**' \
    --glob '!scripts/check-pawnshop-real-remaining.sh' \
    --glob '!scripts/check-pawnshop-progress.sh' \
    --glob '!scripts/audit-pawnshop-cleanliness.sh' \
    --glob '!scripts/guard-ports.sh' \
    --glob '!scripts/check-process-boundaries.sh' \
    -i '\bTODO\b|\bFIXME\b|\bHACK\b' \
    apps/web/src apps/api/backend/src scripts 2>/dev/null || true
) | tee -a "$OUT/03-todo-fixme.txt"

echo ""
echo "===== 4. LEGACY APP LEFTOVERS — WORD-BOUNDARY SAFE =====" | tee "$OUT/04-legacy-leftovers.txt"

(
  rg -n --hidden \
    --glob '!node_modules/**' \
    --glob '!.git/**' \
    --glob '!dist/**' \
    --glob '!build/**' \
    --glob '!coverage/**' \
    --glob '!reports/**' \
    --glob '!package-lock.json' \
    --glob '!apps/web/src/services/auth.ts' \
    --glob '!scripts/check-dashboards.sh' \
    --glob '!reports/**' \
    --glob '!scripts/check-pawnshop-real-remaining.sh' \
    --glob '!scripts/check-pawnshop-progress.sh' \
    --glob '!scripts/audit-pawnshop-cleanliness.sh' \
    --glob '!scripts/guard-ports.sh' \
    --glob '!scripts/check-process-boundaries.sh' \
    --glob '!scripts/audit-pawnshop-cleanliness.sh' \
    --glob '!scripts/check-pawnshop-progress.sh' \
    -i '\b(tire-marketplace|tire marketplace|tireshop|tire shop|tire|tires|tyre|tyres|live tire|tire locator|tire bidding|tire subscription|tire warranty|tire inventory|tread|tpms|sequelize|mongoose|redisClient|redisUtils|dev-5002|prod-5001|5001|5002|5003)\b|/api/tires' \
    . 2>/dev/null || true
) | tee -a "$OUT/04-legacy-leftovers.txt"

echo ""
echo "===== 5. FRONTEND RAW NETWORK CALLS OUTSIDE APPROVED GATEWAYS =====" | tee "$OUT/05-network-debt.txt"

(
  rg -n --hidden \
    --glob '!node_modules/**' \
    --glob '!.git/**' \
    --glob '!dist/**' \
    --glob '!build/**' \
    'fetch\(|axios\.|XMLHttpRequest' \
    apps/web/src 2>/dev/null \
    | rg -v 'apps/web/src/services/apiClient.ts|apps/web/src/admin/services/adminApi.ts|apps/web/src/services/auth.ts' \
    || true
) | tee -a "$OUT/05-network-debt.txt"

echo ""
echo "===== 6. SOCKET USAGE =====" | tee "$OUT/06-socket-usage.txt"

(
  rg -n --hidden \
    --glob '!node_modules/**' \
    --glob '!.git/**' \
    --glob '!dist/**' \
    --glob '!build/**' \
    'io\(|socket\.|Socket' \
    apps/web/src apps/api/backend/src 2>/dev/null || true
) | tee -a "$OUT/06-socket-usage.txt"

echo ""
echo "===== 7. COUNTS =====" | tee "$OUT/07-counts.txt"

count_issue_lines() {
  local file="$1"
  if [ ! -f "$file" ]; then
    echo "0"
    return
  fi

  grep -Ev '^$|^=====|^```' "$file" | wc -l | tr -d ' '
}

REAL_STUBS="$(count_issue_lines "$OUT/02-real-ui-stubs.txt")"
TODO_FIXME="$(count_issue_lines "$OUT/03-todo-fixme.txt")"
REAL_LEGACY="$(count_issue_lines "$OUT/04-legacy-leftovers.txt")"
NETWORK_DEBT="$(count_issue_lines "$OUT/05-network-debt.txt")"

{
  echo "Real UI stub/placeholder hits: $REAL_STUBS"
  echo "TODO/FIXME/HACK hits: $TODO_FIXME"
  echo "Real legacy app leftovers: $REAL_LEGACY"

echo "Network calls outside approved gateways: $NETWORK_DEBT"
} | tee -a "$OUT/07-counts.txt"

echo ""
echo "✅ Real remaining-work audit complete."
echo "Report folder:"
echo "$OUT"
