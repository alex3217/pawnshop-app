const PAWNLOOP_PREVIEW_SUFFIX = ".pawnloop-frontend.pages.dev";
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function parseAllowedOrigins(...values) {
  return new Set(
    values
      .flatMap((value) => String(value || "").split(","))
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function isPawnLoopPreviewOrigin(origin) {
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname.endsWith(PAWNLOOP_PREVIEW_SUFFIX)) return false;

  const alias = hostname.slice(0, -PAWNLOOP_PREVIEW_SUFFIX.length);
  return DNS_LABEL.test(alias);
}

function isCanonicalRequestOrigin(origin) {
  try {
    const parsed = new URL(origin);
    return (
      ["http:", "https:"].includes(parsed.protocol) &&
      !parsed.username &&
      !parsed.password &&
      parsed.pathname === "/" &&
      !parsed.search &&
      !parsed.hash &&
      origin === parsed.origin
    );
  } catch {
    return false;
  }
}

export function createCorsOriginValidator({
  allowedOrigins,
  appEnv,
  previewOriginsEnabled,
}) {
  const allowPawnLoopPreviews =
    appEnv === "staging" && previewOriginsEnabled === true;

  return function validateOrigin(origin, callback) {
    if (!origin) return callback(null, true);
    if (!isCanonicalRequestOrigin(origin)) {
      const error = new Error(`CORS blocked: ${origin}`);
      error.statusCode = 403;
      return callback(error);
    }
    if (allowedOrigins.has(origin)) return callback(null, true);
    if (allowPawnLoopPreviews && isPawnLoopPreviewOrigin(origin)) {
      return callback(null, true);
    }

    const error = new Error(`CORS blocked: ${origin}`);
    error.statusCode = 403;
    return callback(error);
  };
}

export function loadCorsPolicy(env = process.env) {
  const allowedOrigins = parseAllowedOrigins(
    env.CORS_ORIGINS,
    env.CORS_ORIGIN,
    env.FRONTEND_URL,
    env.WEB_URL,
  );
  const appEnv = String(env.APP_ENV || "").trim().toLowerCase();

  return {
    allowedOrigins,
    appEnv,
    previewOriginsEnabled:
      String(env.CORS_ALLOW_PAWNLOOP_PREVIEWS || "").trim().toLowerCase() === "true",
  };
}

export function createCorsOptions(policy) {
  return {
    origin: createCorsOriginValidator(policy),
    credentials: true,
    optionsSuccessStatus: 204,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "X-Request-Id",
      "Stripe-Signature",
    ],
  };
}
