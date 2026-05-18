#!/usr/bin/env bash
set +e

ROOT="$(pwd)"
TS="$(date +%Y%m%d-%H%M%S)"
REPORT_DIR="$ROOT/reports/full-app-audit-$TS"
SUMMARY="$REPORT_DIR/summary.md"
API_BASE="${API_BASE:-http://127.0.0.1:6002/api}"
WEB_BASE="${WEB_BASE:-http://127.0.0.1:5176}"

BUYER_EMAIL="${BUYER_EMAIL:-buyer@pawn.local}"
BUYER_PASSWORD="${BUYER_PASSWORD:-Buyer123!}"
OWNER_EMAIL="${OWNER_EMAIL:-owner1@pawn.local}"
OWNER_PASSWORD="${OWNER_PASSWORD:-Owner123!}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin1@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin123!}"
SUPER_ADMIN_EMAIL="${SUPER_ADMIN_EMAIL:-superadmin@pawn.local}"
SUPER_ADMIN_PASSWORD="${SUPER_ADMIN_PASSWORD:-SuperAdmin123!}"

mkdir -p "$REPORT_DIR"

section() {
  echo "" | tee -a "$SUMMARY" >/dev/null
  echo "## $1" | tee -a "$SUMMARY" >/dev/null
  echo "" | tee -a "$SUMMARY" >/dev/null
}

run_cmd() {
  local title="$1"
  local cmd="$2"
  local outfile="$3"

  echo "### $title" >> "$SUMMARY"
  echo "" >> "$SUMMARY"
  echo '```txt' >> "$SUMMARY"
  echo "\$ $cmd" >> "$SUMMARY"
  echo '```' >> "$SUMMARY"
  echo "" >> "$SUMMARY"

  bash -lc "$cmd" > "$REPORT_DIR/$outfile" 2>&1
  local status=$?

  echo "- exit_code: $status" >> "$SUMMARY"
  echo "- output: \`$outfile\`" >> "$SUMMARY"
  echo "" >> "$SUMMARY"

  return $status
}

http_probe() {
  local label="$1"
  local url="$2"
  local outfile="$3"

  {
    echo "===== $label ====="
    echo "URL: $url"
    curl -sS -i "$url" | sed -n '1,80p'
    echo ""
  } > "$REPORT_DIR/$outfile" 2>&1

  local code
  code="$(grep -m1 '^HTTP/' "$REPORT_DIR/$outfile" | awk '{print $2}')"
  echo "| $label | $code | $url | $outfile |" >> "$SUMMARY"
}

extract_token() {
  python3 -c '
import json, sys
try:
    data=json.load(sys.stdin)
except Exception:
    sys.exit(0)
for key in ["token","accessToken","access_token","jwt"]:
    if data.get(key):
        print(data[key])
        sys.exit(0)
nested=data.get("data") or {}
if isinstance(nested, dict):
    for key in ["token","accessToken","access_token","jwt"]:
        if nested.get(key):
            print(nested[key])
            sys.exit(0)
'
}

login_token() {
  local email="$1"
  local password="$2"

  curl -sS -X POST "$API_BASE/auth/login" \
    -H "Content-Type: application/json" \
    --data "{\"email\":\"$email\",\"password\":\"$password\"}" \
    | extract_token
}

auth_probe() {
  local role="$1"
  local token="$2"
  local endpoint="$3"
  local outfile="$4"

  {
    echo "===== $role $endpoint ====="
    curl -sS -i "$API_BASE$endpoint" \
      -H "Authorization: Bearer $token" \
      | sed -n '1,100p'
    echo ""
  } > "$REPORT_DIR/$outfile" 2>&1

  local code
  code="$(grep -m1 '^HTTP/' "$REPORT_DIR/$outfile" | awk '{print $2}')"
  echo "| $role | $endpoint | $code | $outfile |" >> "$SUMMARY"
}

cat > "$SUMMARY" <<EOF2
# PawnShop App Full Audit

Generated: $TS  
Repo: $ROOT  
API_BASE: $API_BASE  
WEB_BASE: $WEB_BASE  

EOF2

section "Executive audit checklist"

cat >> "$SUMMARY" <<'EOF2'
This audit checks:

- Git state and recent commits
- Build and dev-safe status
- PM2/backend/frontend wiring
- Public API health
- Authenticated buyer/owner/admin/super-admin route smoke
- Frontend route/page/service coverage
- Backend route/controller/model coverage
- Prisma model/migration health
- Manual table drift around buyer item submissions
- Raw fetch violations
- TODO/FIXME/stub counts
- Theme/light-mode files
- Auction/bid/settlement flow readiness
- Buyer/owner workflow readiness

EOF2

section "1. Environment and Git"

run_cmd "Current branch" "git branch --show-current" "git-branch.txt"
run_cmd "Git status" "git status --short" "git-status.txt"
run_cmd "Recent commits" "git log --oneline -12 --decorate" "git-log.txt"
run_cmd "Node/npm versions" "node -v && npm -v" "node-npm.txt"
run_cmd "Package scripts" "node -e \"const p=require('./package.json'); console.log(Object.entries(p.scripts||{}).map(([k,v])=>k+' = '+v).join('\\n'))\"" "package-scripts.txt"

section "2. Build and safety checks"

run_cmd "Build web" "npm run build:web" "build-web.txt"
run_cmd "Dev safe" "npm run check:dev-safe" "check-dev-safe.txt"

if npm run 2>/dev/null | grep -q "check:role-routes"; then
  run_cmd "Role route smoke" "SUPER_ADMIN_EMAIL='$SUPER_ADMIN_EMAIL' SUPER_ADMIN_PASSWORD='$SUPER_ADMIN_PASSWORD' npm run check:role-routes" "check-role-routes.txt"
else
  echo "- check:role-routes script not found" >> "$SUMMARY"
fi

section "3. PM2 and runtime health"

run_cmd "PM2 list" "pm2 ls" "pm2-ls.txt"
run_cmd "PM2 describe dev API" "pm2 describe pawn-dev-6002 | sed -n '1,220p'" "pm2-describe-dev.txt"
run_cmd "Backend logs recent errors" "pm2 logs pawn-dev-6002 --lines 160 --nostream | sed -n '1,220p'" "pm2-dev-logs.txt"

echo "| Probe | HTTP | URL | Output |" >> "$SUMMARY"
echo "|---|---:|---|---|" >> "$SUMMARY"

http_probe "API health" "$API_BASE/health" "http-api-health.txt"
http_probe "Root health" "${API_BASE%/api}/health" "http-root-health.txt"
http_probe "Frontend proxy health" "$WEB_BASE/api/health" "http-web-proxy-health.txt"
http_probe "Items public" "$API_BASE/items?limit=3" "http-items.txt"
http_probe "Shops public" "$API_BASE/shops?limit=3" "http-shops.txt"
http_probe "Auctions public" "$API_BASE/auctions?limit=3" "http-auctions.txt"
http_probe "Seller plans" "$API_BASE/seller-plans" "http-seller-plans.txt"
http_probe "Buyer plans" "$API_BASE/buyer-plans" "http-buyer-plans.txt"

section "4. Auth route smoke"

BUYER_TOKEN="$(login_token "$BUYER_EMAIL" "$BUYER_PASSWORD")"
OWNER_TOKEN="$(login_token "$OWNER_EMAIL" "$OWNER_PASSWORD")"
ADMIN_TOKEN="$(login_token "$ADMIN_EMAIL" "$ADMIN_PASSWORD")"
SUPER_TOKEN="$(login_token "$SUPER_ADMIN_EMAIL" "$SUPER_ADMIN_PASSWORD")"

echo "| Role | Token present |" >> "$SUMMARY"
echo "|---|---|" >> "$SUMMARY"
echo "| Buyer | $([ -n "$BUYER_TOKEN" ] && echo YES || echo NO) |" >> "$SUMMARY"
echo "| Owner | $([ -n "$OWNER_TOKEN" ] && echo YES || echo NO) |" >> "$SUMMARY"
echo "| Admin | $([ -n "$ADMIN_TOKEN" ] && echo YES || echo NO) |" >> "$SUMMARY"
echo "| Super Admin | $([ -n "$SUPER_TOKEN" ] && echo YES || echo NO) |" >> "$SUMMARY"
echo "" >> "$SUMMARY"

echo "| Role | Endpoint | HTTP | Output |" >> "$SUMMARY"
echo "|---|---|---:|---|" >> "$SUMMARY"

if [ -n "$BUYER_TOKEN" ]; then
  auth_probe "Buyer" "$BUYER_TOKEN" "/auth/me" "auth-buyer-me.txt"
  auth_probe "Buyer" "$BUYER_TOKEN" "/bids/mine" "auth-buyer-bids.txt"
  auth_probe "Buyer" "$BUYER_TOKEN" "/settlements/mine" "auth-buyer-settlements.txt"
  auth_probe "Buyer" "$BUYER_TOKEN" "/watchlist/mine" "auth-buyer-watchlist.txt"
  auth_probe "Buyer" "$BUYER_TOKEN" "/saved-searches/mine" "auth-buyer-saved-searches.txt"
  auth_probe "Buyer" "$BUYER_TOKEN" "/offers/mine" "auth-buyer-offers.txt"
  auth_probe "Buyer" "$BUYER_TOKEN" "/buyer/item-submissions/mine" "auth-buyer-item-submissions.txt"
  auth_probe "Buyer" "$BUYER_TOKEN" "/buyer/item-submissions/offers/mine" "auth-buyer-submission-offers.txt"
fi

if [ -n "$OWNER_TOKEN" ]; then
  auth_probe "Owner" "$OWNER_TOKEN" "/auth/me" "auth-owner-me.txt"
  auth_probe "Owner" "$OWNER_TOKEN" "/shops/mine" "auth-owner-shops.txt"
  auth_probe "Owner" "$OWNER_TOKEN" "/items/mine" "auth-owner-items.txt"
  auth_probe "Owner" "$OWNER_TOKEN" "/auctions/mine" "auth-owner-auctions.txt"
  auth_probe "Owner" "$OWNER_TOKEN" "/offers/owner" "auth-owner-offers.txt"
  auth_probe "Owner" "$OWNER_TOKEN" "/staff/mine" "auth-owner-staff.txt"
  auth_probe "Owner" "$OWNER_TOKEN" "/buyer/item-submissions/owner" "auth-owner-buyer-submissions.txt"
fi

if [ -n "$ADMIN_TOKEN" ]; then
  auth_probe "Admin" "$ADMIN_TOKEN" "/auth/me" "auth-admin-me.txt"
  auth_probe "Admin" "$ADMIN_TOKEN" "/admin/users" "auth-admin-users.txt"
  auth_probe "Admin" "$ADMIN_TOKEN" "/admin/items" "auth-admin-items.txt"
  auth_probe "Admin" "$ADMIN_TOKEN" "/admin/shops" "auth-admin-shops.txt"
  auth_probe "Admin" "$ADMIN_TOKEN" "/settlements" "auth-admin-settlements.txt"
fi

if [ -n "$SUPER_TOKEN" ]; then
  auth_probe "Super Admin" "$SUPER_TOKEN" "/super-admin/overview" "auth-super-overview.txt"
  auth_probe "Super Admin" "$SUPER_TOKEN" "/super-admin/users" "auth-super-users.txt"
  auth_probe "Super Admin" "$SUPER_TOKEN" "/super-admin/shops" "auth-super-shops.txt"
  auth_probe "Super Admin" "$SUPER_TOKEN" "/super-admin/revenue" "auth-super-revenue.txt"
  auth_probe "Super Admin" "$SUPER_TOKEN" "/super-admin/audit" "auth-super-audit.txt"
fi

section "5. Frontend inventory"

run_cmd "Frontend route map" "grep -n \"path:\" apps/web/src/App.tsx" "frontend-routes.txt"
run_cmd "Frontend pages" "find apps/web/src/pages -maxdepth 1 -type f | sort" "frontend-pages.txt"
run_cmd "Frontend services" "find apps/web/src/services -maxdepth 1 -type f | sort" "frontend-services.txt"
run_cmd "Frontend styles" "find apps/web/src/styles -maxdepth 1 -type f | sort" "frontend-styles.txt"
run_cmd "Raw fetch check" "grep -RIn \"fetch(\" apps/web/src --exclude-dir=node_modules || true" "frontend-raw-fetch.txt"
run_cmd "Hardcoded dark style scan" "grep -RIn \"#0b1020\\|#08111f\\|#111827\\|#121935\\|rgba(11,16,32\\|rgba(255,255,255\" apps/web/src --include='*.tsx' --include='*.ts' --include='*.css' | sed -n '1,240p' || true" "frontend-dark-style-scan.txt"

section "6. Backend inventory"

run_cmd "Backend routes" "find apps/api/backend/src/routes -maxdepth 1 -type f | sort" "backend-routes.txt"
run_cmd "Backend controllers" "find apps/api/backend/src/controllers -maxdepth 1 -type f | sort" "backend-controllers.txt"
run_cmd "Backend services" "find apps/api/backend/src/services -maxdepth 1 -type f | sort" "backend-services.txt"
run_cmd "Mounted routes" "grep -RIn \"mountApi(app\\|app.use\" apps/api/backend/src/app.js apps/api/backend/src/routes | sed -n '1,260p'" "backend-mounted-routes.txt"
run_cmd "Auction/offer/submission route grep" "grep -RIn \"buyerItemSubmission\\|BuyerItemSubmission\\|auction\\|offer\\|settlement\\|watchlist\" apps/api/backend/src/routes apps/api/backend/src/controllers | sed -n '1,320p'" "backend-flow-grep.txt"

section "7. Prisma and DB health"

run_cmd "Prisma models/enums" "grep -nE '^model |^enum ' apps/api/backend/prisma/schema.prisma" "prisma-models-enums.txt"
run_cmd "Prisma migrations" "find apps/api/backend/prisma/migrations -maxdepth 2 -type f | sort" "prisma-migrations.txt"

(
  cd apps/api/backend || exit 1
  node --env-file=.env.development --input-type=module <<'NODE'
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const models = [
  ["User", () => prisma.user.count()],
  ["PawnShop", () => prisma.pawnShop.count()],
  ["Item", () => prisma.item.count()],
  ["Auction", () => prisma.auction.count()],
  ["Bid", () => prisma.bid.count()],
  ["Offer", () => prisma.offer.count()],
  ["Settlement", () => prisma.settlement.count()],
  ["Watchlist", () => prisma.watchlist.count()],
  ["SavedSearch", () => prisma.savedSearch.count()],
  ["BuyerItemSubmission", () => prisma.buyerItemSubmission.count()],
  ["BuyerItemSubmissionOffer", () => prisma.buyerItemSubmissionOffer.count()],
];

for (const [name, fn] of models) {
  try {
    const count = await fn();
    console.log(`${name}: ${count}`);
  } catch (err) {
    console.log(`${name}: ERROR ${err?.code || err?.message || err}`);
  }
}

await prisma.$disconnect();
NODE
) > "$REPORT_DIR/db-counts.txt" 2>&1

echo "- DB counts: \`db-counts.txt\`" >> "$SUMMARY"

section "8. TODO / stubs / risk signals"

run_cmd "TODO FIXME count" "grep -RIn \"TODO\\|FIXME\\|HACK\\|stub\\|placeholder\\|not implemented\" apps scripts --exclude-dir=node_modules --exclude-dir=dist | sed -n '1,260p' || true" "todo-stubs.txt"
run_cmd "Console errors/warnings" "grep -RIn \"console.error\\|console.warn\" apps/api/backend/src apps/web/src | sed -n '1,260p' || true" "console-warnings.txt"
run_cmd "Backup/untracked risk files" "find . -name '*.bak*' -o -name '*audit.txt' -o -name '*exact-files.txt' | sort" "backup-risk-files.txt"

section "9. Feature scorecard template"

cat >> "$SUMMARY" <<'EOF2'
| Area | Current read | Notes |
|---|---:|---|
| Public marketplace browsing | TBD | Check Marketplace/Shops/Item Detail |
| Buyer dashboard/discovery | TBD | Check dashboard, item locator, saved searches |
| Buyer item submission | TBD | API and UI should be verified |
| Owner buyer-request review | TBD | Owner dashboard should show incoming requests |
| Owner cash offer to buyer submissions | TBD | API and UI should be verified |
| Watchlist | TBD | Add/remove and empty state |
| Offers/counteroffers | TBD | Buyer + owner flows |
| Auctions list/detail | TBD | Detail has live socket logic |
| My Bids | TBD | Controls/filter/search/sort |
| My Wins/Settlements | TBD | Next major polish area |
| Owner inventory | TBD | CRUD + image upload + statuses |
| Owner auctions | TBD | Create/end/cancel/review state |
| Owner staff/locations/integrations | TBD | Existing, needs UX QA |
| Admin/SuperAdmin | TBD | Needs full route + UI audit |
| Payments/Stripe | TBD | Needs settlement/payment E2E |
| Database migrations | HIGH RISK | Manual SQL used due old migration issue |
| Production readiness | TBD | Needs env/deploy/security audit |

EOF2

section "10. Recommended next audit commands"

cat >> "$SUMMARY" <<EOF2
Open these manually for visual QA:

\`\`\`zsh
# zsh — any terminal
open "$WEB_BASE/?fresh=\$(date +%s)"
open "$WEB_BASE/marketplace?fresh=\$(date +%s)"
open "$WEB_BASE/shops?fresh=\$(date +%s)"
open "$WEB_BASE/buyer/dashboard?fresh=\$(date +%s)"
open "$WEB_BASE/buyer/item-locator?fresh=\$(date +%s)"
open "$WEB_BASE/buyer/sell-item?fresh=\$(date +%s)"
open "$WEB_BASE/watchlist?fresh=\$(date +%s)"
open "$WEB_BASE/offers?fresh=\$(date +%s)"
open "$WEB_BASE/my-bids?fresh=\$(date +%s)"
open "$WEB_BASE/my-wins?fresh=\$(date +%s)"
open "$WEB_BASE/owner?fresh=\$(date +%s)"
open "$WEB_BASE/owner/auctions?fresh=\$(date +%s)"
\`\`\`

EOF2

echo ""
echo "✅ Full app audit generated:"
echo "$REPORT_DIR"
echo ""
echo "Summary:"
echo "$SUMMARY"
