#!/usr/bin/env bash
set -euo pipefail

echo "== API health =="
curl -s http://localhost:6002/health || true
echo

echo "== LIVE auctions =="
curl -s "http://localhost:6002/auctions?status=LIVE" | jq '.total,.rows[].id' || true
echo

echo "== ENDED auctions =="
curl -s "http://localhost:6002/auctions?status=ENDED" | jq '.total,.rows[].id' || true
echo
