const DEFAULTS = Object.freeze({
  windowMs: 15 * 60 * 1000,
  ipMax: 30,
  sensitiveIpMax: 10,
  identifierMax: 20,
  combinedMax: 5,
});

function parseBoolean(name, value, fallback) {
  if (value === undefined || value === "") return fallback;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new Error(`${name} must be true, false, 1, or 0`);
}

function parseSafeInteger(name, value, fallback) {
  if (value === undefined || value === "") return fallback;
  if (!/^[1-9]\d*$/.test(String(value))) {
    throw new Error(`${name} must be a positive integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${name} must be a safe positive integer`);
  }
  return parsed;
}

export function loadAuthRateLimitConfig(env = process.env) {
  const enabled = parseBoolean(
    "AUTH_RATE_LIMIT_ENABLED",
    env.AUTH_RATE_LIMIT_ENABLED,
    true,
  );

  const config = {
    enabled,
    windowMs: parseSafeInteger(
      "AUTH_RATE_LIMIT_WINDOW_MS",
      env.AUTH_RATE_LIMIT_WINDOW_MS,
      DEFAULTS.windowMs,
    ),
    ipMax: parseSafeInteger(
      "AUTH_RATE_LIMIT_IP_MAX",
      env.AUTH_RATE_LIMIT_IP_MAX,
      DEFAULTS.ipMax,
    ),
    sensitiveIpMax: parseSafeInteger(
      "AUTH_RATE_LIMIT_SENSITIVE_IP_MAX",
      env.AUTH_RATE_LIMIT_SENSITIVE_IP_MAX,
      DEFAULTS.sensitiveIpMax,
    ),
    identifierMax: parseSafeInteger(
      "AUTH_RATE_LIMIT_IDENTIFIER_MAX",
      env.AUTH_RATE_LIMIT_IDENTIFIER_MAX,
      DEFAULTS.identifierMax,
    ),
    combinedMax: parseSafeInteger(
      "AUTH_RATE_LIMIT_COMBINED_MAX",
      env.AUTH_RATE_LIMIT_COMBINED_MAX,
      DEFAULTS.combinedMax,
    ),
    keySecret: String(
      env.JWT_SECRET ||
        env.ACCESS_TOKEN_SECRET ||
        env.JWT_ACCESS_SECRET ||
        env.AUTH_SECRET ||
        "",
    ).trim(),
  };

  if (enabled && !config.keySecret) {
    throw new Error(
      "Authentication rate limiting requires the configured JWT/auth secret",
    );
  }

  if (enabled && config.identifierMax <= config.combinedMax) {
    throw new Error(
      "AUTH_RATE_LIMIT_IDENTIFIER_MAX must be greater than AUTH_RATE_LIMIT_COMBINED_MAX",
    );
  }

  return Object.freeze(config);
}

export function loadTrustProxyConfig(env = process.env) {
  const raw = String(env.TRUST_PROXY ?? "0").trim();
  if (raw !== "0" && raw !== "1") {
    throw new Error("TRUST_PROXY must be 0 or 1");
  }
  const hops = Number(raw);
  return hops;
}
