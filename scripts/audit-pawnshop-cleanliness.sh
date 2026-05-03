#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

TS="$(date +%Y%m%d-%H%M%S)"
OUT="reports/pawnshop-cleanliness-$TS"
mkdir -p "$OUT"

print_section() {
  printf '\n\n==============================\n%s\n==============================\n' "$1" | tee -a "$OUT/SUMMARY.txt"
}

run_capture() {
  local name="$1"
  shift
  print_section "$name"
  {
    echo "$ $*"
    "$@" || true
  } 2>&1 | tee "$OUT/$name.txt" | tee -a "$OUT/SUMMARY.txt" >/dev/null
}

print_section "PAWNSHOP APPLICATION CLEANLINESS AUDIT"
{
  echo "Repo root: $ROOT"
  echo "Timestamp: $TS"
  echo "Expected app: Pawnshop / auction marketplace"
  echo "Expected backend dev port: 6002"
  echo "Expected backend prod-like port: 6001"
  echo "Expected frontend dev port: 5176"
  echo "Expected health endpoint: /api/health"
} | tee -a "$OUT/SUMMARY.txt"

run_capture "01-git-status" git status --short
run_capture "02-git-branch" git branch --show-current
run_capture "03-git-remotes" git remote -v
run_capture "04-recent-commits" git log --oneline --decorate -n 60

print_section "05-filesystem-overview"
{
  echo "Top-level files/folders:"
  find . -maxdepth 2 \
    -not -path "./node_modules*" \
    -not -path "./.git*" \
    -not -path "./apps/web/node_modules*" \
    -not -path "./apps/api/backend/node_modules*" \
    -print | sort

  echo
  echo "Workspace/package files:"
  find . \
    -path "./node_modules" -prune -o \
    -path "./.git" -prune -o \
    -path "./apps/web/node_modules" -prune -o \
    -path "./apps/api/backend/node_modules" -prune -o \
    \( -name "package.json" -o -name "vite.config.*" -o -name "tsconfig*.json" -o -name "schema.prisma" -o -name ".env.example" -o -name ".env.development" -o -name ".env.production" \) \
    -print | sort
} | tee "$OUT/05-filesystem-overview.txt" | tee -a "$OUT/SUMMARY.txt" >/dev/null

print_section "06-package-scripts"
{
  for f in package.json apps/api/backend/package.json apps/web/package.json apps/mobile/package.json; do
    if [ -f "$f" ]; then
      echo
      echo "----- $f -----"
      node -e '
        const fs = require("fs");
        const file = process.argv[1];
        const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
        console.log(JSON.stringify({
          name: pkg.name,
          version: pkg.version,
          type: pkg.type,
          scripts: pkg.scripts || {},
          dependencies: Object.keys(pkg.dependencies || {}).sort(),
          devDependencies: Object.keys(pkg.devDependencies || {}).sort()
        }, null, 2));
      ' "$f"
    fi
  done
} | tee "$OUT/06-package-scripts.txt" | tee -a "$OUT/SUMMARY.txt" >/dev/null

print_section "07-critical-pawnshop-files"
{
  echo "Backend files:"
  find apps/api/backend -maxdepth 4 -type f \
    \( -name "*.js" -o -name "*.ts" -o -name "*.prisma" -o -name "*.json" \) \
    2>/dev/null | sort | head -300

  echo
  echo "Frontend files:"
  find apps/web/src -maxdepth 5 -type f \
    \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.css" \) \
    2>/dev/null | sort | head -400
} | tee "$OUT/07-critical-pawnshop-files.txt" | tee -a "$OUT/SUMMARY.txt" >/dev/null

print_section "08-tire-marketplace-contamination-scan"
{
  echo "Scanning for direct Tire Marketplace terms..."
  rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' --glob '!dist/**' --glob '!build/**' --glob '!coverage/**' \
    -i \
    'tire marketplace|tire-marketplace|tireshop|tire shop|tires?|tyres?|wheel|rim|vehicle profile|live tire|used tire|tire locator|tire bidding|tire subscription|tire warranty|tire inventory|tire age|tread|TPMS|redisClient|redisUtils|sequelize|mongoose|mongo|socket\.io.*tire|5001|5002|5003|dev-5002|prod-5001|frontend/src|backend/routes|backend/config|/api/tires|/api/shops/.*/tires' \
    . || true
} | tee "$OUT/08-tire-marketplace-contamination-scan.txt" | tee -a "$OUT/SUMMARY.txt" >/dev/null

print_section "09-port-and-url-scan"
{
  echo "Expected Pawnshop backend ports are 6001/6002."
  echo "Expected frontend dev port is commonly 5176."
  echo
  rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' --glob '!dist/**' --glob '!build/**' --glob '!coverage/**' \
    '127\.0\.0\.1:[0-9]+|localhost:[0-9]+|PORT=|VITE_|API_URL|BASE_URL|6001|6002|5176|5173|5001|5002|5003' \
    . || true
} | tee "$OUT/09-port-and-url-scan.txt" | tee -a "$OUT/SUMMARY.txt" >/dev/null

print_section "10-route-mount-scan"
{
  rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' --glob '!dist/**' --glob '!build/**' --glob '!coverage/**' \
    'app\.use|router\.(get|post|put|patch|delete)|/api/|/health|/auctions|/items|/shops|/locations|/seller-plans|/buyer-plans|/stripe|/webhook|/auth|/users|/admin|/owners|/offers|/settlements' \
    apps/api/backend apps/web/src package.json scripts 2>/dev/null || true
} | tee "$OUT/10-route-mount-scan.txt" | tee -a "$OUT/SUMMARY.txt" >/dev/null

print_section "11-frontend-raw-fetch-scan"
{
  echo "Rule: UI should use Services → API Client, not raw fetch in pages."
  rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' --glob '!dist/**' --glob '!build/**' \
    'fetch\(|axios\.|XMLHttpRequest|new WebSocket|io\(' \
    apps/web/src || true
} | tee "$OUT/11-frontend-raw-fetch-scan.txt" | tee -a "$OUT/SUMMARY.txt" >/dev/null

print_section "12-env-key-scan-safe-no-values"
{
  echo "Environment variable NAMES ONLY. Values are not printed."
  for f in .env .env.* apps/api/backend/.env apps/api/backend/.env.* apps/web/.env apps/web/.env.*; do
    if [ -f "$f" ]; then
      echo
      echo "----- $f -----"
      sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' "$f" | sort
    fi
  done
} | tee "$OUT/12-env-key-scan-safe-no-values.txt" | tee -a "$OUT/SUMMARY.txt" >/dev/null

print_section "13-prisma-schema-overview"
{
  if [ -f apps/api/backend/prisma/schema.prisma ]; then
    echo "Prisma models/enums:"
    rg -n '^(model|enum) ' apps/api/backend/prisma/schema.prisma || true
    echo
    echo "Any tire-related Prisma schema terms:"
    rg -n -i 'tire|tireshop|vehicle|wheel|rim|tread|sequelize|mongoose' apps/api/backend/prisma/schema.prisma || true
  else
    echo "No Prisma schema found at apps/api/backend/prisma/schema.prisma"
  fi
} | tee "$OUT/13-prisma-schema-overview.txt" | tee -a "$OUT/SUMMARY.txt" >/dev/null

print_section "14-git-history-tire-term-scan"
{
  echo "Recent commit messages containing suspicious Tire Marketplace terms:"
  git log --all --regexp-ignore-case --grep='tire\|tireshop\|sequelize\|mongoose\|5002\|5001\|tire-marketplace' --oneline --decorate -n 100 || true

  echo
  echo "Tracked files with suspicious names:"
  git ls-files | rg -i 'tire|tireshop|sequelize|mongoose|frontend/src|backend/routes|backend/config|redisClient|redisUtils|dev-5002|prod-5001' || true
} | tee "$OUT/14-git-history-tire-term-scan.txt" | tee -a "$OUT/SUMMARY.txt" >/dev/null

print_section "15-build-and-safety-checks"
{
  echo "Root npm scripts available:"
  npm run 2>/dev/null || true

  echo
  echo "Recommended existing checks:"
  echo "npm run build:web"
  echo "npm run check:dev-safe"
  echo
  echo "Running checks if scripts exist..."

  node -e '
    const pkg = require("./package.json");
    const scripts = pkg.scripts || {};
    process.exit(scripts["build:web"] ? 0 : 10);
  ' && npm run build:web || echo "SKIPPED or FAILED: npm run build:web"

  node -e '
    const pkg = require("./package.json");
    const scripts = pkg.scripts || {};
    process.exit(scripts["check:dev-safe"] ? 0 : 10);
  ' && npm run check:dev-safe || echo "SKIPPED or FAILED: npm run check:dev-safe"
} | tee "$OUT/15-build-and-safety-checks.txt" | tee -a "$OUT/SUMMARY.txt" >/dev/null

print_section "16-runtime-health-checks"
{
  echo "Checking local Pawnshop endpoints if servers are running..."
  echo
  echo "Backend dev health:"
  curl -fsS http://127.0.0.1:6002/api/health || true

  echo
  echo
  echo "Backend prod-like health:"
  curl -fsS http://127.0.0.1:6001/api/health || true

  echo
  echo
  echo "Frontend dev root:"
  curl -I -fsS http://127.0.0.1:5176 || true
} | tee "$OUT/16-runtime-health-checks.txt" | tee -a "$OUT/SUMMARY.txt" >/dev/null

print_section "FINAL RESULT LOCATION"
{
  echo "Audit folder:"
  echo "$OUT"
  echo
  echo "Main summary:"
  echo "$OUT/SUMMARY.txt"
  echo
  echo "Review these files first:"
  echo "$OUT/08-tire-marketplace-contamination-scan.txt"
  echo "$OUT/09-port-and-url-scan.txt"
  echo "$OUT/11-frontend-raw-fetch-scan.txt"
  echo "$OUT/14-git-history-tire-term-scan.txt"
} | tee -a "$OUT/SUMMARY.txt"

echo
echo "✅ Pawnshop cleanliness audit complete."
echo "Open summary:"
echo "$OUT/SUMMARY.txt"
