import assert from "node:assert/strict";
import test from "node:test";

import { resolveBuildEnvironment } from "../scripts/build.mjs";

test("bare local builds fail closed without an explicit contract", () => {
  assert.throws(
    () => resolveBuildEnvironment({ PATH: "/test" }),
    /deployEnv must be preview, staging, or production/,
  );
});

test("generic CI builds fail closed without an explicit contract", () => {
  assert.throws(
    () => resolveBuildEnvironment({ CI: "true" }),
    /deployEnv must be preview, staging, or production/,
  );
});

test("Cloudflare Pages builds fail closed without an explicit contract", () => {
  assert.throws(
    () => resolveBuildEnvironment({ CI: "true", CF_PAGES: "1" }),
    /deployEnv must be preview, staging, or production/,
  );
});

test("partial provider contracts fail before build execution", () => {
  assert.throws(
    () => resolveBuildEnvironment({ VITE_DEPLOY_ENV: "preview" }),
    /apiOrigin is required/,
  );
});

test("complete explicit Preview contracts are preserved", () => {
  const input = {
    VITE_DEPLOY_ENV: "preview",
    VITE_API_ORIGIN: "https://pawnshop-staging-api.onrender.com",
    VITE_API_BASE: "/api",
    VITE_SOCKET_URL: "https://pawnshop-staging-api.onrender.com",
    VITE_SOCKET_PATH: "/socket.io",
  };
  assert.deepEqual(resolveBuildEnvironment(input), input);
});

test("complete explicit Production and staging contracts are preserved", () => {
  for (const [deployEnv, origin] of [
    ["production", "https://api.pawnloop.com"],
    ["staging", "https://pawnshop-staging-api.onrender.com"],
  ]) {
    const input = {
      VITE_DEPLOY_ENV: deployEnv,
      VITE_API_ORIGIN: origin,
      VITE_API_BASE: "/api",
      VITE_SOCKET_URL: origin,
      VITE_SOCKET_PATH: "/socket.io",
    };
    assert.deepEqual(resolveBuildEnvironment(input), input);
  }
});
