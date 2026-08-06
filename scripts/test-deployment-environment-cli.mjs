import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = new URL("./check-deployment-environment.mjs", import.meta.url);
const production = "https://api.pawnloop.com";
const staging = "https://pawnshop-staging-api.onrender.com";

function configuration(deployEnv, origin) {
  return {
    VITE_DEPLOY_ENV: deployEnv,
    VITE_API_ORIGIN: origin,
    VITE_API_BASE: "/api",
    VITE_SOCKET_URL: origin,
    VITE_SOCKET_PATH: "/socket.io",
  };
}

function run(overrides) {
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (name.startsWith("VITE_API_") || name.startsWith("VITE_SOCKET_") || name === "VITE_DEPLOY_ENV") delete env[name];
  }
  Object.assign(env, overrides);
  return spawnSync(process.execPath, [script.pathname], { env, encoding: "utf8" });
}

for (const [name, env] of [
  ["valid Preview", configuration("preview", staging)],
  ["valid staging", configuration("staging", staging)],
  ["valid Production", configuration("production", production)],
]) test(name, () => assert.equal(run(env).status, 0));

for (const [name, env] of [
  ["Preview targeting Production", configuration("preview", production)],
  ["staging targeting Production", configuration("staging", production)],
  ["Production targeting staging", configuration("production", staging)],
  ["missing deployment mode", { ...configuration("preview", staging), VITE_DEPLOY_ENV: "" }],
  ["unknown deployment mode", configuration("qa", staging)],
  ["missing origin", { ...configuration("preview", staging), VITE_API_ORIGIN: "" }],
  ["API and Socket.IO disagreement", { ...configuration("preview", staging), VITE_SOCKET_URL: production }],
  ["conflicting aliases", { ...configuration("preview", staging), VITE_API_BASE_URL: "/wrong" }],
  ["malformed API path", { ...configuration("preview", staging), VITE_API_BASE: "/api/api" }],
]) test(name, () => assert.notEqual(run(env).status, 0));

for (const [deployEnv, origin] of [
  ["preview", staging],
  ["staging", staging],
  ["production", production],
]) {
  test(`${deployEnv} accepts the exact Socket.IO path`, () => {
    assert.equal(run(configuration(deployEnv, origin)).status, 0);
  });

  test(`${deployEnv} rejects a duplicated Socket.IO path`, () => {
    assert.notEqual(run({
      ...configuration(deployEnv, origin),
      VITE_SOCKET_PATH: "/socket.io/socket.io",
    }).status, 0);
  });
}

for (const socketPath of [
  "",
  "/socket.io/",
  "https://api.pawnloop.com/socket.io",
  "//api.pawnloop.com/socket.io",
  "/socket.io?transport=websocket",
  "/socket.io#fragment",
  "/socket.io\\child",
  "/socket.io%2fchild",
]) {
  test(`Preview CLI rejects malformed Socket.IO path: ${socketPath || "missing"}`, () => {
    assert.notEqual(run({
      ...configuration("preview", staging),
      VITE_SOCKET_PATH: socketPath,
    }).status, 0);
  });
}

test("deployment CLI rejects development mode with the exact local Socket.IO path", () => {
  assert.notEqual(run({
    ...configuration("development", staging),
    VITE_SOCKET_PATH: "/socket.io",
  }).status, 0);
});

test("deployment CLI rejects development mode with a malformed Socket.IO path", () => {
  assert.notEqual(run({
    ...configuration("development", staging),
    VITE_SOCKET_PATH: "/socket.io/socket.io",
  }).status, 0);
});
