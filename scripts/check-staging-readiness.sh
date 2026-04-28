#!/usr/bin/env bash
set -euo pipefail

STAGING_ENV="apps/api/backend/.env.staging"
DEV_ENV="apps/api/backend/.env.development"

if [ ! -f "$STAGING_ENV" ]; then
  echo "Missing staging env file: $STAGING_ENV" >&2
  exit 1
fi

node --env-file="$STAGING_ENV" - <<'NODE'
const required = [
  "APP_ENV",
  "NODE_ENV",
  "PORT",
  "PAWN_PORT",
  "DATABASE_URL",
  "JWT_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "CORS_ORIGINS",
];

const missing = required.filter((key) => !(process.env[key] || "").trim());

if (missing.length) {
  console.error("Missing staging env vars:");
  for (const key of missing) console.error(`- ${key}`);
  process.exit(1);
}

const placeholders = Object.entries(process.env).filter(([key, value]) => {
  if (!required.includes(key)) return false;
  return /replace_me|your_|changeme|placeholder/i.test(String(value || ""));
});

if (placeholders.length) {
  console.error("Staging env has placeholder values:");
  for (const [key] of placeholders) console.error(`- ${key}`);
  process.exit(1);
}

if (String(process.env.PORT) !== "6003" || String(process.env.PAWN_PORT) !== "6003") {
  console.error("Staging must use PORT=6003 and PAWN_PORT=6003.");
  process.exit(1);
}

console.log("✅ Staging env required values are present.");
NODE

DEV_DB="$(node --env-file="$DEV_ENV" -e 'const u=new URL(process.env.DATABASE_URL||"");u.searchParams.delete("schema");process.stdout.write(u.toString())')"
STAGING_DB="$(node --env-file="$STAGING_ENV" -e 'const u=new URL(process.env.DATABASE_URL||"");u.searchParams.delete("schema");process.stdout.write(u.toString())')"

if [ "$DEV_DB" = "$STAGING_DB" ]; then
  echo "Staging DATABASE_URL matches development DATABASE_URL. Refusing staging readiness." >&2
  exit 1
fi

echo "✅ Staging DB is separate from dev DB."
echo "✅ Staging readiness passed."
