#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Guardrail: refuse to run in the wrong repo
if [[ ! -f "$ROOT/src/server.js" ]]; then
  echo "❌ This doesn't look like pawnshop-app/apps/api/backend (missing src/server.js)."
  exit 1
fi

need() { command -v "$1" >/dev/null || { echo "❌ missing: $1"; exit 1; }; }
need curl
need jq

check_port () {
  local port="$1"
  echo "=== PawnShop :$port ==="
  curl -fsS "http://127.0.0.1:${port}/health" | jq .
  echo
}

check_port 6001
check_port 6002
check_port 6003

echo "✅ PawnShop smoke OK"
