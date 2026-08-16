import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import request from "supertest";
import {
  PUBLIC_PREVIEW_ERROR_CODE,
  PRODUCTION_AUTH_MUTATION_ALLOWLIST,
  PRODUCTION_WEBHOOK_ALLOWLIST,
  createProductionWriteGate,
  createPublicCapabilitiesPayload,
  getProductionWriteState,
} from "../src/config/productionWrites.js";

function gateApp(env) {
  const app = express();
  app.use((req, res, next) => {
    req.requestId = "request-test";
    next();
  });
  app.use(createProductionWriteGate({ env }));
  app.all(/.*/, (req, res) => res.status(204).end());
  return app;
}

const production = (value) => ({
  APP_ENV: "production",
  ...(value === undefined ? {} : { PRODUCTION_WRITES_ENABLED: value }),
});

test("production writes fail closed unless the setting is exactly true", () => {
  for (const value of [undefined, "", "false", "TRUE", " true ", "1", "yes", true]) {
    assert.equal(getProductionWriteState(production(value)).readOnly, true, String(value));
  }
  assert.deepEqual(getProductionWriteState(production("true")), {
    production: true,
    writesEnabled: true,
    readOnly: false,
  });
});

test("general production writes pass only for the exact approved value", async () => {
  assert.equal((await request(gateApp(production("true"))).post("/api/items")).status, 204);
  for (const value of [undefined, "", "false", "TRUE", " true ", "1", "yes"]) {
    assert.equal(
      (await request(gateApp(production(value))).post("/api/items")).status,
      503,
      String(value),
    );
  }
});

test("development, test, and staging writes remain unchanged", async () => {
  for (const env of [
    { NODE_ENV: "development" },
    { NODE_ENV: "test" },
    { APP_ENV: "staging", NODE_ENV: "production" },
  ]) {
    assert.equal((await request(gateApp(env)).post("/api/items")).status, 204);
  }
});

test("safe methods remain available in production read-only mode", async () => {
  for (const method of ["get", "head", "options"]) {
    const response = await request(gateApp(production()))[method]("/api/items");
    assert.equal(response.status, 204, method);
  }
});

test("only individually approved authentication mutations pass", async () => {
  assert.deepEqual(PRODUCTION_AUTH_MUTATION_ALLOWLIST, [
    "POST /auth/login",
    "POST /api/auth/login",
    "POST /auth/mfa/challenge",
    "POST /api/auth/mfa/challenge",
    "POST /auth/refresh",
    "POST /api/auth/refresh",
  ]);
  for (const route of PRODUCTION_AUTH_MUTATION_ALLOWLIST) {
    const path = route.slice("POST ".length);
    assert.equal((await request(gateApp(production())).post(path)).status, 204, path);
  }
  for (const path of [
    "/api/auth/register",
    "/api/auth/resend-verification",
    "/api/auth/verify-email",
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
    "/api/auth/mfa/enrollment",
    "/api/auth/mfa/enrollment/confirm",
    "/api/auth/super-admin/users",
  ]) {
    assert.equal((await request(gateApp(production())).post(path)).status, 503, path);
  }
});

test("all representative business mutation categories receive the stable rejection", async () => {
  const routes = [
    ["post", "/api/auth/register"], ["post", "/api/owner-applications/me/submit"],
    ["post", "/api/staff/invites"], ["post", "/api/marketplace-transactions"],
    ["post", "/api/stripe/payment-intents/settlements/id"], ["post", "/api/stripe/checkout/subscription"],
    ["post", "/api/stripe/payment-methods/setup-session"], ["post", "/api/bids"],
    ["post", "/api/offers"], ["patch", "/api/settlements/id"],
    ["post", "/api/stripe/refunds"], ["post", "/api/items"],
    ["patch", "/api/marketplace-listings/id"], ["post", "/api/uploads"],
    ["post", "/api/watchlist"], ["post", "/api/saved-searches"],
    ["post", "/api/shop-conversations"], ["post", "/api/inquiries"],
    ["post", "/api/admin/reviews"], ["patch", "/api/notifications/id/read"],
    ["post", "/api/integrations/webhooks/id"], ["delete", "/api/auctions/id"],
  ];
  for (const [method, path] of routes) {
    const response = await request(gateApp(production()))[method](path);
    assert.equal(response.status, 503, `${method} ${path}`);
    assert.equal(response.body.code, PUBLIC_PREVIEW_ERROR_CODE);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.headers["retry-after"], "300");
    assert.deepEqual(Object.keys(response.body).sort(), ["code", "error", "requestId", "success"]);
  }
});

test("path and method tricks cannot bypass the exact allowlist", async () => {
  const attempts = [
    ["post", "/api/auth/login/"],
    ["post", "/api/auth/login/nested"],
    ["post", "/api/auth/LOGIN"],
    ["post", "/api/auth/%6cogin"],
    ["put", "/api/auth/login"],
    ["patch", "/api/auth/login"],
    ["delete", "/api/auth/login"],
  ];
  for (const [method, path] of attempts) {
    const response = await request(gateApp(production()))[method](path).set("X-HTTP-Method-Override", "GET");
    assert.equal(response.status, 503, `${method} ${path}`);
  }
});

test("capability payload reports only effective public state", () => {
  assert.deepEqual(createPublicCapabilitiesPayload(production()), {
    success: true,
    publicPreview: {
      mode: "read-only",
      readOnly: true,
      productionWritesEnabled: false,
      errorCode: PUBLIC_PREVIEW_ERROR_CODE,
      retryAfterSeconds: 300,
    },
  });
  assert.equal(createPublicCapabilitiesPayload(production("true")).publicPreview.readOnly, false);
  assert.equal(createPublicCapabilitiesPayload({ APP_ENV: "staging", NODE_ENV: "production" }).publicPreview.readOnly, false);
});

test("provider webhook allowlist documents only cryptographically verified mounts", () => {
  assert.deepEqual(PRODUCTION_WEBHOOK_ALLOWLIST, [
    "POST /webhooks/stripe",
    "POST /api/webhooks/stripe",
    "POST /webhooks/stripe/connect",
    "POST /api/webhooks/stripe/connect",
  ]);
});
