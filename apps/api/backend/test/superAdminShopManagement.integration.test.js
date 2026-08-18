import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { after, before, beforeEach } from "node:test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";
import { issueMfaStepUpProof, resetMfaTestMode } from "./helpers/mfaStepUp.fixture.js";

const SECRET = "shop-management-integration-secret";
const DOMAIN = "@shop-management.integration.pawnloop.test";
let app, prisma, actor, admin, owner, alternateOwner, inactiveOwner, nonOwner, shop;
const tokenFor = (user) => jwt.sign({ sub: user.id, role: user.role, authVersion: user.authVersion, jti: crypto.randomUUID() }, SECRET);
const auth = (user) => `Bearer ${tokenFor(user)}`;
const api = (method, path, user = actor) => request(app)[method](path).set("Authorization", auth(user));

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { endsWith: DOMAIN } }, select: { id: true } });
  const ids = users.map(({ id }) => id);
  if (ids.length) {
    const shops = await prisma.pawnShop.findMany({ where: { ownerId: { in: ids } }, select: { id: true } });
    await prisma.superAdminAuditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { targetId: { in: shops.map(({ id }) => id) } }] } });
    await prisma.pawnShop.deleteMany({ where: { id: { in: shops.map(({ id }) => id) } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
}
async function user(prefix, role, isActive = true) {
  return prisma.user.create({ data: { name: prefix, email: `${prefix}${DOMAIN}`, password: await bcrypt.hash("TestOnly123!", 4), role, isActive, emailVerifiedAt: new Date() } });
}

before(async () => {
  Object.assign(process.env, { NODE_ENV: "test", APP_ENV: "test", JWT_SECRET: SECRET, AUCTION_SCHEDULER_ENABLED: "false" });
  assert.equal(new URL(process.env.DATABASE_URL).pathname.replace(/^\//, ""), "pawnshop_test");
  ({ prisma } = await import("../src/lib/prisma.js"));
  const rows = await prisma.$queryRaw`SELECT current_database() AS name`;
  assert.equal(rows[0]?.name, "pawnshop_test");
  ({ createApp: app } = await import("../src/app.js")); app = app();
});
beforeEach(async () => {
  resetMfaTestMode();
  await cleanup();
  [actor, admin, owner, alternateOwner, inactiveOwner, nonOwner] = await Promise.all([
    user("super", "SUPER_ADMIN"), user("admin", "ADMIN"), user("owner", "OWNER"),
    user("alternate", "OWNER"), user("inactive", "OWNER", false), user("consumer", "CONSUMER"),
  ]);
  shop = await prisma.pawnShop.create({ data: { name: "Needle Search Pawn", address: "44 Audit Ave", phone: "555-0100", ownerId: owner.id, subscriptionPlan: "PRO", subscriptionStatus: "TRIALING" } });
});
after(async () => { if (prisma) { await cleanup(); await prisma.$disconnect(); } });

test("verified non-Super-Admin receives 403 for every shop-management mutation", async () => {
  const calls = [
    api("get", "/api/super-admin/shops", admin),
    api("post", "/api/super-admin/shops", admin).send({ ownerId: owner.id, name: "Forbidden" }),
    api("patch", `/api/super-admin/shops/${shop.id}`, admin).send({ name: "Forbidden" }),
    api("patch", `/api/super-admin/shops/${shop.id}`, admin).send({ subscriptionPlan: "FREE", reason: "Forbidden" }),
    api("patch", `/api/super-admin/shops/${shop.id}`, admin).send({ isDeleted: true }),
    api("patch", `/api/super-admin/shops/${shop.id}`, admin).send({ isDeleted: false }),
    api("patch", `/api/super-admin/shops/${shop.id}/owner`, admin).send({ ownerId: alternateOwner.id }),
  ];
  for (const response of await Promise.all(calls)) assert.equal(response.status, 403);
});

test("pagination and server-side shop filters return correct metadata and rows", async () => {
  await prisma.pawnShop.create({ data: { name: "Disabled Other", ownerId: owner.id, isDeleted: true, subscriptionPlan: "FREE", subscriptionStatus: "CANCELED" } });
  for (const [query, verify] of [["q=needle", (row) => row.id === shop.id], ["q=owner%40shop-management.integration.pawnloop.test", (row) => row.ownerEmail === owner.email], ["subscriptionPlan=PRO", (row) => row.subscriptionPlan === "PRO"], ["subscriptionStatus=TRIALING", (row) => row.subscriptionStatus === "TRIALING"], ["isDeleted=false&q=needle", (row) => row.id === shop.id]]) {
    const response = await api("get", `/api/super-admin/shops?page=1&limit=1&${query}`);
    assert.equal(response.status, 200); assert.ok(verify(response.body.shops[0])); assert.equal(response.body.pagination.page, 1); assert.equal(response.body.pagination.limit, 1); assert.ok(response.body.pagination.total >= 1);
  }
  const disabled = await api("get", "/api/super-admin/shops?isDeleted=true&q=Disabled%20Other");
  assert.equal(disabled.status, 200); assert.equal(disabled.body.pagination.total, 1); assert.equal(disabled.body.shops[0].isDeleted, true);
});

test("profile, billing, disable, restore, and reassignment are atomic and audited exactly once", async () => {
  const profile = await api("patch", `/api/super-admin/shops/${shop.id}`).send({ name: "Updated Needle", address: "", phone: "555-0199", description: "Profile", hours: "9-5" });
  assert.equal(profile.status, 200); assert.equal(profile.body.shop.name, "Updated Needle"); assert.equal(profile.body.shop.address, null);
  assert.equal((await api("patch", `/api/super-admin/shops/${shop.id}`).send({ name: "   " })).status, 400);
  const before = await prisma.pawnShop.findUnique({ where: { id: shop.id } });
  const auditBefore = await prisma.superAdminAuditLog.count({ where: { targetId: shop.id, success: true } });
  assert.equal((await api("patch", `/api/super-admin/shops/${shop.id}`).send({ subscriptionPlan: "ULTRA" })).status, 400);
  assert.equal((await prisma.pawnShop.findUnique({ where: { id: shop.id } })).subscriptionPlan, before.subscriptionPlan);
  assert.equal(await prisma.superAdminAuditLog.count({ where: { targetId: shop.id, success: true } }), auditBefore);
  const billing = await api("patch", `/api/super-admin/shops/${shop.id}`).send({ subscriptionPlan: "ULTRA", cancelAtPeriodEnd: true, reason: "Approved retention exception" });
  assert.equal(billing.status, 200);
  for (const isDeleted of [true, false]) assert.equal((await api("patch", `/api/super-admin/shops/${shop.id}`).send({ isDeleted })).status, 200);
  const reassign = async (ownerId) => {
    const token = tokenFor(actor);
    const proof = await issueMfaStepUpProof({ token, userId: actor.id, scope: "privilege.shop-owner.reassign" });
    return request(app).patch(`/api/super-admin/shops/${shop.id}/owner`)
      .set("Authorization", `Bearer ${token}`).set("x-mfa-step-up-proof", proof).send({ ownerId });
  };
  assert.equal((await reassign(nonOwner.id)).status, 400);
  assert.equal((await reassign(inactiveOwner.id)).status, 400);
  assert.equal((await reassign(alternateOwner.id)).status, 200);
  const audits = await prisma.superAdminAuditLog.findMany({ where: { targetId: shop.id, success: true }, orderBy: { createdAt: "asc" } });
  assert.equal(audits.length, 5); assert.deepEqual(audits.map(({ action }) => action), ["UPDATE_SHOP_GOVERNANCE", "UPDATE_SHOP_GOVERNANCE", "UPDATE_SHOP_GOVERNANCE", "UPDATE_SHOP_GOVERNANCE", "REASSIGN_SHOP_OWNER"]);
  const billingAudit = audits.find((entry) => entry.metadata?.changeType === "BILLING_OVERRIDE");
  assert.equal(billingAudit.metadata.reason, "Approved retention exception"); assert.deepEqual(billingAudit.metadata.changedFields.sort(), ["cancelAtPeriodEnd", "subscriptionPlan"]);
  for (const audit of audits) { assert.equal(audit.targetId, shop.id); assert.equal(audit.actorId, actor.id); assert.equal(audit.actorRole, "SUPER_ADMIN"); assert.doesNotMatch(JSON.stringify(audit.metadata), /password|token|authorization|cookie|secret/i); }
});

test("create produces exactly one CREATE_SHOP audit targeted to the new shop", async () => {
  const response = await api("post", "/api/super-admin/shops").send({ ownerId: owner.id, name: "Created Once", address: "1 New St" });
  assert.equal(response.status, 201);
  const audits = await prisma.superAdminAuditLog.findMany({ where: { action: "CREATE_SHOP", targetId: response.body.shop.id } });
  assert.equal(audits.length, 1); assert.equal(audits[0].actorId, actor.id); assert.equal(audits[0].actorRole, "SUPER_ADMIN");
});
