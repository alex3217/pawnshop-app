#!/usr/bin/env bash
set -euo pipefail

printf '\nChecking Pawnshop process boundaries...\n'

if pm2 status | grep -Eq 'pawn-dev-6002|pawn-prod-6001|pawn-staging-6003'; then
  echo "✅ Pawnshop PM2 processes detected"
else
  echo "⚠️ No Pawnshop PM2 processes detected"
fi

if pm2 status | grep -Eq 'dev-5002|prod-5001|staging-5003'; then
  echo "❌ Legacy non-Pawnshop PM2 process detected. Stop/delete it before auditing Pawnshop."
  pm2 status | grep -E 'dev-5002|prod-5001|staging-5003' || true
  exit 1
else
  echo "✅ No legacy non-Pawnshop PM2 process names detected"
fi

for port in 5001 5002 5003; do
  if lsof -iTCP:"$port" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
    echo "❌ Legacy non-Pawnshop port $port is listening"
    lsof -iTCP:"$port" -sTCP:LISTEN -n -P || true
    exit 1
  fi
done

echo "✅ No legacy non-Pawnshop ports 5001/5002/5003 are listening"

for port in 6001 6002 6003; do
  if lsof -iTCP:"$port" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
    echo "✅ Pawnshop port $port is listening"
  else
    echo "⚠️ Pawnshop port $port is not listening"
  fi
done
