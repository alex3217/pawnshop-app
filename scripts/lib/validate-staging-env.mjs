const mode = process.argv[2] || "deployed";
const env = process.env;
const errors = [];

if (mode === "deployed") {
  const { validateDeployedEnvironment } = await import(
    "../../apps/api/backend/src/config/deployedEnvironment.js"
  );
  validateDeployedEnvironment(env, { environment: "staging" });
}

const required = [
  "APP_NAME", "APP_ENV", "NODE_ENV", "PORT", "DATABASE_URL",
  "JWT_SECRET", "INTEGRATION_CREDENTIAL_ENCRYPTION_KEY",
  "FRONTEND_URL", "WEB_URL", "CORS_ORIGIN", "CORS_ORIGINS",
  "INVITE_ONLY_REGISTRATION_ENABLED", "AUTH_RATE_LIMIT_ENABLED",
  "AUTH_RATE_LIMIT_WINDOW_MS", "AUTH_RATE_LIMIT_IP_MAX",
  "AUTH_RATE_LIMIT_SENSITIVE_IP_MAX", "AUTH_RATE_LIMIT_IDENTIFIER_MAX",
  "AUTH_RATE_LIMIT_COMBINED_MAX", "TRUST_PROXY", "SMTP_HOST", "SMTP_PORT",
  "SMTP_SECURE", "EMAIL_FROM", "STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET", "STRIPE_CONNECT_WEBHOOK_SECRET",
  "STRIPE_PRICE_PRO", "STRIPE_PRICE_PREMIUM", "STRIPE_PRICE_ULTRA",
  "STRIPE_PRICE_BUYER_PLUS_MONTHLY", "STRIPE_PRICE_BUYER_PLUS_YEARLY",
  "STRIPE_PRICE_BUYER_PREMIUM_MONTHLY", "STRIPE_PRICE_BUYER_PREMIUM_YEARLY",
  "STRIPE_PRICE_BUYER_ULTRA_MONTHLY", "STRIPE_PRICE_BUYER_ULTRA_YEARLY",
  "AUCTION_SCHEDULER_ENABLED",
  "AUCTION_SCHEDULER_INTERVAL_MS", "AUCTION_SCHEDULER_BATCH_SIZE",
  "MARKETPLACE_RESERVATION_SCHEDULER_ENABLED",
  "MARKETPLACE_RESERVATION_SCHEDULER_INTERVAL_MS",
  "MARKETPLACE_RESERVATION_SCHEDULER_BATCH_SIZE",
  "MARKETPLACE_RESERVATION_TTL_MINUTES", "READINESS_TIMEOUT_MS",
];

const value = (name) => String(env[name] || "").trim();
const fail = (name, rule) => errors.push(`${name}: ${rule}`);
const placeholder = /(?:replace(?:[_ -]?me)?|change(?:[_ -]?me)?|placeholder|example|your[_ -]|todo|dummy|secret[_ -]?here)/i;

function isLocalHostname(hostname) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    /^127(?:\.|$)/.test(normalized) ||
    normalized === "::1" ||
    normalized === "[::1]";
}

for (const name of required) {
  if (!value(name)) fail(name, "is required");
  else if (placeholder.test(value(name))) fail(name, "contains a placeholder");
}

let approvedStagingDatabaseHost = "";
if (mode === "deployed") {
  const name = "STAGING_DATABASE_HOST";
  const host = value(name);
  const hostnamePattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/i;

  if (!host) fail(name, "is required in deployed mode");
  else if (placeholder.test(host)) fail(name, "contains a placeholder");
  else if (!hostnamePattern.test(host)) fail(name, "must be a hostname only without scheme, credentials, port, path, query, or fragment");
  else if (isLocalHostname(host)) fail(name, "must not target localhost or loopback");
  else approvedStagingDatabaseHost = host.toLowerCase();
}

if (value("APP_ENV") && value("APP_ENV") !== "staging") fail("APP_ENV", "must equal staging");
if (value("NODE_ENV") && value("NODE_ENV") !== "staging") fail("NODE_ENV", "must equal staging");
if (value("APP_NAME") && value("APP_NAME") !== "pawnloop-api") fail("APP_NAME", "must equal pawnloop-api");

function positiveInt(name, { max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value(name) && (!/^[1-9]\d*$/.test(value(name)) || Number(value(name)) > max)) {
    fail(name, `must be a positive integer no greater than ${max}`);
  }
}

positiveInt("PORT", { max: 65535 });
if (mode === "local" && value("PORT") && value("PORT") !== "6003") fail("PORT", "must equal 6003 in local mode");
if (mode === "local" && !value("PAWN_PORT")) fail("PAWN_PORT", "is required in local mode");
if (value("PAWN_PORT")) {
  positiveInt("PAWN_PORT", { max: 65535 });
  if (mode === "local" && value("PAWN_PORT") !== "6003") fail("PAWN_PORT", "must equal 6003 in local mode");
}

function boolean(name, expected) {
  if (value(name) && !["true", "false"].includes(value(name))) fail(name, "must be true or false");
  if (expected && value(name) && value(name) !== expected) fail(name, `must equal ${expected}`);
}
boolean("INVITE_ONLY_REGISTRATION_ENABLED", "true");
boolean("AUTH_RATE_LIMIT_ENABLED", "true");
boolean("SMTP_SECURE");
boolean("AUCTION_SCHEDULER_ENABLED", "false");
boolean("MARKETPLACE_RESERVATION_SCHEDULER_ENABLED", "false");
if (value("TRUST_PROXY") && !["0", "1"].includes(value("TRUST_PROXY"))) fail("TRUST_PROXY", "must be 0 or 1");
if (mode === "deployed" && value("TRUST_PROXY") && value("TRUST_PROXY") !== "1") fail("TRUST_PROXY", "must equal 1 behind Render");

for (const name of [
  "AUTH_RATE_LIMIT_WINDOW_MS", "AUTH_RATE_LIMIT_IP_MAX",
  "AUTH_RATE_LIMIT_SENSITIVE_IP_MAX", "AUTH_RATE_LIMIT_IDENTIFIER_MAX",
  "AUTH_RATE_LIMIT_COMBINED_MAX", "SMTP_PORT", "AUCTION_SCHEDULER_INTERVAL_MS",
  "AUCTION_SCHEDULER_BATCH_SIZE", "MARKETPLACE_RESERVATION_SCHEDULER_INTERVAL_MS",
  "MARKETPLACE_RESERVATION_SCHEDULER_BATCH_SIZE", "MARKETPLACE_RESERVATION_TTL_MINUTES",
  "READINESS_TIMEOUT_MS",
]) positiveInt(name, { max: name === "SMTP_PORT" ? 65535 : Number.MAX_SAFE_INTEGER });
if (Number(value("AUTH_RATE_LIMIT_IDENTIFIER_MAX")) <= Number(value("AUTH_RATE_LIMIT_COMBINED_MAX"))) {
  fail("AUTH_RATE_LIMIT_IDENTIFIER_MAX", "must be greater than AUTH_RATE_LIMIT_COMBINED_MAX");
}
if (Number(value("AUCTION_SCHEDULER_BATCH_SIZE")) > 100) fail("AUCTION_SCHEDULER_BATCH_SIZE", "must not exceed 100");
if (Number(value("MARKETPLACE_RESERVATION_SCHEDULER_BATCH_SIZE")) > 100) fail("MARKETPLACE_RESERVATION_SCHEDULER_BATCH_SIZE", "must not exceed 100");

function url(name, { list = false, database = false } = {}) {
  for (const raw of (list ? value(name).split(",") : [value(name)]).map((part) => part.trim()).filter(Boolean)) {
    try {
      const parsed = new URL(raw);
      const localHostname = isLocalHostname(parsed.hostname);
      if (database) {
        if (!["postgres:", "postgresql:"].includes(parsed.protocol)) fail(name, "must be a PostgreSQL URL");
        if (!parsed.hostname) fail(name, "must include a hostname");
        if (mode === "deployed" && localHostname) fail(name, "must not target localhost in deployed mode");
        if (
          mode === "deployed" &&
          parsed.hostname &&
          approvedStagingDatabaseHost &&
          parsed.hostname.toLowerCase() !== approvedStagingDatabaseHost
        ) fail(name, "hostname must exactly match STAGING_DATABASE_HOST");
      } else {
        if (!["http:", "https:"].includes(parsed.protocol)) fail(name, "must use HTTP or HTTPS");
        if (mode === "deployed" && parsed.protocol !== "https:") fail(name, "must use HTTPS in deployed mode");
        if (mode === "deployed" && localHostname) fail(name, "must not use localhost in deployed mode");
        if (!parsed.hostname) fail(name, "must include a hostname");
        if (parsed.username || parsed.password) fail(name, "must not contain userinfo");
        if (parsed.pathname !== "/") fail(name, "must not contain a path");
        if (parsed.search) fail(name, "must not contain a query string");
        if (parsed.hash) fail(name, "must not contain a fragment");
        if (raw !== parsed.origin) fail(name, "must use canonical browser Origin format without a trailing slash");
      }
    } catch { fail(name, "must be a valid URL"); }
  }
}
url("DATABASE_URL", { database: true });
url("FRONTEND_URL"); url("WEB_URL"); url("CORS_ORIGIN"); url("CORS_ORIGINS", { list: true });

if (value("JWT_SECRET") && value("JWT_SECRET").length < 32) fail("JWT_SECRET", "must be at least 32 characters");
if (value("INTEGRATION_CREDENTIAL_ENCRYPTION_KEY") && value("INTEGRATION_CREDENTIAL_ENCRYPTION_KEY").length < 32) fail("INTEGRATION_CREDENTIAL_ENCRYPTION_KEY", "must be at least 32 characters");
if (value("EMAIL_FROM") && !/^[^<>\s]+@[^<>\s]+$|^.+<[^<>\s]+@[^<>\s]+>$/.test(value("EMAIL_FROM"))) fail("EMAIL_FROM", "must contain a valid sender address");
if (value("SMTP_HOST") && (/\s/.test(value("SMTP_HOST")) || value("SMTP_HOST").includes(":"))) fail("SMTP_HOST", "must be a hostname without a port");

const formats = {
  STRIPE_SECRET_KEY: /^sk_test_[A-Za-z0-9_]+$/,
  STRIPE_PUBLISHABLE_KEY: /^pk_test_[A-Za-z0-9_]+$/,
  STRIPE_WEBHOOK_SECRET: /^whsec_[A-Za-z0-9_]+$/,
  STRIPE_CONNECT_WEBHOOK_SECRET: /^whsec_[A-Za-z0-9_]+$/,
  STRIPE_PRICE_PRO: /^price_[A-Za-z0-9_]+$/,
  STRIPE_PRICE_PREMIUM: /^price_[A-Za-z0-9_]+$/,
  STRIPE_PRICE_ULTRA: /^price_[A-Za-z0-9_]+$/,
  STRIPE_PRICE_BUYER_PLUS_MONTHLY: /^price_[A-Za-z0-9_]+$/,
  STRIPE_PRICE_BUYER_PLUS_YEARLY: /^price_[A-Za-z0-9_]+$/,
  STRIPE_PRICE_BUYER_PREMIUM_MONTHLY: /^price_[A-Za-z0-9_]+$/,
  STRIPE_PRICE_BUYER_PREMIUM_YEARLY: /^price_[A-Za-z0-9_]+$/,
  STRIPE_PRICE_BUYER_ULTRA_MONTHLY: /^price_[A-Za-z0-9_]+$/,
  STRIPE_PRICE_BUYER_ULTRA_YEARLY: /^price_[A-Za-z0-9_]+$/,
};
for (const [name, pattern] of Object.entries(formats)) {
  if (value(name) && !placeholder.test(value(name)) && !pattern.test(value(name))) fail(name, "has an invalid staging format");
}

if (errors.length) {
  console.error("Staging readiness failed:");
  for (const error of [...new Set(errors)]) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Staging readiness passed (${mode} mode); secret values were not printed.`);
