#!/usr/bin/env bash
set -euo pipefail

# Start DB (if you use docker-compose)
if [ -f "$(pwd)/infra/docker/docker-compose.yml" ]; then
  (cd infra/docker && docker compose up -d) || true
fi

# Start backend (6002)
(cd backend && PORT=6002 npm run dev) &
BACK_PID=$!

# Start frontend (5176)
(cd frontend && npm run dev -- --port 5176 --strictPort) &
FRONT_PID=$!

echo "Backend PID: $BACK_PID"
echo "Frontend PID: $FRONT_PID"
wait
