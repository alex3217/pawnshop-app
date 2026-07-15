#!/usr/bin/env bash

set -u
set -o pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT" || exit 1

STAMP="$(date +%Y%m%d-%H%M%S)"
REPORT="reports/owner-onboarding-wizard-audit-$STAMP.txt"

mkdir -p reports

section() {
  echo ""
  echo "=================================================="
  echo "$1"
  echo "=================================================="
}

{
  section "OWNER ONBOARDING WIZARD AUDIT"

  echo "Date: $(date)"
  echo "Repo: $ROOT"
  echo "Branch: $(git branch --show-current)"
  echo "Report: $REPORT"

  section "RUNTIME STATUS"

  curl -sS http://127.0.0.1:6002/api/health |
    jq '{
      ok,
      service,
      env,
      pid,
      uptimeSeconds
    }' || true

  curl -sS -o /dev/null \
    -w 'Frontend 5176 HTTP %{http_code}\n' \
    http://127.0.0.1:5176 || true

  section "OWNER AUTHENTICATION"

  curl -sS \
    -X POST http://127.0.0.1:6002/api/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"owner1@pawn.local","password":"Owner123!"}' |
    jq '{
      authenticated:
        ((.token //
          .accessToken //
          .data.token //
          .data.accessToken //
          "") | length > 0),
      role:
        (.user.role //
         .data.user.role //
         null),
      email:
        (.user.email //
         .data.user.email //
         null)
    }' || true

  section "ONBOARDING-RELATED FRONTEND FILES"

  find apps/web/src \
    -type f \
    \( \
      -iname '*onboard*' \
      -o -iname '*wizard*' \
      -o -iname '*register*' \
      -o -iname '*owner*' \
      -o -iname '*shop*' \
      -o -iname '*location*' \
      -o -iname '*subscription*' \
      -o -iname '*staff*' \
      -o -iname '*billing*' \
    \) |
    sort

  section "FRONTEND ROUTES"

  rg -n \
    --glob '!node_modules/**' \
    --glob '!dist/**' \
    'onboard|onboarding|owner/setup|shop/setup|create-shop|register-shop|owner/register|OwnerOnboarding|OnboardingWizard' \
    apps/web/src || true

  section "FRONTEND WIZARD PATTERNS"

  rg -n \
    --glob '!node_modules/**' \
    --glob '!dist/**' \
    'currentStep|activeStep|stepIndex|nextStep|previousStep|handleNext|handleBack|wizard|stepper|completedSteps' \
    apps/web/src || true

  section "OWNER AND SHOP API CALLS"

  rg -n \
    --glob '!node_modules/**' \
    --glob '!dist/**' \
    '/api/owners|/api/owner|/api/shops|createShop|updateShop|createLocation|onboarding|subscription|account-link|stripe' \
    apps/web/src || true

  section "BACKEND ONBOARDING FILES"

  find apps/api/backend/src \
    -type f \
    \( \
      -iname '*onboard*' \
      -o -iname '*wizard*' \
      -o -iname '*owner*' \
      -o -iname '*shop*' \
      -o -iname '*location*' \
      -o -iname '*staff*' \
      -o -iname '*subscription*' \
      -o -iname '*stripe*' \
      -o -iname '*billing*' \
    \) |
    sort

  section "BACKEND ROUTES AND CONTROLLERS"

  rg -n \
    --glob '!node_modules/**' \
    'onboard|onboarding|createShop|updateShop|createLocation|owner.*register|register.*owner|subscription|stripe|accountLink|staff.*invite' \
    apps/api/backend/src || true

  section "BUSINESS INFORMATION FIELDS"

  rg -n \
    --glob '!node_modules/**' \
    --glob '!dist/**' \
    'businessName|legalName|shopName|phone|email|address|city|state|zip|postal|ein|taxId|license|operatingHours|businessHours|website' \
    apps/web/src \
    apps/api/backend/src \
    apps/api/backend/prisma/schema.prisma || true

  section "PRISMA MODELS AND STATUS FIELDS"

  rg -n \
    'model (User|Shop|Location|Staff|Subscription|Business|Owner)|onboarding|setupComplete|profileComplete|approvalStatus|verificationStatus|stripeAccountId' \
    apps/api/backend/prisma/schema.prisma || true

  section "DATABASE MIGRATIONS"

  find apps/api/backend/prisma/migrations \
    -maxdepth 2 \
    -type f \
    -name 'migration.sql' |
    sort

  section "ADMIN APPROVAL REFERENCES"

  rg -n \
    --glob '!node_modules/**' \
    --glob '!dist/**' \
    'approve.*shop|shop.*approve|reject.*shop|pending.*approval|verification|approvalStatus' \
    apps/web/src \
    apps/api/backend/src \
    apps/api/backend/prisma || true

  section "SUBSCRIPTION AND STRIPE REFERENCES"

  rg -n \
    --glob '!node_modules/**' \
    --glob '!dist/**' \
    'subscription|planId|priceId|billing|stripeAccountId|accountLink|checkoutSession|paymentMethod' \
    apps/web/src \
    apps/api/backend/src \
    apps/api/backend/prisma || true

  section "STAFF INVITATION REFERENCES"

  rg -n \
    --glob '!node_modules/**' \
    --glob '!dist/**' \
    'invite.*staff|staff.*invite|invitation|inviteToken|staffEmail' \
    apps/web/src \
    apps/api/backend/src \
    apps/api/backend/prisma || true

  section "TODO AND PLACEHOLDER REFERENCES"

  rg -n \
    --glob '!node_modules/**' \
    --glob '!dist/**' \
    'TODO|FIXME|coming soon|not implemented|placeholder' \
    apps/web/src \
    apps/api/backend/src || true

  section "PACKAGE SCRIPTS"

  echo "--- Root ---"
  node -e '
    const p = require("./package.json");
    console.log(JSON.stringify(p.scripts || {}, null, 2));
  '

  echo ""
  echo "--- Frontend ---"
  (
    cd apps/web || exit 1
    node -e '
      const p = require("./package.json");
      console.log(JSON.stringify(p.scripts || {}, null, 2));
    '
  )

  echo ""
  echo "--- Backend ---"
  (
    cd apps/api/backend || exit 1
    node -e '
      const p = require("./package.json");
      console.log(JSON.stringify(p.scripts || {}, null, 2));
    '
  )

  section "GIT STATUS"

  git status --short

  section "AUDIT COMPLETE"

  echo "Report: $REPORT"

} 2>&1 | tee "$REPORT"

echo ""
echo "✅ Owner onboarding audit completed"
echo "Report: $REPORT"
