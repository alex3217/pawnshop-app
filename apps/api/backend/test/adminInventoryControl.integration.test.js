import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";

const SECRET = "admin-inventory-control-integration-secret";
const DOMAIN = "@admin-inventory-control.pawnloop.test";
const PASSWORD = "AdminInventory123!";

let app;
let prisma;
let admin;
let owner;
let consumer;
let shop;
let databaseVerified = false;

function authorization(user) {
  return `Bearer ${jwt.sign({
    sub: user.id,
    email: user.email,
    role: user.role,
    authVersion: user.authVersion,
  }, SECRET)}`;
}

async function createUser(name, role) {
  return prisma.user.create({
    data: {
      name,
      email: `${name}${DOMAIN}`.toLowerCase(),
      password: await bcrypt.hash(PASSWORD, 4),
      role,
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });
}

async function cleanup() {
  await prisma.superAdminAuditLog.deleteMany({
    where: { actorEmail: { endsWith: DOMAIN } },
  });
  await prisma.item.deleteMany({
    where: { shop: { owner: { email: { endsWith: DOMAIN } } } },
  });
  await prisma.pawnShop.deleteMany({
    where: { owner: { email: { endsWith: DOMAIN } } },
  });
  await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
}

async function auditsFor(itemId) {
  return prisma.superAdminAuditLog.findMany({
    where: { targetType: "ITEM", targetId: itemId },
    orderBy: { createdAt: "asc" },
  });
}

function assertAudit(audit, action, metadata) {
  assert.equal(audit.action, action);
  assert.equal(audit.targetType, "ITEM");
  assert.equal(audit.actorId, admin.id);
  assert.equal(audit.actorRole, "ADMIN");
  assert.deepEqual(audit.metadata, metadata);
}

before(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    APP_ENV: "test",
    JWT_SECRET: SECRET,
    AUCTION_SCHEDULER_ENABLED: "false",
    WEB_URL: "http://localhost:5173",
  });

  const raw = String(process.env.DATABASE_URL || "");
  assert.ok(raw, "DATABASE_URL is required");
  assert.equal(
    decodeURIComponent(new URL(raw).pathname.replace(/^\/+/, "")),
    "pawnshop_test",
  );

  const appModule = await import("../src/app.js");
  ({ prisma } = await import("../src/lib/prisma.js"));
  app = appModule.createApp();
  const result = await prisma.$queryRaw`SELECT current_database() AS database_name`;
  assert.equal(result[0]?.database_name, "pawnshop_test");
  databaseVerified = true;
});

beforeEach(async () => {
  assert.equal(databaseVerified, true);
  await cleanup();
  admin = await createUser("inventory-admin", "ADMIN");
  owner = await createUser("inventory-owner", "OWNER");
  consumer = await createUser("inventory-consumer", "CONSUMER");
  shop = await prisma.pawnShop.create({
    data: { name: "Inventory Test Shop", ownerId: owner.id },
  });
});

after(async () => {
  if (!prisma) return;
  if (databaseVerified) await cleanup();
  await prisma.$disconnect();
});

test("admin inventory mutations create one governed audit each and all=true returns deleted items", async () => {
  const created = await request(app)
    .post("/api/admin/items")
    .set("Authorization", authorization(admin))
    .set("Cookie", "session=must-not-be-audited")
    .send({
      title: "Governed Guitar",
      shopId: shop.id,
      price: 199.95,
      status: "AVAILABLE",
      password: "must-not-be-audited",
      token: "must-not-be-audited",
      authorization: "must-not-be-audited",
      cookie: "must-not-be-audited",
    });

  assert.equal(created.status, 201);
  const itemId = created.body.item.id;
  let audits = await auditsFor(itemId);
  assert.equal(audits.length, 1);
  assertAudit(audits[0], "ADMIN_CREATE_ITEM", {
    title: "Governed Guitar",
    shopId: shop.id,
    status: "AVAILABLE",
  });

  const updated = await request(app)
    .patch(`/api/admin/items/${itemId}`)
    .set("Authorization", authorization(admin))
    .send({ status: "SOLD", password: "must-not-be-audited" });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.item.status, "SOLD");

  audits = await auditsFor(itemId);
  assert.equal(audits.length, 2);
  assertAudit(audits[1], "ADMIN_UPDATE_ITEM", { status: "SOLD" });

  const removed = await request(app)
    .delete(`/api/admin/items/${itemId}`)
    .set("Authorization", authorization(admin));
  assert.equal(removed.status, 200);
  assert.deepEqual(removed.body, { ok: true, id: itemId, isDeleted: true });

  audits = await auditsFor(itemId);
  assert.equal(audits.length, 3);
  assertAudit(audits[2], "MODERATE_ITEM_REMOVE", {
    moderationType: "soft_delete",
  });

  const allItems = await request(app)
    .get("/api/admin/items?all=true")
    .set("Authorization", authorization(admin));
  assert.equal(allItems.status, 200);
  assert.equal(
    allItems.body.some((item) => item.id === itemId && item.isDeleted === true),
    true,
  );

  const restored = await request(app)
    .patch(`/api/admin/items/${itemId}/restore`)
    .set("Authorization", authorization(admin));
  assert.equal(restored.status, 200);
  assert.deepEqual(restored.body, { ok: true, id: itemId, isDeleted: false });

  audits = await auditsFor(itemId);
  assert.equal(audits.length, 4);
  assertAudit(audits[3], "MODERATE_ITEM_RESTORE", {
    moderationType: "restore",
  });
  assert.equal(audits.filter((audit) => audit.action === "MODERATE_ITEM_REMOVE").length, 1);
  assert.equal(audits.filter((audit) => audit.action === "MODERATE_ITEM_RESTORE").length, 1);

  const serializedAudits = JSON.stringify(audits).toLowerCase();
  for (const secret of ["password", "token", "authorization", "cookie", "must-not-be-audited"]) {
    assert.equal(serializedAudits.includes(secret), false, `audit leaked ${secret}`);
  }
});

test("ordinary users cannot access admin inventory routes", async () => {
  const token = authorization(consumer);
  const existingItem = await prisma.item.create({
    data: {
      pawnShopId: shop.id,
      title: "Protected Item",
      price: 10,
      images: [],
    },
  });

  const attempts = [
    request(app).get("/api/admin/items?all=true").set("Authorization", token),
    request(app).post("/api/admin/items").set("Authorization", token).send({ title: "No", shopId: shop.id }),
    request(app).patch(`/api/admin/items/${existingItem.id}`).set("Authorization", token).send({ status: "SOLD" }),
    request(app).delete(`/api/admin/items/${existingItem.id}`).set("Authorization", token),
    request(app).patch(`/api/admin/items/${existingItem.id}/restore`).set("Authorization", token),
  ];

  for (const response of await Promise.all(attempts)) {
    assert.equal(response.status, 403);
  }
  assert.equal((await auditsFor(existingItem.id)).length, 0);
});
