import assert from "node:assert/strict";
import test from "node:test";

import {
  assertAdminSeedAllowed,
  assertDevDemoSeedAllowed,
} from "../scripts/lib/seed-environment-guard.mjs";

test("development allows demo and administrative seeds", () => {
  assert.equal(
    assertDevDemoSeedAllowed({ APP_ENV: "development", NODE_ENV: "development" })
      .environment,
    "development",
  );
  assert.equal(
    assertAdminSeedAllowed({ APP_ENV: "development" }).environment,
    "development",
  );
});

test("test allows demo and administrative seeds", () => {
  assert.equal(assertDevDemoSeedAllowed({ APP_ENV: "test" }).environment, "test");
  assert.equal(assertAdminSeedAllowed({ NODE_ENV: "test" }).environment, "test");
});

test("demo seed rejects staging through either environment convention", () => {
  assert.throws(
    () => assertDevDemoSeedAllowed({ APP_ENV: "staging" }),
    /Development\/demo seed blocked in staging/,
  );
  assert.throws(
    () =>
      assertDevDemoSeedAllowed({ APP_ENV: "development", NODE_ENV: "staging" }),
    /Development\/demo seed blocked in staging/,
  );
});

test("demo seed rejects production", () => {
  assert.throws(
    () => assertDevDemoSeedAllowed({ NODE_ENV: "production" }),
    /Development\/demo seed blocked in production/,
  );
});

test("deployed administrative seed requires explicit opt-in", () => {
  assert.throws(
    () =>
      assertAdminSeedAllowed({
        APP_ENV: "staging",
        ADMIN_SEED_PASSWORD: "Unique-Administrative-Password-2026!",
      }),
    /Set ALLOW_DEPLOYED_ADMIN_SEED=YES/,
  );
});

test("deployed administrative seed accepts explicit opt-in and a supplied password", () => {
  const result = assertAdminSeedAllowed({
    APP_ENV: "production",
    ALLOW_DEPLOYED_ADMIN_SEED: "YES",
    ADMIN_SEED_PASSWORD: "Unique-Administrative-Password-2026!",
  });

  assert.equal(result.environment, "production");
  assert.equal(result.password, "Unique-Administrative-Password-2026!");
});

test("deployed administrative seed rejects a missing password", () => {
  assert.throws(
    () =>
      assertAdminSeedAllowed({
        NODE_ENV: "production",
        ALLOW_DEPLOYED_ADMIN_SEED: "YES",
      }),
    /ADMIN_SEED_PASSWORD is required/,
  );
});

test("deployed administrative seed rejects known development and default passwords", () => {
  for (const password of [
    "PawnLoop-Dev-Admin-2026!",
    "pawnloop-dev-buyer-2026!",
    "PASSWORD",
    "changeme",
  ]) {
    assert.throws(
      () =>
        assertAdminSeedAllowed({
          APP_ENV: "staging",
          ALLOW_DEPLOYED_ADMIN_SEED: "YES",
          ADMIN_SEED_PASSWORD: password,
        }),
      /known development or default password/,
    );
  }
});

test("deployed administrative seed rejects a blank password", () => {
  assert.throws(
    () =>
      assertAdminSeedAllowed({
        APP_ENV: "staging",
        ALLOW_DEPLOYED_ADMIN_SEED: "YES",
        ADMIN_SEED_PASSWORD: "   ",
      }),
    /ADMIN_SEED_PASSWORD is required/,
  );
});

test("guard errors never disclose a supplied secret", () => {
  const secret = "do-not-disclose-this-secret-72f9";

  assert.throws(
    () =>
      assertAdminSeedAllowed({
        APP_ENV: "production",
        ADMIN_SEED_PASSWORD: secret,
      }),
    (error) => {
      assert.doesNotMatch(error.message, new RegExp(secret));
      return true;
    },
  );
});
