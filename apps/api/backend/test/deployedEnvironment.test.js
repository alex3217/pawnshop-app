import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import request from "supertest";

import { createApp } from "../src/app.js";
import {
  validateCurrentDeployedEnvironment,
  validateDeployedEnvironment,
} from "../src/config/deployedEnvironment.js";
import {
  deployedSecretValues as secretValues,
  validDeployedEnvironment as validEnvironment,
} from "./helpers/deployedEnvironment.fixture.js";

const backendRoot = new URL("..", import.meta.url);
const repositoryRoot = new URL("../../../..", import.meta.url);

const SAFE_CHILD_ENVIRONMENT_NAMES = [
  "PATH", "Path", "HOME", "SystemRoot", "ComSpec", "PATHEXT",
  "TEMP", "TMP", "TMPDIR",
];

function isolatedPreflightEnvironment(fixture) {
  const env = {};
  for (const name of SAFE_CHILD_ENVIRONMENT_NAMES) {
    if (process.env[name] !== undefined) env[name] = process.env[name];
  }
  return {
    ...env,
    PROD_ENV_FILE: fixture,
    PRODUCTION_PREFLIGHT_VALIDATE_ONLY: "1",
  };
}

function withConflictingParentEnvironment(callback) {
  const conflicts = {
    APP_NAME: "parent-conflict",
    FRONTEND_URL: "http://parent-conflict.invalid",
    WEB_URL: "http://parent-conflict.invalid",
    CORS_ORIGIN: "http://parent-conflict.invalid",
    CORS_ORIGINS: "http://parent-conflict.invalid",
    DATABASE_URL: "postgresql://parent-conflict.invalid/parent_conflict",
    PRODUCTION_DATABASE_HOST: "different-parent-conflict.invalid",
    STRIPE_SECRET_KEY: "sk_test_parent_conflict",
    STRIPE_PUBLISHABLE_KEY: "pk_test_parent_conflict",
  };
  const prior = Object.fromEntries(
    Object.keys(conflicts).map((name) => [name, process.env[name]]),
  );
  Object.assign(process.env, conflicts);
  try {
    return callback();
  } finally {
    for (const [name, value] of Object.entries(prior)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("complete staging and production environments return sanitized metadata", () => {
  for (const environment of ["staging", "production"]) {
    const metadata = validateDeployedEnvironment(validEnvironment(environment), { environment });
    assert.equal(metadata.environment, environment);
    assert.equal(metadata.revision, "git-0123456789abcdef");
    for (const secret of secretValues) assert.equal(JSON.stringify(metadata).includes(secret), false);
  }
});

const invalidCases = [
  ["missing required variable", "APP_NAME", undefined],
  ["weak secret", "JWT_SECRET", "short"],
  ["malformed database URL", "DATABASE_URL", "not-a-url"],
  ["test database in production", "DATABASE_URL", "postgresql://x:x@prod-db.invalid/pawnloop_test"],
  ["staging database in production", "DATABASE_URL", "postgresql://x:x@prod-db.invalid/pawnloop_staging"],
  ["unapproved database hostname", "DATABASE_URL", "postgresql://x:x@other-db.invalid/pawnloop"],
  ["production Stripe test mode", "STRIPE_SECRET_KEY", "sk_test_synthetic_never_real"],
  ["missing Connect webhook secret", "STRIPE_CONNECT_WEBHOOK_SECRET", undefined],
  ["disabled rate limiting", "AUTH_RATE_LIMIT_ENABLED", "false"],
  ["invalid rate limit", "AUTH_RATE_LIMIT_WINDOW_MS", "zero"],
  ["missing MFA policy", "MFA_MODE", undefined],
  ["invalid MFA policy", "MFA_MODE", "sometimes"],
  ["missing scheduler setting", "AUCTION_SCHEDULER_ENABLED", undefined],
  ["ambiguous scheduler boolean", "AUCTION_SCHEDULER_ENABLED", "yes"],
  ["missing application revision", "APP_VERSION", undefined],
  ["non-HTTPS deployed origin", "API_ORIGIN", "http://api.pawnloop.invalid"],
];

for (const [label, name, value] of invalidCases) {
  test(`production rejects ${label}`, () => {
    const env = validEnvironment("production");
    if (value === undefined) delete env[name]; else env[name] = value;
    assert.throws(() => validateDeployedEnvironment(env, { environment: "production" }));
  });
}

test("staging rejects Stripe live mode", () => {
  const env = validEnvironment("staging");
  env.STRIPE_SECRET_KEY = "sk_live_synthetic_never_real";
  assert.throws(() => validateDeployedEnvironment(env, { environment: "staging" }));
});

const markerCases = [
  ["development", "production", "production"],
  ["development", "staging", "staging"],
  ["production", "development", "production"],
  ["staging", "development", "staging"],
];

for (const [appEnvironment, nodeEnvironment, target] of markerCases) {
  test(`deployed marker ${appEnvironment}/${nodeEnvironment} invokes ${target} validation and rejects the mismatch`, () => {
    const env = validEnvironment(target);
    env.APP_ENV = appEnvironment;
    env.NODE_ENV = nodeEnvironment;
    assert.throws(
      () => validateCurrentDeployedEnvironment(env),
      (error) => error.code === "DEPLOYED_ENVIRONMENT_INVALID",
    );
  });
}

for (const [appEnvironment, nodeEnvironment] of [
  ["production", "staging"],
  ["staging", "production"],
]) {
  test(`conflicting deployed markers ${appEnvironment}/${nodeEnvironment} fail closed`, () => {
    const env = validEnvironment(appEnvironment);
    env.NODE_ENV = nodeEnvironment;
    assert.throws(
      () => validateCurrentDeployedEnvironment(env),
      (error) =>
        error.code === "DEPLOYED_ENVIRONMENT_INVALID" &&
        error.message.includes("conflicting deployed environments"),
    );
  });
}

test("matching deployed markers validate normally", () => {
  for (const environment of ["production", "staging"]) {
    assert.equal(
      validateCurrentDeployedEnvironment(validEnvironment(environment)).environment,
      environment,
    );
  }
});

test("matching local development markers do not invoke deployed validation", () => {
  assert.equal(
    validateCurrentDeployedEnvironment({ APP_ENV: "development", NODE_ENV: "development" }),
    null,
  );
});

test("marker mismatch errors do not expose supplied values or secrets", () => {
  const env = validEnvironment("production");
  env.APP_ENV = "private-nondeployed-marker";
  let message = "";
  try { validateCurrentDeployedEnvironment(env); } catch (error) { message = error.message; }
  assert.equal(message.includes("private-nondeployed-marker"), false);
  for (const secret of secretValues) assert.equal(message.includes(secret), false);
});

const rejectedLoopbackOrigins = [
  "https://127.0.0.1",
  "https://127.0.0.2",
  "https://127.255.255.255",
  "https://localhost",
  "https://[::1]",
  "https://[::ffff:127.0.0.2]",
];

for (const name of ["API_ORIGIN", "FRONTEND_URL", "WEB_URL", "CORS_ORIGIN"]) {
  for (const origin of rejectedLoopbackOrigins) {
    test(`${name} rejects deployed loopback origin ${origin}`, () => {
      const env = validEnvironment("production");
      env[name] = origin;
      assert.throws(() => validateDeployedEnvironment(env, { environment: "production" }));
    });
  }
}

for (const origin of rejectedLoopbackOrigins) {
  test(`CORS_ORIGINS rejects loopback entry ${origin}`, () => {
    const env = validEnvironment("production");
    env.CORS_ORIGINS = `${env.CORS_ORIGINS},${origin}`;
    assert.throws(() => validateDeployedEnvironment(env, { environment: "production" }));
  });
}

for (const origin of ["https://8.8.8.8", "https://public.pawnloop.invalid"]) {
  test(`valid public origin ${origin} passes deployed origin validation`, () => {
    const env = validEnvironment("production");
    env.API_ORIGIN = origin;
    assert.equal(
      validateDeployedEnvironment(env, { environment: "production" }).apiOrigin,
      origin,
    );
  });
}

test("thrown errors never contain supplied secret values", () => {
  const env = validEnvironment("production");
  env.DATABASE_URL = `${secretValues[6]}?password=${encodeURIComponent(secretValues[0])}`;
  env.PRODUCTION_DATABASE_HOST = "other.invalid";
  let message = "";
  try { validateDeployedEnvironment(env, { environment: "production" }); } catch (error) { message = error.message; }
  for (const secret of secretValues) assert.equal(message.includes(secret), false);
});

test("startup exits before listening when deployed validation fails", () => {
  const result = spawnSync(process.execPath, ["src/server.js"], {
    cwd: backendRoot, env: { ...process.env, APP_ENV: "production", NODE_ENV: "production", PORT: "0" },
    encoding: "utf8", timeout: 10_000,
  });
  assert.notEqual(result.status, 0);
  assert.equal(`${result.stdout}${result.stderr}`.includes("API running"), false);
});

for (const [appEnvironment, nodeEnvironment] of [
  ["development", "production"],
  ["development", "staging"],
]) {
  test(`startup refuses to listen for conflicting ${appEnvironment}/${nodeEnvironment} markers`, () => {
    const result = spawnSync(process.execPath, ["src/server.js"], {
      cwd: backendRoot,
      env: { ...process.env, APP_ENV: appEnvironment, NODE_ENV: nodeEnvironment, PORT: "0" },
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.notEqual(result.status, 0);
    assert.equal(`${result.stdout}${result.stderr}`.includes("API running"), false);
  });
}

test("production preflight propagates shared validator failure without network work", () => {
  const result = withConflictingParentEnvironment(() => {
    return spawnSync("bash", ["scripts/check-prod-preflight.sh"], {
      cwd: repositoryRoot,
      env: isolatedPreflightEnvironment("scripts/test/fixtures/production-invalid.env"),
      encoding: "utf8", timeout: 10_000,
    });
  });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /APP_VERSION is required/);
});

test("production preflight accepts a synthetic valid contract without network work", () => {
  const result = withConflictingParentEnvironment(() => {
    return spawnSync("bash", ["scripts/check-prod-preflight.sh"], {
      cwd: repositoryRoot,
      env: isolatedPreflightEnvironment("scripts/test/fixtures/production-valid.env"),
      encoding: "utf8", timeout: 10_000,
    });
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("health and readiness expose revision without process internals", async () => {
  const prior = process.env.APP_VERSION;
  process.env.APP_VERSION = "git-health-01234567";
  try {
    const app = createApp({
      readinessCheck: async () => true,
      authRateLimitConfig: { enabled: false },
    });
    for (const path of ["/api/health", "/api/ready"]) {
      const response = await request(app).get(path).expect(200);
      assert.equal(response.body.revision, "git-health-01234567");
      assert.equal(response.body.pid, undefined);
      assert.equal(response.body.memory, undefined);
    }
  } finally {
    if (prior === undefined) delete process.env.APP_VERSION; else process.env.APP_VERSION = prior;
  }
});
