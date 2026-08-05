const ORIGIN_ENV_KEYS = [
  "CORS_ORIGINS",
  "CORS_ORIGIN",
  "FRONTEND_URL",
  "WEB_URL",
];

export function parseAllowedOrigins(env = process.env) {
  return new Set(
    ORIGIN_ENV_KEYS.flatMap((key) => String(env[key] || "").split(","))
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
}

export function createCorsOriginHandler(allowedOrigins) {
  return (origin, callback) => {
    if (!origin || allowedOrigins.size === 0 || allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    const error = new Error(`CORS blocked: ${origin}`);
    error.statusCode = 403;
    return callback(error);
  };
}
