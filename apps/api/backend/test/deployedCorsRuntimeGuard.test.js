import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertDeployedCorsConfiguration,
  parseAllowedOrigins,
} from "../src/cors.js";

const serverPath = fileURLToPath(new URL("../src/server.js", import.meta.url));

test("development and test allow an empty origin allowlist", () => {
  assert.deepEqual(
    [...assertDeployedCorsConfiguration({ APP_ENV: "development" })],
    [],
  );
  assert.deepEqual(
    [...assertDeployedCorsConfiguration({ NODE_ENV: "test" })],
    [],
  );
});

test("staging and production reject an empty origin allowlist", () => {
  assert.throws(
    () => assertDeployedCorsConfiguration({ APP_ENV: "staging" }),
    /allowlist is required/,
  );
  assert.throws(
    () => assertDeployedCorsConfiguration({ NODE_ENV: "production" }),
    /allowlist is required/,
  );
});

test("production allows valid HTTPS origins", () => {
  assert.deepEqual(
    [
      ...assertDeployedCorsConfiguration({
        NODE_ENV: "production",
        CORS_ORIGIN: "https://single.example",
      }),
    ],
    ["https://single.example"],
  );

  const origins = assertDeployedCorsConfiguration({
    APP_ENV: "production",
    CORS_ORIGINS: "https://one.example, https://two.example:8443",
  });

  assert.deepEqual([...origins], [
    "https://one.example",
    "https://two.example:8443",
  ]);
});

test("all supported keys are combined and blank entries are ignored", () => {
  const env = {
    APP_ENV: "staging",
    CORS_ORIGINS: " https://one.example, , ",
    CORS_ORIGIN: "https://two.example",
    FRONTEND_URL: "  https://three.example  ",
    WEB_URL: ",https://four.example,",
  };

  assert.deepEqual([...assertDeployedCorsConfiguration(env)], [
    "https://one.example",
    "https://two.example",
    "https://three.example",
    "https://four.example",
  ]);
  assert.deepEqual([...parseAllowedOrigins(env)], [
    "https://one.example",
    "https://two.example",
    "https://three.example",
    "https://four.example",
  ]);
});

test("deployed environments reject a literal wildcard", () => {
  assert.throws(
    () =>
      assertDeployedCorsConfiguration({
        NODE_ENV: "staging",
        CORS_ORIGIN: "*",
      }),
    /wildcards are not allowed/,
  );
});

test("deployed environments reject malformed and non-browser URLs", () => {
  for (const origin of [
    "not a URL",
    "ftp://example.com",
    "https:///missing-host",
  ]) {
    assert.throws(
      () =>
        assertDeployedCorsConfiguration({
          APP_ENV: "staging",
          CORS_ORIGIN: origin,
        }),
      /Invalid deployed CORS origin/,
      origin,
    );
  }
});

test("deployed environments reject URL components beyond an origin", () => {
  for (const origin of [
    "https://user@example.com",
    "https://user:password@example.com",
    "https://example.com/path",
    "https://example.com?query=value",
    "https://example.com#fragment",
    "https://example.com/",
  ]) {
    assert.throws(
      () =>
        assertDeployedCorsConfiguration({
          APP_ENV: "staging",
          CORS_ORIGIN: origin,
        }),
      /Invalid deployed CORS origin/,
      origin,
    );
  }
});

test("production requires HTTPS and gives lookalike hosts no exemption", () => {
  for (const origin of ["http://example.com", "http://localhost.example.com"]) {
    assert.throws(
      () =>
        assertDeployedCorsConfiguration({
          APP_ENV: "production",
          CORS_ORIGIN: origin,
        }),
      /must use HTTPS/,
      origin,
    );
  }

  for (const origin of [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://localhost",
    "https://[::1]:5173",
  ]) {
    assert.throws(
      () =>
        assertDeployedCorsConfiguration({
          APP_ENV: "production",
          CORS_ORIGIN: origin,
        }),
      /cannot use localhost or loopback hosts/,
      origin,
    );
  }

  assert.doesNotThrow(() =>
    assertDeployedCorsConfiguration({
      APP_ENV: "production",
      CORS_ORIGINS:
        "https://localhost.example.com,https://127.0.0.1.example.com",
    }),
  );
});

test("a deployed configuration failure exits before server startup", () => {
  const unrelatedSecret = "must-not-appear-in-cors-errors-7d2f";
  const result = spawnSync(process.execPath, [serverPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      APP_ENV: "production",
      NODE_ENV: "production",
      CORS_ORIGINS: "*",
      CORS_ORIGIN: "",
      FRONTEND_URL: "",
      WEB_URL: "",
      UNRELATED_SECRET: unrelatedSecret,
    },
    timeout: 15_000,
  });
  const output = `${result.stdout}\n${result.stderr}`;

  assert.notEqual(result.status, 0, output);
  assert.match(output, /wildcards are not allowed/);
  assert.doesNotMatch(output, /API running|Failed to initialize socket server/);
  assert.doesNotMatch(output, new RegExp(unrelatedSecret));
});
