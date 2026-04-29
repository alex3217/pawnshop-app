#!/usr/bin/env bash
set -euo pipefail

echo ""
echo "Scanning backend route declarations..."

echo ""
echo "App-level route mounts:"
grep -RInE 'app\.use\(|router\.use\(' apps/api/backend/src \
  --include="*.js" \
  --include="*.ts" || true

echo ""
echo "Route method declarations:"
grep -RInE 'router\.(get|post|put|patch|delete)\(' apps/api/backend/src/routes \
  --include="*.js" \
  --include="*.ts" || true

echo ""
echo "Controller exports:"
grep -RInE 'export async function|export function' apps/api/backend/src/controllers \
  --include="*.js" \
  --include="*.ts" || true

echo ""
echo "Known role/security middleware usage:"
grep -RInE 'authRequired|requireRole|SUPER_ADMIN|ADMIN|OWNER|CONSUMER' apps/api/backend/src/routes apps/api/backend/src/controllers \
  --include="*.js" \
  --include="*.ts" || true

echo ""
echo "✅ Backend route audit completed."
