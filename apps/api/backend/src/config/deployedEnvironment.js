import { assertDeployedCorsConfiguration } from "../cors.js";
import { loadAuthRateLimitConfig, loadTrustProxyConfig } from "./authRateLimit.js";
import { loadMfaConfig } from "./mfa.js";

const DEPLOYED_ENVIRONMENTS = new Set(["staging", "production"]);
const FORBIDDEN_PRODUCTION_DATABASE_NAMES = /(?:^|[_-])(test|testing|staging|stage|development|dev|local)(?:$|[_-])/i;
const PLACEHOLDER = /(?:replace(?:[_ -]?me)?|change(?:[_ -]?me)?|placeholder|example|your[_ -]|todo|dummy|secret[_ -]?here)/i;
const SECRET_NAMES = new Set([
  "DATABASE_URL", "JWT_SECRET", "ACCESS_TOKEN_SECRET", "JWT_ACCESS_SECRET",
  "AUTH_SECRET", "INTEGRATION_CREDENTIAL_ENCRYPTION_KEY", "MFA_ENCRYPTION_KEY",
  "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_CONNECT_WEBHOOK_SECRET",
  "RESEND_API_KEY", "SMTP_USER", "SMTP_PASS",
  "UPLOAD_STORAGE_ACCESS_KEY_ID", "UPLOAD_STORAGE_SECRET_ACCESS_KEY",
]);

export class DeployedEnvironmentValidationError extends Error {
  constructor(environment, violations) {
    super(
      `[config] Invalid ${environment} backend environment: ${[
        ...new Set(violations),
      ].join("; ")}`,
    );
    this.name = "DeployedEnvironmentValidationError";
    this.code = "DEPLOYED_ENVIRONMENT_INVALID";
    this.environment = environment;
    this.violations = Object.freeze([...new Set(violations)]);
  }
}

function clean(env, name) {
  return String(env[name] ?? "").trim();
}

export function isLocalOrLoopbackHostname(value) {
  const hostname = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");

  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "::1" ||
    /^127(?:\.|$)/.test(hostname) ||
    /^::ffff:127(?:\.|$)/.test(hostname) ||
    /^::ffff:7f[0-9a-f]{2}:/.test(hostname)
  );
}

function requireValue(env, name, violations, { secret = SECRET_NAMES.has(name) } = {}) {
  const value = clean(env, name);
  if (!value) violations.push(`${name} is required`);
  else if (PLACEHOLDER.test(value)) violations.push(`${name} contains a placeholder`);
  return secret ? Boolean(value) : value;
}

function parseExplicitBoolean(env, name, violations, expected) {
  const value = clean(env, name);
  if (!value) {
    violations.push(`${name} is required`);
    return null;
  }
  if (value !== "true" && value !== "false") {
    violations.push(`${name} must be exactly true or false`);
    return null;
  }
  if (expected !== undefined && value !== String(expected)) {
    violations.push(`${name} must equal ${expected}`);
  }
  return value === "true";
}

function positiveInteger(env, name, violations, { maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const value = clean(env, name);
  if (!value) {
    violations.push(`${name} is required`);
    return null;
  }
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > maximum) {
    violations.push(`${name} must be a positive integer no greater than ${maximum}`);
    return null;
  }
  return Number(value);
}

function canonicalHttpsOrigin(env, name, violations, { list = false } = {}) {
  const configured = requireValue(env, name, violations, { secret: false });
  if (!configured) return [];
  const values = (list ? configured.split(",") : [configured]).map((value) => value.trim());
  const origins = [];
  for (const value of values) {
    try {
      const url = new URL(value);
      if (
        url.protocol !== "https:" || !url.hostname || url.username || url.password ||
        url.pathname !== "/" || url.search || url.hash || value !== url.origin ||
        isLocalOrLoopbackHostname(url.hostname)
      ) {
        throw new Error("invalid origin");
      }
      origins.push(url.origin);
    } catch {
      violations.push(`${name} must contain canonical non-local HTTPS origin values`);
    }
  }
  return origins;
}

function validateDatabase(env, environment, violations) {
  const approvedName = environment === "production" ? "PRODUCTION_DATABASE_HOST" : "STAGING_DATABASE_HOST";
  const approvedHost = requireValue(env, approvedName, violations, { secret: false }).toLowerCase();
  if (approvedHost && (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/i.test(approvedHost) || isLocalOrLoopbackHostname(approvedHost))) {
    violations.push(`${approvedName} must be a non-local hostname only`);
  }

  const raw = clean(env, "DATABASE_URL");
  if (!raw) {
    violations.push("DATABASE_URL is required");
    return { approvedHost: approvedHost || null, databaseName: null };
  }
  try {
    const url = new URL(raw);
    const hostname = url.hostname.toLowerCase();
    const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    if (!new Set(["postgres:", "postgresql:"]).has(url.protocol)) {
      violations.push("DATABASE_URL must use PostgreSQL");
    }
    if (!hostname || isLocalOrLoopbackHostname(hostname)) {
      violations.push("DATABASE_URL must use a non-local hostname");
    }
    if (approvedHost && hostname !== approvedHost) {
      violations.push(`DATABASE_URL hostname must match ${approvedName}`);
    }
    if (!databaseName) violations.push("DATABASE_URL must include a database name");
    if (environment === "production" && FORBIDDEN_PRODUCTION_DATABASE_NAMES.test(databaseName)) {
      violations.push("DATABASE_URL database name is not permitted in production");
    }
    return { approvedHost: approvedHost || null, databaseName: databaseName || null };
  } catch {
    violations.push("DATABASE_URL must be a valid PostgreSQL URL");
    return { approvedHost: approvedHost || null, databaseName: null };
  }
}

function validateEmail(env, violations) {
  const provider = requireValue(env, "EMAIL_PROVIDER", violations, { secret: false }).toLowerCase();
  requireValue(env, "EMAIL_FROM", violations, { secret: false });
  if (provider === "resend") {
    requireValue(env, "RESEND_API_KEY", violations);
    positiveInteger(env, "RESEND_API_TIMEOUT_MS", violations, { maximum: 30_000 });
  } else if (provider === "smtp") {
    requireValue(env, "SMTP_HOST", violations, { secret: false });
    positiveInteger(env, "SMTP_PORT", violations, { maximum: 65_535 });
    parseExplicitBoolean(env, "SMTP_SECURE", violations);
    requireValue(env, "SMTP_USER", violations);
    requireValue(env, "SMTP_PASS", violations);
    for (const name of ["SMTP_CONNECTION_TIMEOUT_MS", "SMTP_GREETING_TIMEOUT_MS", "SMTP_SOCKET_TIMEOUT_MS"]) {
      positiveInteger(env, name, violations, { maximum: 60_000 });
    }
  } else if (provider) {
    violations.push("EMAIL_PROVIDER must equal resend or smtp");
  }
  return provider || null;
}

function validateScheduler(env, violations) {
  const auctionEnabled = parseExplicitBoolean(env, "AUCTION_SCHEDULER_ENABLED", violations);
  const reservationEnabled = parseExplicitBoolean(env, "MARKETPLACE_RESERVATION_SCHEDULER_ENABLED", violations);
  const owner = requireValue(env, "SCHEDULER_OWNER", violations, { secret: false }).toLowerCase();
  const allowedOwners = new Set(["disabled", "api-single-instance", "dedicated-worker"]);
  if (owner && !allowedOwners.has(owner)) {
    violations.push("SCHEDULER_OWNER must equal disabled, api-single-instance, or dedicated-worker");
  }
  if (owner === "disabled" && (auctionEnabled || reservationEnabled)) {
    violations.push("SCHEDULER_OWNER disabled requires both schedulers to be false");
  }
  if (owner === "dedicated-worker" && (auctionEnabled || reservationEnabled)) {
    violations.push("SCHEDULER_OWNER dedicated-worker requires API scheduler flags to be false");
  }
  if (owner === "api-single-instance" && auctionEnabled === false && reservationEnabled === false) {
    violations.push("SCHEDULER_OWNER api-single-instance requires at least one scheduler to be true");
  }
  for (const name of [
    "AUCTION_SCHEDULER_INTERVAL_MS", "AUCTION_SCHEDULER_BATCH_SIZE",
    "MARKETPLACE_RESERVATION_SCHEDULER_INTERVAL_MS",
    "MARKETPLACE_RESERVATION_SCHEDULER_BATCH_SIZE", "MARKETPLACE_RESERVATION_TTL_MINUTES",
  ]) positiveInteger(env, name, violations, { maximum: name.endsWith("BATCH_SIZE") ? 100 : Number.MAX_SAFE_INTEGER });
  return { owner: owner || null, auctionEnabled, reservationEnabled };
}

function validateDurableUploads(env, violations) {
  const enabled = parseExplicitBoolean(env, "DURABLE_UPLOADS_ENABLED", violations);
  const uploadMaximums = {
    UPLOAD_MAX_FILE_BYTES: 10 * 1024 * 1024,
    UPLOAD_MAX_FILES: 10,
    UPLOAD_MAX_AGGREGATE_BYTES: 50 * 1024 * 1024,
    UPLOAD_MAX_WIDTH: 12_000,
    UPLOAD_MAX_HEIGHT: 12_000,
    UPLOAD_MAX_PIXELS: 40_000_000,
    UPLOAD_RATE_LIMIT_WINDOW_MS: 15 * 60_000,
    UPLOAD_RATE_LIMIT_USER_MAX: 300,
    UPLOAD_RATE_LIMIT_IP_MAX: 600,
    UPLOAD_MAX_CONCURRENT: 4,
    UPLOAD_STORAGE_TIMEOUT_MS: 30_000,
  };
  for (const [name, maximum] of Object.entries(uploadMaximums)) {
    positiveInteger(env, name, violations, { maximum });
  }
  const number = (name) => Number(clean(env, name));
  if (number("UPLOAD_MAX_AGGREGATE_BYTES") < number("UPLOAD_MAX_FILE_BYTES")) {
    violations.push("UPLOAD_MAX_AGGREGATE_BYTES must be at least UPLOAD_MAX_FILE_BYTES");
  }
  if (number("UPLOAD_MAX_PIXELS") > number("UPLOAD_MAX_WIDTH") * number("UPLOAD_MAX_HEIGHT")) {
    violations.push("UPLOAD_MAX_PIXELS cannot exceed the configured width and height product");
  }
  if (!enabled) return false;

  for (const name of ["UPLOAD_STORAGE_REGION", "UPLOAD_STORAGE_BUCKET"]) {
    requireValue(env, name, violations, { secret: false });
  }
  requireValue(env, "UPLOAD_STORAGE_ACCESS_KEY_ID", violations);
  requireValue(env, "UPLOAD_STORAGE_SECRET_ACCESS_KEY", violations);
  parseExplicitBoolean(env, "UPLOAD_STORAGE_FORCE_PATH_STYLE", violations);
  for (const name of ["UPLOAD_STORAGE_ENDPOINT", "UPLOAD_STORAGE_PUBLIC_BASE_URL"]) {
    const raw = requireValue(env, name, violations, { secret: false });
    if (!raw) continue;
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:" || url.username || url.password || isLocalOrLoopbackHostname(url.hostname)) {
        throw new Error("invalid durable storage URL");
      }
    } catch {
      violations.push(`${name} must be a non-local HTTPS URL without credentials`);
    }
  }
  return true;
}

export function validateDeployedEnvironment(env, { environment } = {}) {
  const target = String(environment || env.APP_ENV || "").trim().toLowerCase();
  if (!DEPLOYED_ENVIRONMENTS.has(target)) {
    throw new DeployedEnvironmentValidationError(target || "deployed", [
      "environment must equal staging or production",
    ]);
  }

  const violations = [];
  if (clean(env, "APP_ENV") !== target) violations.push(`APP_ENV must equal ${target}`);
  if (clean(env, "NODE_ENV") !== target) violations.push(`NODE_ENV must equal ${target}`);
  if (requireValue(env, "APP_NAME", violations, { secret: false }) && clean(env, "APP_NAME") !== "pawnloop-api") {
    violations.push("APP_NAME must equal pawnloop-api");
  }
  const revision = requireValue(env, "APP_VERSION", violations, { secret: false });
  if (revision && (!/^[A-Za-z0-9][A-Za-z0-9._/-]{6,127}$/.test(revision) || /development|unknown|latest/i.test(revision))) {
    violations.push("APP_VERSION must be immutable revision metadata");
  }

  canonicalHttpsOrigin(env, "API_ORIGIN", violations);
  canonicalHttpsOrigin(env, "FRONTEND_URL", violations);
  canonicalHttpsOrigin(env, "WEB_URL", violations);
  canonicalHttpsOrigin(env, "CORS_ORIGIN", violations);
  const corsOrigins = canonicalHttpsOrigin(env, "CORS_ORIGINS", violations, { list: true });
  try { assertDeployedCorsConfiguration(env); } catch { violations.push("deployed HTTP and Socket.IO CORS allowlist is invalid"); }

  const database = validateDatabase(env, target, violations);
  const jwtPresent = requireValue(env, "JWT_SECRET", violations);
  if (jwtPresent && clean(env, "JWT_SECRET").length < 32) violations.push("JWT_SECRET must be at least 32 characters");
  const integrationPresent = requireValue(env, "INTEGRATION_CREDENTIAL_ENCRYPTION_KEY", violations);
  if (integrationPresent && clean(env, "INTEGRATION_CREDENTIAL_ENCRYPTION_KEY").length < 32) {
    violations.push("INTEGRATION_CREDENTIAL_ENCRYPTION_KEY must be at least 32 characters");
  }

  const stripeSecret = clean(env, "STRIPE_SECRET_KEY");
  requireValue(env, "STRIPE_SECRET_KEY", violations);
  requireValue(env, "STRIPE_PUBLISHABLE_KEY", violations);
  requireValue(env, "STRIPE_WEBHOOK_SECRET", violations);
  const stripePrefix = target === "production" ? "sk_live_" : "sk_test_";
  const publishablePrefix = target === "production" ? "pk_live_" : "pk_test_";
  if (stripeSecret && !stripeSecret.startsWith(stripePrefix)) violations.push(`STRIPE_SECRET_KEY must use ${target === "production" ? "live" : "test"} mode`);
  if (clean(env, "STRIPE_PUBLISHABLE_KEY") && !clean(env, "STRIPE_PUBLISHABLE_KEY").startsWith(publishablePrefix)) {
    violations.push(`STRIPE_PUBLISHABLE_KEY must use ${target === "production" ? "live" : "test"} mode`);
  }
  if (clean(env, "STRIPE_WEBHOOK_SECRET") && !clean(env, "STRIPE_WEBHOOK_SECRET").startsWith("whsec_")) violations.push("STRIPE_WEBHOOK_SECRET has an invalid format");
  const connectEnabled = parseExplicitBoolean(env, "STRIPE_CONNECT_ENABLED", violations);
  if (connectEnabled) requireValue(env, "STRIPE_CONNECT_WEBHOOK_SECRET", violations);
  if (clean(env, "STRIPE_CONNECT_WEBHOOK_SECRET") && !clean(env, "STRIPE_CONNECT_WEBHOOK_SECRET").startsWith("whsec_")) {
    violations.push("STRIPE_CONNECT_WEBHOOK_SECRET has an invalid format");
  }

  const emailProvider = validateEmail(env, violations);
  let trustProxy = null;
  try {
    if (!clean(env, "TRUST_PROXY")) throw new Error("missing");
    trustProxy = loadTrustProxyConfig(env);
    if (trustProxy !== 1) violations.push("TRUST_PROXY must equal 1 for deployed Render services");
  } catch { violations.push("TRUST_PROXY must be explicitly set to 1"); }
  const inviteOnly = parseExplicitBoolean(env, "INVITE_ONLY_REGISTRATION_ENABLED", violations);
  parseExplicitBoolean(env, "AUTH_RATE_LIMIT_ENABLED", violations, true);
  for (const name of [
    "AUTH_RATE_LIMIT_WINDOW_MS", "AUTH_RATE_LIMIT_IP_MAX", "AUTH_RATE_LIMIT_SENSITIVE_IP_MAX",
    "AUTH_RATE_LIMIT_IDENTIFIER_MAX", "AUTH_RATE_LIMIT_COMBINED_MAX",
  ]) positiveInteger(env, name, violations);
  try {
    const rateLimit = loadAuthRateLimitConfig(env);
    if (!rateLimit.enabled) violations.push("AUTH_RATE_LIMIT_ENABLED must equal true");
  } catch (error) { violations.push(error.message); }

  const mfaMode = requireValue(env, "MFA_MODE", violations, { secret: false }).toLowerCase();
  try { loadMfaConfig(env); } catch (error) { violations.push(error.message); }
  const schedulers = validateScheduler(env, violations);
  const durableUploadsEnabled = validateDurableUploads(env, violations);
  const readinessTimeoutMs = positiveInteger(env, "READINESS_TIMEOUT_MS", violations, { maximum: 30_000 });
  positiveInteger(env, "PORT", violations, { maximum: 65_535 });

  for (const name of ["ALLOW_UNSAFE_STARTUP", "SKIP_DEPLOYED_ENV_VALIDATION", "DISABLE_DATABASE_GUARD", "STAGING_VALIDATION_MODE"]) {
    if (clean(env, name)) violations.push(`${name} is prohibited in ${target}`);
  }

  if (violations.length) throw new DeployedEnvironmentValidationError(target, violations);

  return Object.freeze({
    environment: target,
    service: "pawnloop-api",
    revision,
    apiOrigin: clean(env, "API_ORIGIN"),
    frontendOrigin: clean(env, "FRONTEND_URL"),
    corsOriginCount: corsOrigins.length,
    databaseHost: database.approvedHost,
    trustProxy,
    inviteOnlyRegistration: inviteOnly,
    authRateLimitEnabled: true,
    mfaMode,
    stripeMode: target === "production" ? "live" : "test",
    stripeConnectEnabled: connectEnabled,
    emailProvider,
    schedulerOwner: schedulers.owner,
    auctionSchedulerEnabled: schedulers.auctionEnabled,
    reservationSchedulerEnabled: schedulers.reservationEnabled,
    durableUploadsEnabled,
    readinessTimeoutMs,
  });
}

export function validateCurrentDeployedEnvironment(env = process.env) {
  const appEnvironment = clean(env, "APP_ENV").toLowerCase();
  const nodeEnvironment = clean(env, "NODE_ENV").toLowerCase();
  const appIsDeployed = DEPLOYED_ENVIRONMENTS.has(appEnvironment);
  const nodeIsDeployed = DEPLOYED_ENVIRONMENTS.has(nodeEnvironment);

  if (!appIsDeployed && !nodeIsDeployed) return null;

  if (appIsDeployed && nodeIsDeployed && appEnvironment !== nodeEnvironment) {
    throw new DeployedEnvironmentValidationError("deployed", [
      "APP_ENV and NODE_ENV identify conflicting deployed environments",
    ]);
  }

  const target = appIsDeployed ? appEnvironment : nodeEnvironment;
  return validateDeployedEnvironment(env, { environment: target });
}
