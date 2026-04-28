#!/usr/bin/env bash
set -euo pipefail

PROD_ENV="apps/api/backend/.env.production"
DEV_ENV="apps/api/backend/.env.development"
STAGING_ENV="apps/api/backend/.env.staging"

if [ ! -f "$PROD_ENV" ]; then
  echo "Missing production env file: $PROD_ENV" >&2
  exit 1
fi

node --env-file="$PROD_ENV" - <<'NODE'
const required = [
  "APP_ENV",
  "NODE_ENV",
  "PORT",
  "PAWN_PORT",
  "DATABASE_URL",
  "JWT_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PUBLISHABLE_KEY",
  "CORS_ORIGINS",
  "FRONTEND_URL",
];

const missing = required.filter((key) => !(process.env[key] || "").trim());

if (missing.length) {
  console.error("Missing production env vars:");
  for (const key of missing) console.error(`- ${key}`);
  process.exit(1);
}

const placeholders = Object.entries(process.env).filter(([key, value]) => {
  if (!required.includes(key)) return false;
  return /replace_me|your_|changeme|placeholder/i.test(String(value || ""));
});

if (placeholders.length) {
  console.error("Production env has placeholder values:");
  for (const [key] of placeholders) console.error(`- ${key}`);
  process.exit(1);
}

if (String(process.env.APP_ENV) !== "production") {
  console.error("APP_ENV must be production.");
  process.exit(1);
}

if (String(process.env.NODE_ENV) !== "production") {
  console.error("NODE_ENV must be production.");
  process.exit(1);
}

if (String(process.env.PORT) !== "6001" || String(process.env.PAWN_PORT) !== "6001") {
  console.error("Production must use PORT=6001 and PAWN_PORT=6001.");
  process.exit(1);
}

if (!String(process.env.STRIPE_SECRET_KEY || "").startsWith("sk_live_")) {
  console.error("Production STRIPE_SECRET_KEY must be a live key starting with sk_live_.");
  process.exit(1);
}

if (!String(process.env.STRIPE_PUBLISHABLE_KEY || "").startsWith("pk_live_")) {
  console.error("Production STRIPE_PUBLISHABLE_KEY must be a live key starting with pk_live_.");
  process.exit(1);
}

if (!String(process.env.STRIPE_WEBHOOK_SECRET || "").startsWith("whsec_")) {
  console.error("Production STRIPE_WEBHOOK_SECRET must start with whsec_.");
  process.exit(1);
}

console.log("✅ Production env required values are present.");
NODE

normalize_db() {
  local env_file="$1"
  node --env-file="$env_file" -e '
    const raw = process.env.DATABASE_URL || "";
    if (!raw) process.exit(2);
    const u = new URL(raw);
    u.password = "****";
    u.searchParams.delete("schema");
    process.stdout.write(u.toString());
  '
}

DEV_DB="$(normalize_db "$DEV_ENV" 2>/dev/null || true)"
STAGING_DB="$(normalize_db "$STAGING_ENV" 2>/dev/null || true)"
PROD_DB="$(normalize_db "$PROD_ENV")"

if [ -n "$DEV_DB" ] && [ "$PROD_DB" = "$DEV_DB" ]; then
  echo "Production DATABASE_URL matches development DATABASE_URL. Refusing production preflight." >&2
  exit 1
fi

if [ -n "$STAGING_DB" ] && [ "$PROD_DB" = "$STAGING_DB" ]; then
  echo "Production DATABASE_URL matches staging DATABASE_URL. Refusing production preflight." >&2
  exit 1
fi

echo "✅ Production DB is separate from dev/staging."

LATEST_PROD_BACKUP="$(
  find backups/db -type f -name ".env.production.*.dump" -size +1k -print 2>/dev/null | sort | tail -1
)"

if [ -z "$LATEST_PROD_BACKUP" ]; then
  echo "No non-empty production DB backup found. Run: npm run db:backup:prod" >&2
  exit 1
fi

echo "✅ Latest production backup found: $LATEST_PROD_BACKUP"

npm run check:prod-readiness

echo "✅ Production preflight passed."
