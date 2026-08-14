import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";

const SECRET = "inventory-support-test-secret";
const DOMAIN = "@inventory-support.integration.test";
let app, prisma, superAdmin, admin, owner, consumer, shop, otherShop, item, sessionId;
const token = (user) => jwt.sign({ sub: user.id, role: user.role, authVersion: user.authVersion }, SECRET);
const api = (method, path, user = superAdmin) => request(app)[method](path).set("Authorization", `Bearer ${token(user)}`);

before(async () => {
  Object.assign(process.env, { NODE_ENV: "test", APP_ENV: "test", JWT_SECRET: SECRET, AUCTION_SCHEDULER_ENABLED: "false" });
  ({ prisma } = await import("../src/lib/prisma.js")); ({ createApp: app } = await import("../src/app.js")); app = app();
  const make = async (name, role) => prisma.user.create({ data: { name, email: `${name}${DOMAIN}`, password: await bcrypt.hash("TestOnly123!", 4), role, emailVerifiedAt: new Date() } });
  [superAdmin, admin, owner, consumer] = await Promise.all([make("super", "SUPER_ADMIN"), make("admin", "ADMIN"), make("owner", "OWNER"), make("consumer", "CONSUMER")]);
  [shop, otherShop] = await Promise.all([prisma.pawnShop.create({ data: { name: "Supported Shop", ownerId: owner.id } }), prisma.pawnShop.create({ data: { name: "Other Shop", ownerId: owner.id } })]);
  item = await prisma.item.create({ data: { pawnShopId: shop.id, title: "Audited Guitar", price: 100, images: [] } });
});
after(async () => {
  const users = await prisma.user.findMany({ where: { email: { endsWith: DOMAIN } }, select: { id: true } }); const ids = users.map((x) => x.id);
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } }); await prisma.marketplaceTransaction.deleteMany({ where: { OR: [{ buyerUserId: { in: ids } }, { sellerUserId: { in: ids } }] } }); await prisma.marketplaceListing.deleteMany({ where: { sellerUserId: { in: ids } } }); await prisma.inventoryAdminEvent.deleteMany({ where: { actorId: { in: ids } } }); await prisma.inventorySupportSession.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.item.deleteMany({ where: { pawnShopId: { in: [shop.id, otherShop.id] } } }); await prisma.inventoryLocation.deleteMany({ where: { shopId: { in: [shop.id, otherShop.id] } } }); await prisma.pawnShop.deleteMany({ where: { id: { in: [shop.id, otherShop.id] } } }); await prisma.superAdminAuditLog.deleteMany({ where: { actorId: { in: ids } } }); await prisma.user.deleteMany({ where: { id: { in: ids } } }); await prisma.$disconnect();
});

test("support endpoints enforce authentication and SUPER_ADMIN", async () => {
  assert.equal((await request(app).post(`/api/super-admin/shops/${shop.id}/support-sessions`).send({ reason: "Customer support case" })).status, 401);
  assert.equal((await api("post", `/api/super-admin/shops/${shop.id}/support-sessions`, admin).send({ reason: "Customer support case" })).status, 403);
  assert.equal((await api("post", `/api/super-admin/shops/${shop.id}/support-sessions`, owner).send({ reason: "Customer support case" })).status, 403);
  assert.equal((await api("post", `/api/super-admin/shops/${shop.id}/support-sessions`, consumer).send({ reason: "Customer support case" })).status, 403);
  assert.equal((await api("post", `/api/super-admin/shops/${shop.id}/support-sessions`).send({ reason: "short" })).status, 400);
  const started = await api("post", `/api/super-admin/shops/${shop.id}/support-sessions`).set("X-Request-Id", "support-start-request").send({ reason: "Owner requested inventory correction" });
  assert.equal(started.status, 201); sessionId = started.body.session.id;
  const audit = await prisma.inventoryAdminEvent.findFirst({ where: { supportSessionId: sessionId, action: "SUPPORT_SESSION_STARTED" } }); assert.equal(audit.actorId, superAdmin.id); assert.equal(audit.shopId, shop.id); assert.equal(audit.requestId, "support-start-request");
});

test("mutations require reason, reject negative quantity and cross-shop locations, and audit safe state", async () => {
  const path = `/api/super-admin/shops/${shop.id}/inventory/${item.id}`;
  assert.equal((await api("patch", path).set("X-Support-Session-Id", sessionId).send({ quantity: 2 })).status, 400);
  assert.equal((await api("patch", path).set("X-Support-Session-Id", sessionId).send({ quantity: -1, reason: "Correct inventory count" })).status, 400);
  const foreign = await prisma.inventoryLocation.create({ data: { shopId: otherShop.id, name: "Foreign" } });
  assert.equal((await api("patch", path).set("X-Support-Session-Id", sessionId).send({ locationId: foreign.id, reason: "Correct item location" })).status, 400);
  const updated = await api("patch", path).set("X-Support-Session-Id", sessionId).set("X-Request-Id", "mutation-request").send({ sku: "SKU-42", quantity: 2, reason: "Correct verified stock record" });
  assert.equal(updated.status, 200); assert.equal(updated.body.item.quantity, 2);
  const event = await prisma.inventoryAdminEvent.findFirst({ where: { itemId: item.id, action: "UPDATE_INVENTORY" } }); assert.equal(event.actorId, superAdmin.id); assert.equal(event.reason, "Correct verified stock record"); assert.equal(event.beforeState.quantity, 1); assert.equal(event.afterState.quantity, 2); assert.equal(event.requestId, "mutation-request"); assert.doesNotMatch(JSON.stringify(event), /password|token|secret/i);
  assert.equal(await prisma.notification.count({ where: { userId: owner.id, type: "ADMIN_INVENTORY_CHANGE" } }), 1);
  await prisma.item.update({ where: { id: item.id }, data: { availability: "SOLD", status: "SOLD" } });
  assert.equal((await api("patch", path).set("X-Support-Session-Id", sessionId).send({ availability: "RESERVED", reason: "Attempt invalid lifecycle transition" })).status, 409);
  await prisma.item.update({ where: { id: item.id }, data: { availability: "AVAILABLE", status: "AVAILABLE" } });
});

test("active marketplace commerce blocks material mutation and session end is audited", async () => {
  const listing = await prisma.marketplaceListing.create({ data: { itemId: item.id, sellerUserId: owner.id, sellerShopId: shop.id, listingType: "SHOP_TO_CUSTOMER", status: "ACTIVE", title: item.title, price: 100 } });
  await prisma.marketplaceTransaction.create({ data: { listingId: listing.id, buyerUserId: admin.id, sellerUserId: owner.id, sellerShopId: shop.id, type: "DIRECT_PURCHASE", status: "PENDING", quantity: 1, subtotal: 100, totalAmount: 100 } });
  const response = await api("patch", `/api/super-admin/shops/${shop.id}/inventory/${item.id}`).set("X-Support-Session-Id", sessionId).send({ availability: "SOLD", reason: "Attempt lifecycle correction" }); assert.equal(response.status, 409);
  const ended = await api("post", `/api/super-admin/shops/${shop.id}/support-sessions/end`).set("X-Support-Session-Id", sessionId).send({ reason: "Support work is complete" }); assert.equal(ended.status, 200);
  assert.equal(await prisma.inventoryAdminEvent.count({ where: { supportSessionId: sessionId, action: "SUPPORT_SESSION_ENDED" } }), 1);
  assert.equal((await api("get", `/api/super-admin/shops/${shop.id}/inventory`).set("X-Support-Session-Id", sessionId)).status, 403);
});
