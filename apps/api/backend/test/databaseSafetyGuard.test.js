import assert from "node:assert/strict";
import test from "node:test";

import { validateTestDatabaseEnvironment } from "../scripts/assert-test-database.mjs";

const local = (
  databaseUrl = "postgresql://test_user:test_password@127.0.0.1:5432/pawnshop_test",
  testDatabaseName,
) => ({
  NODE_ENV: "test",
  APP_ENV: "test",
  DATABASE_URL: databaseUrl,
  ...(testDatabaseName ? { TEST_DATABASE_NAME: testDatabaseName } : {}),
});

test("approved loopback test URLs pass", () => {
  for (const host of ["localhost", "127.0.0.1"]) {
    const result = validateTestDatabaseEnvironment(local(`postgresql://test_user:test_password@${host}:5432/pawnshop_test`));
    assert.equal(result.database, "pawnshop_test");
  }
});

test("approved loopback disposable database names pass when TEST_DATABASE_NAME matches", () => {
  for (const host of ["localhost", "127.0.0.1"]) {
    const database = "pawnshop_test_pr371_41c51d8";
    const result = validateTestDatabaseEnvironment(
      local(`postgresql://test_user:test_password@${host}:5435/${database}`, database),
    );
    assert.equal(result.database, database);
  }
});

test("remote test-named databases are rejected", () => {
  for (const host of ["db.example.com", "example.neon.tech", "service.render.com", "10.0.0.5", "127.0.0.2", "[::1]"]) {
    assert.throws(
      () => validateTestDatabaseEnvironment(local(`postgresql://test_user:test_password@${host}/pawnshop_test`)),
      /approved loopback host/,
    );
  }
});

test("production and non-test database names are rejected", () => {
  for (const name of ["pawnshop", "pawnshop_production", "pawnloop_staging", "pawnshop_test-shared", "pawnshop_test_PR371"]) {
    assert.throws(
      () => validateTestDatabaseEnvironment(local(`postgresql://test_user:test_password@127.0.0.1/${name}`)),
      /Database name must be pawnshop_test/,
    );
  }
});

test("DATABASE_URL must exactly match the approved TEST_DATABASE_NAME", () => {
  assert.throws(
    () => validateTestDatabaseEnvironment(
      local(
        "postgresql://test_user:test_password@127.0.0.1/pawnshop_test_shared",
        "pawnshop_test_pr371",
      ),
    ),
    /Database name must be pawnshop_test_pr371/,
  );
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
