import { pathToFileURL } from "node:url";

export const APPROVED_TEST_DATABASE = "pawnshop_test";
const APPROVED_LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);

export function validateTestDatabaseEnvironment(env = process.env) {
  const errors = [];
  const raw = String(env.DATABASE_URL || "").trim();

  if (env.NODE_ENV !== "test") errors.push("NODE_ENV must be test");
  if (env.APP_ENV !== "test") errors.push("APP_ENV must be test");

  let parsed;
  if (!raw) {
    errors.push("DATABASE_URL is required");
  } else {
    try {
      parsed = new URL(raw);
    } catch {
      errors.push("DATABASE_URL must be a valid PostgreSQL URL");
    }
  }

  let databaseName = "";
  if (parsed) {
    if (!new Set(["postgres:", "postgresql:"]).has(parsed.protocol)) {
      errors.push("DATABASE_URL must use PostgreSQL");
    }

    if (!APPROVED_LOOPBACK_HOSTS.has(parsed.hostname)) {
      errors.push("DATABASE_URL hostname must be an approved loopback host");
    }

    try {
      databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    } catch {
      errors.push("DATABASE_URL database name is malformed");
    }

    const requestedDatabase = String(env.TEST_DATABASE_NAME || APPROVED_TEST_DATABASE).trim();
    if (!/^pawnshop_test(?:_[a-z0-9_]+)?$/.test(requestedDatabase)) {
      errors.push("TEST_DATABASE_NAME must be pawnshop_test or a pawnshop_test_* disposable name");
    } else if (databaseName !== requestedDatabase) {
      errors.push(`Database name must be ${requestedDatabase}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Refusing database integration tests: ${errors.join("; ")}`);
  }

  return {
    host: parsed.hostname,
    port: parsed.port || "5432",
    database: databaseName,
  };
}

export function main(env = process.env) {
  try {
    const target = validateTestDatabaseEnvironment(env);
    console.log(`Test database safety guard passed for ${target.host}:${target.port}/${target.database}.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.env);
}
