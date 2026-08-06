import assert from "node:assert/strict";
import test from "node:test";

import { validateTestDatabaseEnvironment } from "../scripts/assert-test-database.mjs";

const local = (databaseUrl = "postgresql://test_user:test_password@127.0.0.1:5432/pawnshop_test") => ({
  NODE_ENV: "test",
  APP_ENV: "test",
  DATABASE_URL: databaseUrl,
});

test("approved loopback test URLs pass", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    const result = validateTestDatabaseEnvironment(local(`postgresql://test_user:test_password@${host}:5432/pawnshop_test`));
    assert.equal(result.database, "pawnshop_test");
  }
});

test("remote test-named databases are rejected", () => {
  for (const host of ["db.example.com", "example.neon.tech", "service.render.com", "10.0.0.5", "127.0.0.2"]) {
    assert.throws(
      () => validateTestDatabaseEnvironment(local(`postgresql://test_user:test_password@${host}/pawnshop_test`)),
      /approved loopback host/,
    );
  }
});

test("production and non-test database names are rejected", () => {
  for (const name of ["pawnshop", "pawnshop_production", "pawnloop_staging"]) {
    assert.throws(
      () => validateTestDatabaseEnvironment(local(`postgresql://test_user:test_password@127.0.0.1/${name}`)),
      /Database name must be pawnshop_test/,
    );
  }
});

test("missing and malformed URLs are rejected", () => {
  assert.throws(() => validateTestDatabaseEnvironment(local("")), /DATABASE_URL is required/);
  assert.throws(() => validateTestDatabaseEnvironment(local("not-a-url")), /valid PostgreSQL URL/);
  assert.throws(() => validateTestDatabaseEnvironment(local("postgresql:///pawnshop_test")), /approved loopback host/);
});

test("incorrect NODE_ENV or APP_ENV is rejected", () => {
  assert.throws(() => validateTestDatabaseEnvironment({ ...local(), NODE_ENV: "production" }), /NODE_ENV must be test/);
  assert.throws(() => validateTestDatabaseEnvironment({ ...local(), APP_ENV: "staging" }), /APP_ENV must be test/);
});

test("guard errors never expose URL credentials", () => {
  const password = "database-guard-secret-password";
  assert.throws(
    () => validateTestDatabaseEnvironment(local(`postgresql://remote_user:${password}@example.neon.tech/pawnshop_test`)),
    (error) => !error.message.includes(password) && !error.message.includes("remote_user"),
  );
});
