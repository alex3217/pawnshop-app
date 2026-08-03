import path from "node:path";

const ALLOWED_APP_ENVIRONMENTS = new Set([
  "development",
  "test",
  "staging",
  "production",
]);
const EXPECTED_ENV_FILE_BY_ENVIRONMENT = new Map([
  ["development", ".env.development"],
  ["test", ".env.test"],
  ["staging", ".env.staging"],
  ["production", ".env.production"],
]);

function resolveAllowedEnvironmentFile({
  root,
  environment,
  candidate,
  exists,
  realpath,
  explicit,
}) {
  if (!exists(candidate)) {
    throw new Error(
      explicit
        ? "Explicit environment file does not exist."
        : "Development environment file does not exist.",
    );
  }

  const realRoot = realpath(root);
  const realCandidate = realpath(candidate);
  const expectedBasename = EXPECTED_ENV_FILE_BY_ENVIRONMENT.get(environment);

  if (
    path.dirname(realCandidate) !== realRoot ||
    path.basename(realCandidate) !== expectedBasename
  ) {
    throw new Error(
      `Environment file must be ${expectedBasename} directly inside the backend root.`,
    );
  }

  return realCandidate;
}

export function selectRuntimeEnvFile({
  backendRoot,
  appEnv,
  explicitPath,
  exists,
  realpath,
}) {
  const root = path.resolve(backendRoot);
  const environment = String(appEnv ?? "")
    .trim()
    .toLowerCase();

  if (!ALLOWED_APP_ENVIRONMENTS.has(environment)) {
    throw new Error(
      `APP_ENV must be one of development, test, staging, or production; received ${environment || "(blank)"}.`,
    );
  }

  const explicit = String(explicitPath ?? "").trim();

  if (explicit) {
    const explicitCandidate = path.isAbsolute(explicit)
      ? explicit
      : path.resolve(root, explicit);

    return resolveAllowedEnvironmentFile({
      root,
      environment,
      candidate: explicitCandidate,
      exists,
      realpath,
      explicit: true,
    });
  }

  if (environment !== "development") {
    return null;
  }

  const developmentFile = path.resolve(
    root,
    ".env.development",
  );

  return resolveAllowedEnvironmentFile({
    root,
    environment,
    candidate: developmentFile,
    exists,
    realpath,
    explicit: false,
  });
}
