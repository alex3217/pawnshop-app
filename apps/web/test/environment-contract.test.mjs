import assert from "node:assert/strict";
import test from "node:test";
import { resolveEnvironmentContract } from "../src/environmentContract.mjs";
import {
  PRODUCTION_API_ORIGIN,
  STAGING_API_ORIGIN,
  validateDeploymentTarget,
} from "../scripts/deploymentTargets.mjs";

const deployed = (deployEnv, origin) => ({
  deployEnv,
  apiOrigin: origin,
  apiPath: "/api",
  socketUrl: origin,
  socketPath: "/socket.io",
});

test("preview uses staging for both API and Socket.IO", () => {
  const contract = validateDeploymentTarget(resolveEnvironmentContract(deployed("preview", STAGING_API_ORIGIN)));
  assert.equal(contract.apiBase, `${STAGING_API_ORIGIN}/api`);
  assert.equal(contract.socketUrl, STAGING_API_ORIGIN);
  assert.equal(contract.showEnvironmentIndicator, true);
});

test("preview rejects the production API", () => {
  assert.throws(() => validateDeploymentTarget(resolveEnvironmentContract(deployed("preview", PRODUCTION_API_ORIGIN))), /preview builds must use .*staging/i);
});

test("production uses production for both API and Socket.IO", () => {
  const contract = validateDeploymentTarget(resolveEnvironmentContract(deployed("production", PRODUCTION_API_ORIGIN)));
  assert.equal(contract.apiBase, `${PRODUCTION_API_ORIGIN}/api`);
  assert.equal(contract.socketUrl, PRODUCTION_API_ORIGIN);
  assert.equal(contract.showEnvironmentIndicator, false);
});

test("production rejects the staging API", () => {
  assert.throws(() => validateDeploymentTarget(resolveEnvironmentContract(deployed("production", STAGING_API_ORIGIN))), /production builds must use .*api\.pawnloop/i);
});

test("staging uses staging for both API and Socket.IO", () => {
  const contract = validateDeploymentTarget(resolveEnvironmentContract(deployed("staging", STAGING_API_ORIGIN)));
  assert.equal(contract.apiBase, `${STAGING_API_ORIGIN}/api`);
  assert.equal(contract.socketUrl, STAGING_API_ORIGIN);
  assert.equal(contract.showEnvironmentIndicator, true);
});

test("staging rejects production and missing origins", () => {
  assert.throws(() => validateDeploymentTarget(resolveEnvironmentContract(deployed("staging", PRODUCTION_API_ORIGIN))), /staging builds must use/);
  assert.throws(() => resolveEnvironmentContract({ deployEnv: "staging" }), /required/);
});

test("deployed builds reject missing or unknown configuration", () => {
  assert.throws(() => resolveEnvironmentContract({ deployEnv: "preview" }), /required/);
  assert.throws(() => resolveEnvironmentContract(deployed("qa", STAGING_API_ORIGIN)), /must be preview, staging, or production/);
  assert.throws(() => resolveEnvironmentContract({}), /deployEnv/);
});

test("local development retains same-origin proxy behavior", () => {
  assert.deepEqual(resolveEnvironmentContract({}, { isDev: true, browserOrigin: "http://127.0.0.1:5176" }), {
    deployEnv: "development",
    apiBase: "/api",
    apiOrigin: "",
    socketUrl: "http://127.0.0.1:5176",
    socketPath: "/socket.io",
    showEnvironmentIndicator: false,
  });
});

test("API and Socket.IO cannot resolve to different deployed origins", () => {
  const env = deployed("preview", STAGING_API_ORIGIN);
  env.socketUrl = PRODUCTION_API_ORIGIN;
  assert.throws(() => resolveEnvironmentContract(env), /socketUrl/);
});

test("compatible API path aliases must agree and resolve exactly to /api", () => {
  const env = { ...deployed("preview", STAGING_API_ORIGIN), apiPathAlias: "/api" };
  assert.equal(resolveEnvironmentContract(env).apiBase, `${STAGING_API_ORIGIN}/api`);
  env.apiPathAlias = "/wrong";
  assert.throws(() => resolveEnvironmentContract(env), /must match/);
});

test("deployed builds reject malformed or duplicated API paths", () => {
  for (const path of [
    "/api/api", "/api?x=1", "/api#fragment", "/api\\child",
    "/api%2fchild", "/api%5Cchild", "//api", "https://api.pawnloop.com/api",
    "/api/", "/other",
  ]) {
    const env = deployed("production", PRODUCTION_API_ORIGIN);
    env.apiPath = path;
    assert.throws(() => resolveEnvironmentContract(env), undefined, path);
  }
});

test("deployed builds require the exact Socket.IO path", () => {
  for (const deployEnv of ["preview", "staging", "production"]) {
    const origin = deployEnv === "production" ? PRODUCTION_API_ORIGIN : STAGING_API_ORIGIN;
    assert.equal(resolveEnvironmentContract(deployed(deployEnv, origin)).socketPath, "/socket.io");

    for (const socketPath of [
      "",
      "/socket.io/socket.io",
      "/socket.io/",
      "https://api.pawnloop.com/socket.io",
      "//api.pawnloop.com/socket.io",
      "/socket.io?transport=websocket",
      "/socket.io#fragment",
      "/socket.io\\child",
      "/socket.io%2fchild",
      "/socket.io%5Cchild",
      "https://user:password@api.pawnloop.com/socket.io",
      "not-a-path",
    ]) {
      const env = deployed(deployEnv, origin);
      env.socketPath = socketPath;
      assert.throws(() => resolveEnvironmentContract(env), undefined, `${deployEnv}: ${socketPath || "missing"}`);
    }
  }
});

test("development ignores deployed origins and retains fixed proxy paths", () => {
  const contract = resolveEnvironmentContract({
    deployEnv: "development",
    apiPath: "/api/api",
    socketPath: "/socket.io",
  }, { isDev: true, browserOrigin: "http://localhost:5176" });
  assert.equal(contract.apiBase, "/api");
  assert.equal(contract.socketUrl, "http://localhost:5176");
});

test("development preserves the documented Socket.IO proxy convention", () => {
  assert.equal(resolveEnvironmentContract({}, { isDev: true }).socketPath, "/socket.io");
  assert.equal(resolveEnvironmentContract({ socketPath: "/socket.io" }, { isDev: true }).socketPath, "/socket.io");
  for (const socketPath of [
    "/socket.io/socket.io",
    "/socket.io/",
    "https://localhost:5176/socket.io",
    "//localhost:5176/socket.io",
    "/socket.io?transport=websocket",
    "/socket.io#fragment",
    "/socket.io\\child",
    "/socket.io%2fchild",
  ]) {
    assert.throws(
      () => resolveEnvironmentContract({ socketPath }, { isDev: true }),
      undefined,
      socketPath,
    );
  }
});
