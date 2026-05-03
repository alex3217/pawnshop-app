#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

TS="$(date +%Y%m%d-%H%M%S)"
OUT="reports/pawnshop-progress-$TS"
SUMMARY="$OUT/SUMMARY.md"

mkdir -p "$OUT"

section() {
  echo "" | tee -a "$SUMMARY"
  echo "## $1" | tee -a "$SUMMARY"
  echo "" | tee -a "$SUMMARY"
}

capture() {
  local name="$1"
  shift
  section "$name"
  {
    echo '```txt'
    echo "$ $*"
    "$@" || true
    echo '```'
  } | tee "$OUT/$name.txt" | tee -a "$SUMMARY" >/dev/null
}

count_files() {
  local dir="$1"
  local pattern="$2"
  if [ -d "$dir" ]; then
    find "$dir" -type f \( -name "$pattern" \) 2>/dev/null | wc -l | tr -d ' '
  else
    echo "0"
  fi
}

count_rg() {
  local pattern="$1"
  shift
  (rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' --glob '!dist/**' --glob '!build/**' --glob '!coverage/**' "$pattern" "$@" 2>/dev/null || true) | wc -l | tr -d ' '
}

echo "# Pawnshop App Progress Report" > "$SUMMARY"
echo "" >> "$SUMMARY"
echo "- Repo: $ROOT" >> "$SUMMARY"
echo "- Date: $(date)" >> "$SUMMARY"
echo "- Expected backend dev port: 6002" >> "$SUMMARY"
echo "- Expected prod-like backend port: 6001" >> "$SUMMARY"
echo "- Expected frontend dev port: 5176" >> "$SUMMARY"
echo "- Expected health endpoint: /api/health" >> "$SUMMARY"

section "Executive Scorecard"

WEB_PAGES="$(count_files apps/web/src/pages '*.tsx')"
WEB_SERVICES="$(count_files apps/web/src/services '*.ts')"
BACKEND_ROUTES="$(count_files apps/api/backend/src/routes '*.js')"
BACKEND_CONTROLLERS="$(count_files apps/api/backend/src/controllers '*.js')"
PRISMA_MODELS="$((rg -n '^model ' apps/api/backend/prisma/schema.prisma 2>/dev/null || true) | wc -l | tr -d ' ')"
PRISMA_ENUMS="$((rg -n '^enum ' apps/api/backend/prisma/schema.prisma 2>/dev/null || true) | wc -l | tr -d ' ')"
MIGRATIONS="$(find apps/api/backend/prisma/migrations -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l | tr -d ' ' || echo 0)"
TODO_COUNT="$(count_rg 'TODO|FIXME|HACK|scaffold stub|Replace with real UI|Not implemented|throw new Error' .)"
RAW_FETCH_PAGES="$((rg -n 'fetch\(' apps/web/src/pages 2>/dev/null || true) | wc -l | tr -d ' ')"
TIRE_LEFTOVERS="$(rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' --glob '!reports/**' --glob '!dist/**' --glob '!build/**' -i 'tire-marketplace|tire marketplace|tireshop|tire shop|tires?|sequelize|mongoose|dev-5002|5001|5002|5003|/api/tires' . 2>/dev/null | wc -l | tr -d ' ' || echo 0)"

cat <<REPORT | tee -a "$SUMMARY"
| Area | Current Count / Signal |
|---|---:|
| Frontend pages | $WEB_PAGES |
| Frontend services | $WEB_SERVICES |
| Backend route files | $BACKEND_ROUTES |
| Backend controller files | $BACKEND_CONTROLLERS |
| Prisma models | $PRISMA_MODELS |
| Prisma enums | $PRISMA_ENUMS |
| Prisma migrations | $MIGRATIONS |
| TODO / stub / not-implemented hits | $TODO_COUNT |
| Raw fetch calls inside pages | $RAW_FETCH_PAGES |
| Tire Marketplace leftover hits | $TIRE_LEFTOVERS |

REPORT

if [ "$TIRE_LEFTOVERS" -gt 0 ]; then
  echo "⚠️ Tire Marketplace leftovers detected. Review the contamination section." | tee -a "$SUMMARY"
else
  echo "✅ No obvious Tire Marketplace leftovers found outside ignored folders." | tee -a "$SUMMARY"
fi

if [ "$RAW_FETCH_PAGES" -gt 0 ]; then
  echo "⚠️ Raw fetch exists in frontend pages. Move page calls into services/apiClient." | tee -a "$SUMMARY"
else
  echo "✅ No raw fetch calls found inside frontend pages." | tee -a "$SUMMARY"
fi

if [ "$TODO_COUNT" -gt 0 ]; then
  echo "⚠️ TODO/stub/not-implemented debt exists. Review the debt section." | tee -a "$SUMMARY"
else
  echo "✅ No obvious TODO/stub/not-implemented markers found." | tee -a "$SUMMARY"
fi

capture "01 Git Status" git status --short
capture "02 Current Branch" git branch --show-current
capture "03 Recent Commits" git log --oneline --decorate -n 40
capture "04 PM2 Processes" pm2 ls
capture "05 Listening Ports" bash -lc "lsof -iTCP -sTCP:LISTEN -n -P | egrep ':(6001|6002|6003|5176|5173|5001|5002|5003)\\b' || true"

section "06 Runtime Health"
{
  echo '```txt'
  echo "Backend dev health: http://127.0.0.1:6002/api/health"
  curl -i --max-time 5 http://127.0.0.1:6002/api/health || true
  echo ""
  echo "Backend prod-like health: http://127.0.0.1:6001/api/health"
  curl -i --max-time 5 http://127.0.0.1:6001/api/health || true
  echo ""
  echo "Frontend dev: http://127.0.0.1:5176"
  curl -I --max-time 5 http://127.0.0.1:5176 || true
  echo '```'
} | tee "$OUT/06-runtime-health.txt" | tee -a "$SUMMARY" >/dev/null

section "07 Public Endpoint Smoke Test"
{
  echo '```txt'
  for url in \
    "http://127.0.0.1:6002/api/health" \
    "http://127.0.0.1:6002/api/items?limit=5" \
    "http://127.0.0.1:6002/api/auctions?limit=5" \
    "http://127.0.0.1:6002/api/shops?limit=5" \
    "http://127.0.0.1:6002/api/locations?limit=5" \
    "http://127.0.0.1:6002/api/seller-plans" \
    "http://127.0.0.1:6002/api/buyer-plans"
  do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 "$url" || true)"
    echo "$code  $url"
  done
  echo '```'
} | tee "$OUT/07-public-endpoints.txt" | tee -a "$SUMMARY" >/dev/null

section "08 Package Scripts"
{
  echo '```json'
  node - <<'NODE'
const fs = require("fs");
for (const file of ["package.json", "apps/api/backend/package.json", "apps/web/package.json", "apps/mobile/package.json"]) {
  if (!fs.existsSync(file)) continue;
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  console.log(JSON.stringify({
    file,
    name: pkg.name,
    scripts: pkg.scripts || {}
  }, null, 2));
}
NODE
  echo '```'
} | tee "$OUT/08-package-scripts.txt" | tee -a "$SUMMARY" >/dev/null

section "09 Frontend Pages"
{
  echo '```txt'
  find apps/web/src/pages -type f \( -name "*.tsx" -o -name "*.ts" -o -name "*.jsx" -o -name "*.js" \) 2>/dev/null | sort
  echo '```'
} | tee "$OUT/09-frontend-pages.txt" | tee -a "$SUMMARY" >/dev/null

section "10 Frontend Services"
{
  echo '```txt'
  find apps/web/src/services -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) 2>/dev/null | sort
  echo '```'
} | tee "$OUT/10-frontend-services.txt" | tee -a "$SUMMARY" >/dev/null

section "11 Backend Routes And Controllers"
{
  echo '```txt'
  echo "Routes:"
  find apps/api/backend/src/routes -type f 2>/dev/null | sort || true
  echo ""
  echo "Controllers:"
  find apps/api/backend/src/controllers -type f 2>/dev/null | sort || true
  echo '```'
} | tee "$OUT/11-backend-routes-controllers.txt" | tee -a "$SUMMARY" >/dev/null

section "12 Route Mounts"
{
  echo '```txt'
  rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' 'app\.use|router\.(get|post|put|patch|delete)|/api/|/health|/items|/auctions|/shops|/locations|/offers|/settlements|/auth|/stripe|/admin|/owner|/users' apps/api/backend/src apps/web/src 2>/dev/null || true
  echo '```'
} | tee "$OUT/12-route-mounts.txt" | tee -a "$SUMMARY" >/dev/null

section "13 Prisma Schema And Migrations"
{
  echo '```txt'
  echo "Models and enums:"
  rg -n '^(model|enum) ' apps/api/backend/prisma/schema.prisma 2>/dev/null || true
  echo ""
  echo "Migrations:"
  find apps/api/backend/prisma/migrations -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort || true
  echo '```'
} | tee "$OUT/13-prisma-schema-migrations.txt" | tee -a "$SUMMARY" >/dev/null

section "14 Implementation Debt"
{
  echo '```txt'
  rg -n --hidden \
    --glob '!node_modules/**' \
    --glob '!.git/**' \
    --glob '!dist/**' \
    --glob '!build/**' \
    --glob '!coverage/**' \
    --glob '!reports/**' \
    -i 'TODO|FIXME|HACK|scaffold stub|Replace with real UI|Not implemented|coming soon|placeholder|mock data|throw new Error' \
    . || true
  echo '```'
} | tee "$OUT/14-implementation-debt.txt" | tee -a "$SUMMARY" >/dev/null

section "15 Architecture Debt"
{
  echo '```txt'
  echo "Raw fetch/axios/WebSocket usage:"
  rg -n --hidden \
    --glob '!node_modules/**' \
    --glob '!.git/**' \
    --glob '!dist/**' \
    --glob '!build/**' \
    'fetch\(|axios\.|XMLHttpRequest|new WebSocket|io\(' \
    apps/web/src apps/api/backend/src 2>/dev/null || true
  echo '```'
} | tee "$OUT/15-architecture-debt.txt" | tee -a "$SUMMARY" >/dev/null

section "16 Tire Marketplace Contamination Check"
{
  echo '```txt'
  rg -n --hidden \
    --glob '!node_modules/**' \
    --glob '!.git/**' \
    --glob '!dist/**' \
    --glob '!build/**' \
    --glob '!coverage/**' \
    --glob '!reports/**' \
    -i 'tire-marketplace|tire marketplace|tireshop|tire shop|tires?|live tire|tire locator|tire bidding|tire subscription|tire warranty|tire inventory|tread|tpms|wheel|rim|vehicle profile|sequelize|mongoose|redisClient|redisUtils|dev-5002|prod-5001|5001|5002|5003|/api/tires' \
    . || true
  echo '```'
} | tee "$OUT/16-contamination-check.txt" | tee -a "$SUMMARY" >/dev/null

section "17 Safe Env Key Inventory"
{
  echo '```txt'
  echo "Only env KEY names are printed. Values are not exposed."
  for f in .env .env.* apps/api/backend/.env apps/api/backend/.env.* apps/web/.env apps/web/.env.*; do
    if [ -f "$f" ]; then
      echo ""
      echo "----- $f -----"
      sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' "$f" | sort
    fi
  done
  echo '```'
} | tee "$OUT/17-env-keys-safe.txt" | tee -a "$SUMMARY" >/dev/null

section "18 Build And Safety Checks"
{
  echo '```txt'

  echo "Running npm run build:web..."
  npm run build:web || true

  echo ""
  echo "Running npm run check:dev-safe..."
  npm run check:dev-safe || true

  echo ""
  echo "Running optional npm run check:role-routes if available..."
  node -e '
    const pkg = require("./package.json");
    process.exit(pkg.scripts && pkg.scripts["check:role-routes"] ? 0 : 1);
  ' && npm run check:role-routes || echo "No root check:role-routes script found or role-route check failed."

  echo '```'
} | tee "$OUT/18-build-safety-checks.txt" | tee -a "$SUMMARY" >/dev/null

section "19 Completion Estimate"
{
  BUILD_OK="unknown"
  DEV_SAFE_OK="unknown"
  BACKEND_OK="unknown"
  FRONTEND_OK="unknown"

  npm run build:web >/tmp/pawnshop-build-check.log 2>&1 && BUILD_OK="yes" || BUILD_OK="no"
  npm run check:dev-safe >/tmp/pawnshop-devsafe-check.log 2>&1 && DEV_SAFE_OK="yes" || DEV_SAFE_OK="no"
  curl -fsS --max-time 5 http://127.0.0.1:6002/api/health >/dev/null 2>&1 && BACKEND_OK="yes" || BACKEND_OK="no"
  curl -fsS --max-time 5 http://127.0.0.1:5176 >/dev/null 2>&1 && FRONTEND_OK="yes" || FRONTEND_OK="no"

  SCORE=0
  TOTAL=10

  [ "$BUILD_OK" = "yes" ] && SCORE=$((SCORE+1))
  [ "$DEV_SAFE_OK" = "yes" ] && SCORE=$((SCORE+1))
  [ "$BACKEND_OK" = "yes" ] && SCORE=$((SCORE+1))
  [ "$FRONTEND_OK" = "yes" ] && SCORE=$((SCORE+1))
  [ "$PRISMA_MODELS" -ge 10 ] && SCORE=$((SCORE+1))
  [ "$MIGRATIONS" -ge 1 ] && SCORE=$((SCORE+1))
  [ "$WEB_PAGES" -ge 20 ] && SCORE=$((SCORE+1))
  [ "$WEB_SERVICES" -ge 8 ] && SCORE=$((SCORE+1))
  [ "$RAW_FETCH_PAGES" -eq 0 ] && SCORE=$((SCORE+1))
  [ "$TIRE_LEFTOVERS" -eq 0 ] && SCORE=$((SCORE+1))

  PERCENT=$((SCORE * 100 / TOTAL))
  LEFT=$((100 - PERCENT))

  cat <<DONE
| Check | Result |
|---|---|
| Build passes | $BUILD_OK |
| Dev-safe passes | $DEV_SAFE_OK |
| Backend 6002 health | $BACKEND_OK |
| Frontend 5176 reachable | $FRONTEND_OK |
| Progress signal score | $SCORE / $TOTAL |
| Rough technical completion signal | $PERCENT% |
| Rough remaining technical risk | $LEFT% |

This percentage is not a final business/MVP completion number. It is a codebase health and wiring signal based on build, runtime, schema, frontend, services, architecture debt, and contamination checks.
DONE
} | tee "$OUT/19-completion-estimate.txt" | tee -a "$SUMMARY" >/dev/null

echo ""
echo "✅ Pawnshop progress report complete."
echo ""
echo "Report folder:"
echo "$OUT"
echo ""
echo "Main summary:"
echo "$SUMMARY"
