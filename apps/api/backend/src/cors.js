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
const DEPLOYED_CORS_CONFIGURATION_HELP =
  "CORS_ORIGINS, CORS_ORIGIN, FRONTEND_URL, or WEB_URL must contain explicit approved HTTP(S) origins.";

function invalidDeployedCorsConfiguration(reason) {
  return new Error(
    `[config] Invalid deployed CORS configuration: ${reason} ${DEPLOYED_CORS_CONFIGURATION_HELP}`,
  );
}

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
    throw invalidDeployedCorsConfiguration(
      "An origin allowlist is required in staging and production.",
    );
  }

  const isProduction = environments.includes("production");

  for (const origin of allowedOrigins) {
    if (origin === "*") {
      throw invalidDeployedCorsConfiguration(
        "Wildcards are not allowed.",
      );
    }

    let parsed;

    try {
      parsed = new URL(origin);
    } catch {
      throw invalidDeployedCorsConfiguration(
        "Every entry must be a valid absolute HTTP or HTTPS origin.",
      );
    }

    const isCanonicalBrowserOrigin =
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      Boolean(parsed.hostname) &&
      !parsed.hostname.includes("*") &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.pathname === "/" &&
      parsed.search === "" &&
      parsed.hash === "" &&
      origin === parsed.origin;

    if (!isCanonicalBrowserOrigin) {
      throw invalidDeployedCorsConfiguration(
        "Entries cannot include paths, queries, fragments, credentials, or wildcard hostnames.",
      );
    }

    if (isProduction && LOCAL_DEVELOPMENT_HOSTNAMES.has(parsed.hostname)) {
      throw invalidDeployedCorsConfiguration(
        "Production origins cannot use localhost or loopback hosts.",
      );
    }

    if (isProduction && parsed.protocol !== "https:") {
      throw invalidDeployedCorsConfiguration(
        "Production origins must use HTTPS.",
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
