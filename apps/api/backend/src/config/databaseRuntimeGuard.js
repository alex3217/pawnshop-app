const LOOPBACK_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
]);
const ALLOWED_ENVIRONMENTS = new Set([
  "development",
  "test",
  "staging",
  "production",
]);
const EXPECTED_ENVIRONMENT_BY_PORT = new Map([
  [6001, "production"],
  [6002, "development"],
  [6003, "staging"],
]);
const PLACEHOLDER_PATTERN =
  /(^|[._-])(example|invalid|placeholder|replace|your|todo|changeme)([._-]|$)/i;

function normalizeEnvironment(env) {
  return String(env.APP_ENV ?? "").trim().toLowerCase();
}

function resolvePort(env) {
  const value = env.PORT || env.PAWN_PORT || "";

  if (String(value).trim() === "") {
    return null;
  }

  const port = Number(value);

  return Number.isInteger(port) ? port : null;
}

function requiredIdentity(env, key, errors) {
  const value = String(env[key] ?? "").trim();

  if (!value) {
    errors.push(`${key} must be configured.`);
  }

  return value;
}

export function parseDatabaseTarget(rawUrl) {
  const raw = String(rawUrl || "").trim();

  if (!raw) {
    throw new Error("DATABASE_URL is required.");
  }

  let parsed;

  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL.");
  }

  if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
    throw new Error("DATABASE_URL must use PostgreSQL.");
  }

  return {
    host: parsed.hostname.toLowerCase(),
    port: parsed.port || "5432",
    database: decodeURIComponent(parsed.pathname.replace(/^\/+/, "")),
  };
}

export function assertSafeDatabaseTargetForRuntime(env = process.env) {
  const environment = normalizeEnvironment(env);
  const runtimePort = resolvePort(env);
  const target = parseDatabaseTarget(env.DATABASE_URL);
  const errors = [];
  const isLoopback = LOOPBACK_HOSTS.has(target.host);

  if (!ALLOWED_ENVIRONMENTS.has(environment)) {
    errors.push("APP_ENV must be development, test, staging, or production.");
  }

  const expectedEnvironment = EXPECTED_ENVIRONMENT_BY_PORT.get(runtimePort);
  if (expectedEnvironment && environment !== expectedEnvironment) {
    errors.push(`Port ${runtimePort} requires APP_ENV=${expectedEnvironment}.`);
  }

  if (environment === "development") {
    if (runtimePort !== 6002) {
      errors.push("Development must use port 6002.");
    }
    if (!isLoopback) {
      errors.push("Development must use a loopback PostgreSQL host.");
    }
    if (target.database !== "pawnshop_dev") {
      errors.push("Development must use database pawnshop_dev.");
    }
  }

  if (environment === "test") {
    if (!isLoopback) {
      errors.push("Test must use a loopback PostgreSQL host.");
    }
    if (!/(_test|_ci)$/i.test(target.database)) {
      errors.push("Test database name must end in _test or _ci.");
    }
  }

  if (environment === "staging" || environment === "production") {
    const expectedHost = requiredIdentity(
      env,
      "EXPECTED_DATABASE_HOST",
      errors,
    ).toLowerCase();
    const expectedName = requiredIdentity(
      env,
      "EXPECTED_DATABASE_NAME",
      errors,
    );

    if (expectedHost && target.host !== expectedHost) {
      errors.push("DATABASE_URL host does not match EXPECTED_DATABASE_HOST exactly.");
    }
    if (expectedName && target.database !== expectedName) {
      errors.push("DATABASE_URL database does not match EXPECTED_DATABASE_NAME exactly.");
    }
    if (isLoopback) {
      errors.push(`${environment === "staging" ? "Staging" : "Production"} must not use a loopback database.`);
    }
    if (PLACEHOLDER_PATTERN.test(expectedHost) || PLACEHOLDER_PATTERN.test(expectedName)) {
      errors.push("Expected database identity contains placeholder values.");
    }

    if (environment === "staging" && /(_dev|_test|_ci)$/i.test(target.database)) {
      errors.push("Staging must not use a development, test, or CI database.");
    }

    if (
      environment === "production" &&
      (/(^|[_-])(dev|test|ci|staging)([_-]|$)/i.test(target.database) ||
        PLACEHOLDER_PATTERN.test(target.database))
    ) {
      errors.push("Production must not use a development, test, CI, staging, or placeholder database.");
    }
  }

  if (errors.length > 0) {
    const error = new Error(
      ["Unsafe database target.", ...errors.map((message) => `- ${message}`)].join("\n"),
    );
    error.code = "UNSAFE_DATABASE_TARGET";
    throw error;
  }

  console.log(
    `[database-target] environment=${environment} runtimePort=${runtimePort ?? "unset"} location=${isLoopback ? "loopback" : "remote"} database=${target.database}`,
  );

  return { environment, runtimePort, ...target };
}
