#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SCHEMA="apps/api/backend/prisma/schema.prisma"
APP_FILE="apps/api/backend/src/app.js"
REPORT_DIR="reports/multi-party-marketplace-foundation"
REPORT_FILE="$REPORT_DIR/audit.txt"

mkdir -p "$REPORT_DIR"

{
  echo "===== PAWNLOOP MULTI-PARTY MARKETPLACE FOUNDATION AUDIT ====="
  echo "Generated: $(date)"
  echo "Branch: $(git branch --show-current)"
  echo "Commit: $(git rev-parse --short HEAD)"
  echo ""

  echo "===== PRISMA MODELS ====="
  grep -nE '^model ' "$SCHEMA" || true
  echo ""

  echo "===== PRISMA ENUMS ====="
  grep -nE '^enum ' "$SCHEMA" || true
  echo ""

  echo "===== MARKETPLACE-RELATED SCHEMA TERMS ====="
  grep -nEi \
    'seller|dealer|listing|order|shipment|shipping|pickup|message|conversation|rating|review|dispute|refund|transfer|payout|settlement|offer|auction|watchlist|submission|inventory|location' \
    "$SCHEMA" || true
  echo ""

  echo "===== BACKEND ROUTE FILES ====="
  find apps/api/backend/src/routes \
    -maxdepth 1 \
    -type f \
    -print \
    | sort
  echo ""

  echo "===== BACKEND CONTROLLER FILES ====="
  find apps/api/backend/src/controllers \
    -maxdepth 1 \
    -type f \
    -print \
    | sort
  echo ""

  echo "===== REGISTERED API ROUTES ====="
  grep -nE 'mountApi|app\.use\(' "$APP_FILE" || true
  echo ""

  echo "===== EXISTING MARKETPLACE API TERMS ====="
  grep -RIn \
    --exclude-dir=node_modules \
    --exclude-dir=dist \
    --exclude='*.map' \
    -E 'seller|dealer|listing|order|shipment|pickup|message|rating|review|dispute|refund|transfer|payout' \
    apps/api/backend/src \
    | head -500 || true
  echo ""

  echo "===== FRONTEND PAGES ====="
  find apps/web/src/pages \
    -maxdepth 1 \
    -type f \
    -print \
    | sort
  echo ""

  echo "===== FRONTEND SERVICES ====="
  find apps/web/src/services \
    -maxdepth 1 \
    -type f \
    -print \
    | sort
  echo ""

  echo "===== EXISTING FRONTEND MARKETPLACE TERMS ====="
  grep -RIn \
    --exclude-dir=node_modules \
    --exclude-dir=dist \
    --exclude='*.css' \
    -E 'seller|dealer|listing|order|shipment|pickup|message|rating|review|dispute|refund|transfer|payout' \
    apps/web/src \
    | head -500 || true
  echo ""

  echo "===== SCANNER INTEGRATION POINTS ====="
  grep -RIn \
    --exclude-dir=node_modules \
    --exclude-dir=dist \
    -E 'scanItem|ScanConsole|BarcodeDetector|barcode|serialNumber|serial number|QR|OCR' \
    apps/web/src \
    apps/api/backend/src \
    | head -500 || true
  echo ""

  echo "===== CURRENT APPLICATION COUNTS ====="
  printf "Prisma models: "
  grep -cE '^model ' "$SCHEMA" || true

  printf "Prisma enums: "
  grep -cE '^enum ' "$SCHEMA" || true

  printf "Backend routes: "
  find apps/api/backend/src/routes -maxdepth 1 -type f | wc -l | tr -d ' '

  printf "Backend controllers: "
  find apps/api/backend/src/controllers -maxdepth 1 -type f | wc -l | tr -d ' '

  printf "Frontend pages: "
  find apps/web/src/pages -maxdepth 1 -type f | wc -l | tr -d ' '

  printf "Frontend services: "
  find apps/web/src/services -maxdepth 1 -type f | wc -l | tr -d ' '

  echo ""
  echo "===== GIT STATUS ====="
  git status --short
} | tee "$REPORT_FILE"

echo ""
echo "✅ Audit written to $REPORT_FILE"
