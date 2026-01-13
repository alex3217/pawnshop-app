#!/usr/bin/env bash
set -euo pipefail
TOKEN=$(curl -s -X POST http://localhost:6002/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner1@pawn.local","password":"Owner123!"}' | jq -r .token)
echo "$TOKEN"
