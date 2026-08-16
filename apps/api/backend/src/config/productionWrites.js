export const PUBLIC_PREVIEW_ERROR_CODE = "PUBLIC_PREVIEW_READ_ONLY";
export const PUBLIC_PREVIEW_RETRY_AFTER_SECONDS = 300;

export const PRODUCTION_AUTH_MUTATION_ALLOWLIST = Object.freeze([
  "POST /auth/login",
  "POST /api/auth/login",
  "POST /auth/mfa/challenge",
  "POST /api/auth/mfa/challenge",
  "POST /auth/refresh",
  "POST /api/auth/refresh",
]);

export const PRODUCTION_WEBHOOK_ALLOWLIST = Object.freeze([
  "POST /webhooks/stripe",
  "POST /api/webhooks/stripe",
  "POST /webhooks/stripe/connect",
  "POST /api/webhooks/stripe/connect",
]);

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const AUTH_MUTATIONS = new Set(PRODUCTION_AUTH_MUTATION_ALLOWLIST);

function normalizedEnvironment(env) {
  const appEnvironment = String(env.APP_ENV || "").trim().toLowerCase();
  if (appEnvironment) return appEnvironment;
  return String(env.NODE_ENV || "development").trim().toLowerCase();
}

export function getProductionWriteState(env = process.env) {
  const production = normalizedEnvironment(env) === "production";
  const writesEnabled = production && env.PRODUCTION_WRITES_ENABLED === "true";

  return Object.freeze({
    production,
    writesEnabled,
    readOnly: production && !writesEnabled,
  });
}

function requestRouteKey(req) {
  return `${String(req.method || "").toUpperCase()} ${req.path}`;
}

export function createProductionWriteGate({ env = process.env } = {}) {
  return function productionWriteGate(req, res, next) {
    const state = getProductionWriteState(env);

    if (!state.readOnly || SAFE_METHODS.has(req.method)) {
      return next();
    }

    if (AUTH_MUTATIONS.has(requestRouteKey(req))) {
      return next();
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Retry-After", String(PUBLIC_PREVIEW_RETRY_AFTER_SECONDS));
    return res.status(503).json({
      success: false,
      error: "PawnLoop public preview is currently read-only.",
      code: PUBLIC_PREVIEW_ERROR_CODE,
      requestId: req.requestId,
    });
  };
}

export function createPublicCapabilitiesPayload(env = process.env) {
  const state = getProductionWriteState(env);
  return {
    success: true,
    publicPreview: {
      mode: state.readOnly ? "read-only" : "write-enabled",
      readOnly: state.readOnly,
      productionWritesEnabled: state.writesEnabled,
      errorCode: state.readOnly ? PUBLIC_PREVIEW_ERROR_CODE : null,
      retryAfterSeconds: PUBLIC_PREVIEW_RETRY_AFTER_SECONDS,
    },
  };
}
