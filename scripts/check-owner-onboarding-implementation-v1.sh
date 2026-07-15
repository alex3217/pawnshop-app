#!/usr/bin/env bash

set -u
set -o pipefail

cd "$(git rev-parse --show-toplevel)" || exit 1

FAIL=0

check() {
  local description="$1"
  shift

  if "$@"; then
    echo "✅ $description"
  else
    echo "❌ $description"
    FAIL=1
  fi
}

echo "===== OWNER ONBOARDING IMPLEMENTATION CHECK ====="

check \
  "Onboarding page exists" \
  test -f apps/web/src/pages/OwnerOnboardingPage.tsx

check \
  "Onboarding stylesheet exists" \
  test -f apps/web/src/styles/owner-onboarding.css

check \
  "Onboarding page is lazy loaded" \
  grep -q 'import("./pages/OwnerOnboardingPage")' apps/web/src/App.tsx

check \
  "Onboarding route exists" \
  grep -q 'path: "/owner/onboarding"' apps/web/src/App.tsx

check \
  "Owner registration enters wizard" \
  grep -q '"/owner/onboarding"' apps/web/src/pages/RegisterPage.tsx

check \
  "Owner navigation exposes wizard" \
  grep -q 'label: "Setup Wizard"' apps/web/src/components/SiteLayout.tsx

check \
  "Shop creation service is reused" \
  grep -q 'createShop' apps/web/src/pages/OwnerOnboardingPage.tsx

check \
  "Seller plan service is reused" \
  grep -q 'getSellerPlans' apps/web/src/pages/OwnerOnboardingPage.tsx

check \
  "Stripe checkout is reused" \
  grep -q 'createSubscriptionCheckoutSession' apps/web/src/pages/OwnerOnboardingPage.tsx

check \
  "Staff invitation is reused" \
  grep -q 'inviteStaffMember' apps/web/src/pages/OwnerOnboardingPage.tsx

echo ""
echo "===== FRONTEND BUILD ====="

if npm run build:web; then
  echo "✅ Frontend build passed"
else
  echo "❌ Frontend build failed"
  FAIL=1
fi

echo ""
echo "===== FRONTEND LINT ====="

if npm --prefix apps/web run lint; then
  echo "✅ Frontend lint passed"
else
  echo "❌ Frontend lint failed"
  FAIL=1
fi

echo ""
echo "===== DEVELOPMENT SERVICES ====="

curl -sS -o /dev/null \
  -w 'Backend 6002 HTTP %{http_code}\n' \
  http://127.0.0.1:6002/api/health || FAIL=1

curl -sS -o /dev/null \
  -w 'Frontend 5176 HTTP %{http_code}\n' \
  http://127.0.0.1:5176 || FAIL=1

echo ""
echo "===== GIT STATUS ====="
git status --short

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo "✅ OWNER ONBOARDING IMPLEMENTATION PASSED"
else
  echo "❌ OWNER ONBOARDING IMPLEMENTATION HAS FAILURES"
fi

exit "$FAIL"
