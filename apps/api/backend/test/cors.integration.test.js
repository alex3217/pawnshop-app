import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "cors-integration-test-secret-at-least-thirty-two-characters";
process.env.AUCTION_SCHEDULER_ENABLED = "false";

const { createApp } = await import("../src/app.js");
const previewOrigin = "https://fix-preview.pawnloop-frontend.pages.dev";

function appFor({ appEnv = "staging", enabled = "true", origins = "https://staging-web.example" } = {}) {
  Object.assign(process.env, {
    APP_ENV: appEnv,
    CORS_ALLOW_PAWNLOOP_PREVIEWS: enabled,
    CORS_ORIGINS: origins,
    CORS_ORIGIN: "",
    FRONTEND_URL: "",
    WEB_URL: "",
  });
  return createApp({ readinessCheck: async () => true });
}

async function preflight(app, origin) {
  return request(app)
    .options("/api/auth/login")
    .set("Origin", origin)
    .set("Access-Control-Request-Method", "POST")
    .set("Access-Control-Request-Headers", "content-type,x-request-id");
}

test("enabled staging Preview preflight returns exact credentialed CORS headers", async () => {
  const response = await preflight(appFor(), previewOrigin);
  assert.equal(response.status, 204);
  assert.equal(response.headers["access-control-allow-origin"], previewOrigin);
  assert.equal(response.headers["access-control-allow-credentials"], "true");
  assert.notEqual(response.headers["access-control-allow-origin"], "*");
  assert.match(response.headers["access-control-allow-methods"], /POST/);
  assert.match(response.headers["access-control-allow-headers"].toLowerCase(), /content-type/);
  assert.match(response.headers["access-control-allow-headers"].toLowerCase(), /x-request-id/);
});

test("configured exact staging and Production origins continue to work", async () => {
  assert.equal((await preflight(appFor(), "https://staging-web.example")).status, 204);
  assert.equal((await preflight(appFor({ appEnv: "production", enabled: "true", origins: "https://pawnloop.com,https://www.pawnloop.com" }), "https://pawnloop.com")).status, 204);
});

for (const [name, options, origin] of [
  ["disabled Preview support", { enabled: "false" }, previewOrigin],
  ["Production Preview origin", { appEnv: "production", enabled: "false" }, previewOrigin],
  ["Production with accidental Preview flag", { appEnv: "production", enabled: "true" }, previewOrigin],
  ["malformed origin", {}, "not an origin"],
  ["deceptive suffix", {}, "https://fix-preview.pawnloop-frontend.pages.dev.evil.example"],
  ["unrelated Pages project", {}, "https://fix-preview.unrelated.pages.dev"],
  ["HTTP Preview origin", {}, "http://fix-preview.pawnloop-frontend.pages.dev"],
]) test(`${name} uses the intended 403 CORS path`, async () => {
  const response = await preflight(appFor(options), origin);
  assert.equal(response.status, 403);
  assert.equal(response.body.success, false);
  assert.match(response.body.error, /^CORS blocked:/);
});

test("origin-less health requests preserve existing behavior", async () => {
  const response = await request(appFor({ origins: "" })).get("/api/health");
  assert.equal(response.status, 200);
  assert.equal(response.headers["access-control-allow-origin"], undefined);
});

test("empty exact origins fail closed for browser requests", async () => {
  assert.equal((await preflight(appFor({ enabled: "false", origins: "" }), "https://unknown.example")).status, 403);
});
