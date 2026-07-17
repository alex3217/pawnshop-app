#!/usr/bin/env bash
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$BACKEND_DIR/../../.." && pwd)"
WEB_DIR="$REPO_ROOT/apps/web"

echo "===== INSTALL BACKEND ====="
cd "$BACKEND_DIR"
npm ci --include=dev

echo "===== GENERATE PRISMA CLIENT ====="
npm run prisma:generate

echo "===== INSTALL FRONTEND ====="
npm --prefix "$WEB_DIR" ci --include=dev

echo "===== BUILD FRONTEND ====="
npm --prefix "$WEB_DIR" run build

test -f "$WEB_DIR/dist/index.html"

echo "✅ Combined API and frontend build complete"
