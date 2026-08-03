import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test, { after, before } from "node:test";

import request from "supertest";

const password = String(process.env.ROLE_TENANT_CERT_PASSWORD || "");

if (!password) {
  throw new Error("ROLE_TENANT_CERT_PASSWORD is required");
}

const EMAIL = Object.freeze({
  buyerA: "buyer-a@role-certification.test",
  buyerB: "buyer-b@role-certification.test",
  disabledBuyer: "disabled-buyer@role-certification.test",
  ownerA: "owner-a@role-certification.test",
  ownerB: "owner-b@role-certification.test",
  pendingOwner: "pending-owner@role-certification.test",
  activeStaff: "active-staff-a@role-certification.test",
  inactiveStaff: "inactive-staff@role-certification.test",
  admin: "admin@role-certification.test",
  superAdmin: "super-admin@role-certification.test",
});

let app;
let prisma;
const tokens = {};

async function login(email) {
  return request(app).post("/api/auth/login").send({ email, password });
}

function authenticated(token, method, path) {
  return request(app)[method](path).set("Authorization", `Bearer ${token}`);
}

before(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    APP_ENV: "test",
    JWT_SECRET: randomBytes(32).toString("base64url"),
    AUCTION_SCHEDULER_ENABLED: "false",
    AUTH_RATE_LIMIT_ENABLED: "false",
  });

  const target = new URL(process.env.DATABASE_URL || "");
  assert.equal(target.hostname, "127.0.0.1");
  assert.equal(decodeURIComponent(target.pathname.slice(1)), "pawnshop_test");
  assert.equal(process.env.CONFIRM_DISPOSABLE_DATABASE, "YES_DELETE_TEST_DATA");

  ({ createApp: app } = await import("../src/app.js"));
  app = app();
  ({ prisma } = await import("../src/lib/prisma.js"));
  const database = await prisma.$queryRaw`SELECT current_database() AS name`;
  assert.equal(database[0]?.name, "pawnshop_test");

  for (const [key, email] of Object.entries(EMAIL)) {
    if (key === "disabledBuyer") continue;
    const response = await login(email);
    assert.equal(response.status, 200, `${key} must authenticate through the real login route`);
    assert.ok(response.body.token);
    tokens[key] = response.body.token;
  }
});

after(async () => {
  await prisma?.$disconnect();
});

test("Buyer A accesses its persisted resource", async () => {
  const response = await authenticated(tokens.buyerA, "get", "/api/buyer/item-submissions/mine").expect(200);
  assert.deepEqual(response.body.submissions.map(({ id }) => id), ["cert-buyer-a-submission"]);
});

test("Buyer A is denied Buyer B's persisted resource", async () => {
  const response = await authenticated(tokens.buyerA, "patch", "/api/buyer/item-submissions/cert-buyer-b-submission/withdraw").expect(404);
  assert.equal(response.body.error, "Submission not found");
});

test("Buyer B is denied Buyer A's persisted resource", async () => {
  const response = await authenticated(tokens.buyerB, "patch", "/api/buyer/item-submissions/cert-buyer-a-submission/withdraw").expect(404);
  assert.equal(response.body.error, "Submission not found");
});

for (const [actor, ownShop, otherShop] of [
  ["ownerA", "cert-shop-a", "cert-shop-b"],
  ["ownerB", "cert-shop-b", "cert-shop-a"],
]) {
  test(`${actor} accesses its own shop and is denied the other tenant`, async () => {
    const allowed = await authenticated(tokens[actor], "put", `/api/shops/${ownShop}`).send({ description: `${actor} certified` }).expect(200);
    assert.equal(allowed.body.id, ownShop);
    const denied = await authenticated(tokens[actor], "put", `/api/shops/${otherShop}`).send({ description: "cross tenant" }).expect(403);
    assert.equal(denied.body.error, "Forbidden");
  });
}

test("active Shop A staff uses assigned permission and is denied Shop B", async () => {
  const allowed = await authenticated(tokens.activeStaff, "get", "/api/staff/shop/cert-shop-a").expect(200);
  assert.ok(Array.isArray(allowed.body));
  assert.ok(allowed.body.some(({ id }) => id === "cert-active-staff-a-membership"));
  const denied = await authenticated(tokens.activeStaff, "get", "/api/staff/shop/cert-shop-b").expect(403);
  assert.equal(denied.body.error, "You do not have access to this shop.");
});

test("inactive staff is denied Shop A", async () => {
  const response = await authenticated(tokens.inactiveStaff, "get", "/api/staff/shop/cert-shop-a").expect(403);
  assert.equal(response.body.error, "You do not have access to this shop.");
});

test("disabled consumer cannot authenticate", async () => {
  const response = await login(EMAIL.disabledBuyer);
  assert.equal(response.status, 401);
  assert.equal(response.body.error, "Invalid credentials");
});

test("pending owner is denied an owner business route", async () => {
  const response = await authenticated(tokens.pendingOwner, "get", "/api/shops/mine").expect(403);
  assert.equal(response.body.code, "OWNER_APPLICATION_NOT_APPROVED");
  assert.equal(response.body.ownerApplicationStatus, "PENDING");
});

test("Administrator accesses the supported admin route", async () => {
  const response = await authenticated(tokens.admin, "get", "/api/admin/users").expect(200);
  assert.ok(response.body);
});

test("Super Administrator accesses the supported platform route", async () => {
  const response = await authenticated(tokens.superAdmin, "get", "/api/super-admin").expect(200);
  assert.equal(response.body.area, "super-admin");
  assert.equal(response.body.actor.role, "SUPER_ADMIN");
});
