#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

echo "Checking frontend auth source files..."

test -f apps/web/src/services/auth.ts
test -f apps/web/src/services/apiClient.ts
test -f apps/web/src/components/RequireRole.tsx
test -f apps/web/src/pages/LoginPage.tsx

rg -n "auth_token|auth_user|auth_role|persistAuth|logout|getAuthHeaders|getAuthToken|getAuthRole" apps/web/src/services/auth.ts >/dev/null
rg -n "ApiError|api =|getAuthHeaders|clearAuth" apps/web/src/services/apiClient.ts >/dev/null
rg -n "Navigate|/login|getAuthRole|getAuthToken" apps/web/src/components/RequireRole.tsx >/dev/null
rg -n "login\\(|persistAuth|navigate" apps/web/src/pages/LoginPage.tsx >/dev/null

echo "✅ Frontend auth files present and wired"
