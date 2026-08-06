const DEPLOYED_ENVIRONMENTS = new Set(["staging", "production"]);

const KNOWN_DEVELOPMENT_PASSWORDS = new Set([
  "PawnLoop-Dev-Buyer-2026!",
  "PawnLoop-Dev-Owner-2026!",
  "PawnLoop-Dev-Admin-2026!",
  "PawnLoop-Dev-SuperAdmin-2026!",
  "password",
  "changeme",
  "admin",
  "default",
].map((password) => password.toLowerCase()));

function normalizeEnvironment(value) {
  return String(value || "").trim().toLowerCase();
}

export function getSeedEnvironment(env = {}) {
  const appEnv = normalizeEnvironment(env.APP_ENV);
  const nodeEnv = normalizeEnvironment(env.NODE_ENV);
  const deployedEnvironment = [appEnv, nodeEnv].find((value) =>
    DEPLOYED_ENVIRONMENTS.has(value),
  );

  return deployedEnvironment || appEnv || nodeEnv || "development";
}

export function assertDevDemoSeedAllowed(env = {}) {
  const environment = getSeedEnvironment(env);

  if (DEPLOYED_ENVIRONMENTS.has(environment)) {
    throw new Error(
      `Development/demo seed blocked in ${environment}. This command is limited to development and test environments.`,
    );
  }

  return { environment };
}

export function assertAdminSeedAllowed(env = {}) {
  const environment = getSeedEnvironment(env);

  if (!DEPLOYED_ENVIRONMENTS.has(environment)) {
    return { environment, password: env.ADMIN_SEED_PASSWORD || "PawnLoop-Dev-Admin-2026!" };
  }

  if (env.ALLOW_DEPLOYED_ADMIN_SEED !== "YES") {
    throw new Error(
      `Administrative seed blocked in ${environment}. Set ALLOW_DEPLOYED_ADMIN_SEED=YES to explicitly opt in.`,
    );
  }

  const password = String(env.ADMIN_SEED_PASSWORD || "");

  if (!password.trim()) {
    throw new Error(
      `Administrative seed blocked in ${environment}. ADMIN_SEED_PASSWORD is required.`,
    );
  }

  if (KNOWN_DEVELOPMENT_PASSWORDS.has(password.toLowerCase())) {
    throw new Error(
      `Administrative seed blocked in ${environment}. ADMIN_SEED_PASSWORD cannot use a known development or default password.`,
    );
  }

  return { environment, password };
}
