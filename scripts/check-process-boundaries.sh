#!/usr/bin/env bash
set -euo pipefail

REQUIRE_FRONTEND="${REQUIRE_FRONTEND:-0}"

printf '\nChecking PM2 process boundaries...\n'
pm2 status

printf '\nChecking required PawnLoop backend ports...\n'

for port in 6001 6002 6003; do
  if lsof -iTCP:"$port" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
    echo "✅ PawnLoop backend port $port is listening"
  else
    echo "❌ PawnLoop backend port $port is not listening" >&2
    exit 1
  fi
done

printf '\nChecking Tire Konnect boundary...\n'
if pm2 status | grep -q 'dev-5002'; then
  echo "✅ Tire Konnect process dev-5002 detected; leaving it untouched"
else
  echo "⚠️ Tire Konnect process dev-5002 not detected. This is okay if you are not working on Tire Konnect."
fi

if lsof -iTCP:5002 -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  echo "✅ Port 5002 is in use separately from PawnLoop"
else
  echo "⚠️ Port 5002 is not listening. Do not start/stop it from PawnLoop scripts."
fi

printf '\nChecking PawnLoop frontend dev port 5176...\n'
if lsof -iTCP:5176 -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  echo "✅ PawnLoop frontend port 5176 is listening"
else
  if [ "$REQUIRE_FRONTEND" = "1" ]; then
    echo "❌ PawnLoop frontend port 5176 is not listening" >&2
    echo "Run: npm --prefix apps/web run dev -- --host 127.0.0.1 --port 5176 --strictPort" >&2
    exit 1
  fi

  echo "⚠️ PawnLoop frontend port 5176 is not listening. This is okay for production-only checks."
fi

printf '\n✅ Process boundary check passed.\n'
