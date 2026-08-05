const ORIGIN_ENV_KEYS = [
  "CORS_ORIGINS",
  "CORS_ORIGIN",
  "FRONTEND_URL",
  "WEB_URL",
];

const RESTRICTED_ENVIRONMENTS = new Set(["production", "staging"]);
const LOCAL_DEVELOPMENT_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
]);

export function parseAllowedOrigins(env = process.env) {
  return new Set(
    ORIGIN_ENV_KEYS.flatMap((key) => String(env[key] || "").split(","))
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
}

export function assertDeployedCorsConfiguration(env = process.env) {
  const environments = [env.APP_ENV, env.NODE_ENV]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);

  if (!environments.some((value) => RESTRICTED_ENVIRONMENTS.has(value))) {
    return parseAllowedOrigins(env);
  }

  const allowedOrigins = parseAllowedOrigins(env);

  if (allowedOrigins.size === 0) {
    throw new Error(
      "[config] A CORS origin allowlist is required in deployed environments.",
    );
  }

  const isProduction = environments.includes("production");

  for (const origin of allowedOrigins) {
    if (origin === "*") {
      throw new Error(
        '[config] Invalid deployed CORS origin "*": wildcards are not allowed.',
      );
    }

    let parsed;

    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`[config] Invalid deployed CORS origin: ${origin}`);
    }

    const isCanonicalBrowserOrigin =
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      Boolean(parsed.hostname) &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.pathname === "/" &&
      parsed.search === "" &&
      parsed.hash === "" &&
      origin === parsed.origin;

    if (!isCanonicalBrowserOrigin) {
      throw new Error(`[config] Invalid deployed CORS origin: ${origin}`);
    }

    if (isProduction && LOCAL_DEVELOPMENT_HOSTNAMES.has(parsed.hostname)) {
      throw new Error(
        `[config] Production CORS origins cannot use localhost or loopback hosts: ${origin}`,
      );
    }

    if (isProduction && parsed.protocol !== "https:") {
      throw new Error(
        `[config] Production CORS origins must use HTTPS: ${origin}`,
      );
    }
  }

  return allowedOrigins;
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
