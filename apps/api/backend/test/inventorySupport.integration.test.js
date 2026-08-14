import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";

const SECRET = "inventory-support-test-secret";
const DOMAIN = "@inventory-support.integration.test";
let app, prisma, cleanupStaleUploadAssets, superAdmin, admin, owner, consumer, shop, otherShop, item, sessionId;
const token = (user) => jwt.sign({ sub: user.id, role: user.role, authVersion: user.authVersion }, SECRET);
const api = (method, path, user = superAdmin) => request(app)[method](path).set("Authorization", `Bearer ${token(user)}`);

before(async () => {
  Object.assign(process.env, { NODE_ENV: "test", APP_ENV: "test", JWT_SECRET: SECRET, AUCTION_SCHEDULER_ENABLED: "false" });
  ({ prisma } = await import("../src/lib/prisma.js")); ({ cleanupStaleUploadAssets } = await import("../src/services/uploadAssets.service.js")); ({ createApp: app } = await import("../src/app.js")); app = app();
  const make = async (name, role) => prisma.user.create({ data: { name, email: `${name}${DOMAIN}`, password: await bcrypt.hash("TestOnly123!", 4), role, emailVerifiedAt: new Date() } });
  [superAdmin, admin, owner, consumer] = await Promise.all([make("super", "SUPER_ADMIN"), make("admin", "ADMIN"), make("owner", "OWNER"), make("consumer", "CONSUMER")]);
  [shop, otherShop] = await Promise.all([prisma.pawnShop.create({ data: { name: "Supported Shop", ownerId: owner.id } }), prisma.pawnShop.create({ data: { name: "Other Shop", ownerId: owner.id } })]);
  item = await prisma.item.create({ data: { pawnShopId: shop.id, title: "Audited Guitar", price: 100, images: [] } });
});
after(async () => {
  const users = await prisma.user.findMany({ where: { email: { endsWith: DOMAIN } }, select: { id: true } }); const ids = users.map((x) => x.id);
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } }); await prisma.marketplaceTransaction.deleteMany({ where: { OR: [{ buyerUserId: { in: ids } }, { sellerUserId: { in: ids } }] } }); await prisma.marketplaceListing.deleteMany({ where: { sellerUserId: { in: ids } } }); await prisma.inventoryAdminEvent.deleteMany({ where: { actorId: { in: ids } } }); await prisma.inventorySupportSession.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.uploadAsset.deleteMany({ where: { uploaderId: { in: ids } } });
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
  assert.equal((await api("patch", path).set("X-Support-Session-Id", sessionId).send({ title: null, reason: "Reject missing item title" })).status, 400);
  assert.equal((await api("patch", path).set("X-Support-Session-Id", sessionId).send({ price: null, reason: "Reject missing item price" })).status, 400);
  const foreign = await prisma.inventoryLocation.create({ data: { shopId: otherShop.id, name: "Foreign" } });
  assert.equal((await api("patch", path).set("X-Support-Session-Id", sessionId).send({ locationId: foreign.id, reason: "Correct item location" })).status, 400);
  const updated = await api("patch", path).set("X-Support-Session-Id", sessionId).set("X-Request-Id", "mutation-request").send({ sku: "SKU-42", quantity: 2, reason: "Correct verified stock record" });
  assert.equal(updated.status, 200); assert.equal(updated.body.item.quantity, 2);
  const event = await prisma.inventoryAdminEvent.findFirst({ where: { itemId: item.id, action: "UPDATE_INVENTORY" } }); assert.equal(event.actorId, superAdmin.id); assert.equal(event.reason, "Correct verified stock record"); assert.equal(event.beforeState.quantity, 1); assert.equal(event.afterState.quantity, 2); assert.equal(event.requestId, "mutation-request"); assert.doesNotMatch(JSON.stringify(event), /password|token|secret/i);
  assert.equal(await prisma.notification.count({ where: { userId: owner.id, type: "ADMIN_INVENTORY_CHANGE" } }), 1);
  await prisma.item.update({ where: { id: item.id }, data: { availability: "SOLD", status: "SOLD" } });
  assert.equal((await api("patch", path).set("X-Support-Session-Id", sessionId).send({ availability: "RESERVED", reason: "Attempt invalid lifecycle transition" })).status, 409);
  await prisma.item.update({ where: { id: item.id }, data: { availability: "AVAILABLE", status: "AVAILABLE" } });
  const archived = await api("patch", path).set("X-Support-Session-Id", sessionId).send({ availability: "ARCHIVED", reason: "Archive duplicate inventory record" });
  assert.equal(archived.status, 200); assert.equal(archived.body.item.isDeleted, true);
  const restored = await api("patch", path).set("X-Support-Session-Id", sessionId).send({ availability: "AVAILABLE", reason: "Restore verified inventory record" });
  assert.equal(restored.status, 200); assert.equal(restored.body.item.isDeleted, false); assert.equal(restored.body.item.availability, "AVAILABLE");
  await prisma.item.update({ where: { id: item.id }, data: { availability: "SOLD", status: "SOLD" } });
  assert.equal((await api("patch", path).set("X-Support-Session-Id", sessionId).send({ availability: "ARCHIVED", reason: "Archive historical sold inventory" })).status, 200);
  const restoredSold = await api("patch", path).set("X-Support-Session-Id", sessionId).send({ availability: "AVAILABLE", reason: "Restore historical sold inventory" });
  assert.equal(restoredSold.status, 200); assert.equal(restoredSold.body.item.availability, "SOLD"); assert.equal(restoredSold.body.item.status, "SOLD"); assert.equal(restoredSold.body.item.isDeleted, false);
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

test("support image changes attach, replace, remove, and reject unmanaged URLs", async () => {
  await prisma.marketplaceTransaction.deleteMany({ where: { listing: { itemId: item.id } } });
  await prisma.marketplaceListing.deleteMany({ where: { itemId: item.id } });
  const started = await api("post", `/api/super-admin/shops/${shop.id}/support-sessions`).send({ reason: "Managed image lifecycle verification" });
  sessionId = started.body.session.id;
  const url1 = "https://assets.integration.test/one.png";
  const url2 = "https://assets.integration.test/two.png";
  const makeAsset = (id, deliveryUrl) => prisma.uploadAsset.create({ data: { id, objectKey: `inventory/${id}.png`, deliveryUrl, kind: "ITEM_IMAGE", uploaderId: superAdmin.id, shopId: shop.id, itemId: item.id, deleteAfter: new Date(Date.now() + 60_000) } });
  await makeAsset("support-image-one", url1);
  let response = await api("patch", `/api/super-admin/shops/${shop.id}/inventory/${item.id}`).set("X-Support-Session-Id", sessionId).send({ images: [url1], reason: "Attach verified inventory image" });
  assert.equal(response.status, 200); assert.equal((await prisma.uploadAsset.findUnique({ where: { id: "support-image-one" } })).status, "ATTACHED");
  response = await api("patch", `/api/super-admin/shops/${shop.id}/inventory/${item.id}`).set("X-Support-Session-Id", sessionId).send({ images: ["https://unmanaged.invalid/image.png"], reason: "Reject untracked inventory image" });
  assert.equal(response.status, 400); assert.deepEqual((await prisma.item.findUnique({ where: { id: item.id } })).images, [url1]);
  await makeAsset("support-image-two", url2);
  response = await api("patch", `/api/super-admin/shops/${shop.id}/inventory/${item.id}`).set("X-Support-Session-Id", sessionId).send({ images: [url2], reason: "Replace verified inventory image" });
  assert.equal(response.status, 200); assert.equal((await prisma.uploadAsset.findUnique({ where: { id: "support-image-one" } })).status, "DELETED"); assert.equal((await prisma.uploadAsset.findUnique({ where: { id: "support-image-two" } })).status, "ATTACHED");
  response = await api("patch", `/api/super-admin/shops/${shop.id}/inventory/${item.id}`).set("X-Support-Session-Id", sessionId).send({ images: [], reason: "Remove verified inventory image" });
  assert.equal(response.status, 200); assert.deepEqual(response.body.item.images, []); assert.equal((await prisma.uploadAsset.findUnique({ where: { id: "support-image-two" } })).status, "DELETED");
});

test("rejected support image updates preserve same-shop cross-item and cross-uploader temporary assets", async () => {
  const otherItem = await prisma.item.create({ data: { pawnShopId: shop.id, title: "Other image owner", price: 25, images: [] } });
  const crossItemUrl = "https://assets.integration.test/cross-item.png";
  const crossUploaderUrl = "https://assets.integration.test/cross-uploader.png";
  const objects = new Set(["inventory/cross-item.png", "inventory/cross-uploader.png"]);
  const previousStorage = app.locals.uploadStorage;
  app.locals.uploadStorage = { delete: async ({ key }) => objects.delete(key) };
  try {
    await prisma.uploadAsset.createMany({ data: [
      { id: "support-cross-item", objectKey: "inventory/cross-item.png", deliveryUrl: crossItemUrl, kind: "ITEM_IMAGE", uploaderId: superAdmin.id, shopId: shop.id, itemId: otherItem.id, deleteAfter: new Date(Date.now() + 60_000) },
      { id: "support-cross-uploader", objectKey: "inventory/cross-uploader.png", deliveryUrl: crossUploaderUrl, kind: "ITEM_IMAGE", uploaderId: admin.id, shopId: shop.id, itemId: item.id, deleteAfter: new Date(Date.now() + 60_000) },
    ] });
    for (const url of [crossItemUrl, crossUploaderUrl]) {
      const response = await api("patch", `/api/super-admin/shops/${shop.id}/inventory/${item.id}`).set("X-Support-Session-Id", sessionId).send({ images: [url], reason: "Reject foreign temporary image" });
      assert.equal(response.status, 403);
    }
    const rows = await prisma.uploadAsset.findMany({ where: { id: { in: ["support-cross-item", "support-cross-uploader"] } }, orderBy: { id: "asc" } });
    assert.deepEqual(rows.map(({ status }) => status), ["TEMPORARY", "TEMPORARY"]);
    assert.deepEqual((await prisma.item.findUnique({ where: { id: otherItem.id } })).images, []);
    assert.deepEqual((await prisma.item.findUnique({ where: { id: item.id } })).images, []);
    assert.deepEqual([...objects].sort(), ["inventory/cross-item.png", "inventory/cross-uploader.png"]);
  } finally {
    app.locals.uploadStorage = previousStorage;
  }
});

test("an attached image survives a later support audit failure", async () => {
  const url = "https://assets.integration.test/attached-audit-failure.png";
  const key = "inventory/attached-audit-failure.png";
  const objects = new Set([key]);
  const previousStorage = app.locals.uploadStorage;
  app.locals.uploadStorage = { delete: async ({ key: deletedKey }) => objects.delete(deletedKey) };
  await prisma.uploadAsset.create({ data: { id: "support-attached-audit-failure", objectKey: key, deliveryUrl: url, kind: "ITEM_IMAGE", uploaderId: superAdmin.id, shopId: shop.id, itemId: item.id, deleteAfter: new Date(Date.now() + 60_000) } });
  try {
    const attached = await api("patch", `/api/super-admin/shops/${shop.id}/inventory/${item.id}`).set("X-Support-Session-Id", sessionId).send({ images: [url], reason: "Attach image before failure" });
    assert.equal(attached.status, 200);
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION fail_support_update_audit() RETURNS trigger AS $$ BEGIN IF NEW."action" = 'UPDATE_INVENTORY' THEN RAISE EXCEPTION 'injected audit failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_support_update_audit BEFORE INSERT ON "InventoryAdminEvent" FOR EACH ROW EXECUTE FUNCTION fail_support_update_audit()`);
    const failed = await api("patch", `/api/super-admin/shops/${shop.id}/inventory/${item.id}`).set("X-Support-Session-Id", sessionId).send({ title: "Rolled back title", images: [url], reason: "Inject support audit failure" });
    assert.equal(failed.status, 500);
    const asset = await prisma.uploadAsset.findUnique({ where: { id: "support-attached-audit-failure" } });
    assert.equal(asset.status, "ATTACHED");
    assert.equal(objects.has(key), true);
    assert.notEqual((await prisma.item.findUnique({ where: { id: item.id } })).title, "Rolled back title");
  } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS fail_support_update_audit ON "InventoryAdminEvent"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS fail_support_update_audit()`);
    app.locals.uploadStorage = previousStorage;
  }
});

test("temporary orphan cleanup still deletes through the normal TTL path", async () => {
  const key = "inventory/ttl-orphan.png";
  const objects = new Set([key]);
  await prisma.uploadAsset.create({ data: { id: "support-ttl-orphan", objectKey: key, deliveryUrl: "https://assets.integration.test/ttl-orphan.png", kind: "ITEM_IMAGE", uploaderId: superAdmin.id, shopId: shop.id, itemId: item.id, deleteAfter: new Date(Date.now() - 60_000) } });
  const result = await cleanupStaleUploadAssets({ prismaClient: prisma, now: new Date(), storage: { delete: async ({ key: deletedKey }) => objects.delete(deletedKey) } });
  assert.equal(result.deleted >= 1, true);
  assert.equal((await prisma.uploadAsset.findUnique({ where: { id: "support-ttl-orphan" } })).status, "DELETED");
  assert.equal(objects.has(key), false);
});

test("expired sessions are denied and concurrent starts leave one active session", async () => {
  await prisma.inventorySupportSession.update({ where: { id: sessionId }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await api("get", `/api/super-admin/shops/${shop.id}/inventory`).set("X-Support-Session-Id", sessionId)).status, 403);
  const [first, second] = await Promise.all([
    api("post", `/api/super-admin/shops/${shop.id}/support-sessions`).send({ reason: "Concurrent support session one" }),
    api("post", `/api/super-admin/shops/${otherShop.id}/support-sessions`).send({ reason: "Concurrent support session two" }),
  ]);
  assert.ok([201, 409].includes(first.status)); assert.ok([201, 409].includes(second.status));
  assert.equal(await prisma.inventorySupportSession.count({ where: { actorId: superAdmin.id, endedAt: null } }), 1);
  sessionId = (first.status === 201 ? first : second).body.session.id;
});

test("listing changes reject ambiguous multiple active listings", async () => {
  const started = await api("post", `/api/super-admin/shops/${shop.id}/support-sessions`).send({ reason: "Ambiguous listing support verification" });
  assert.equal(started.status, 201); sessionId = started.body.session.id;
  await prisma.marketplaceTransaction.deleteMany({ where: { listing: { itemId: item.id } } });
  await prisma.marketplaceListing.deleteMany({ where: { itemId: item.id } });
  await Promise.all(["A", "B"].map((suffix) => prisma.marketplaceListing.create({ data: { itemId: item.id, sellerUserId: owner.id, sellerShopId: shop.id, listingType: "SHOP_TO_CUSTOMER", status: "ACTIVE", title: `${item.title} ${suffix}`, price: 100 } })));
  const response = await api("post", `/api/super-admin/shops/${shop.id}/inventory/${item.id}/listing`).set("X-Support-Session-Id", sessionId).send({ action: "unpublish", reason: "Resolve marketplace listing state" });
  assert.equal(response.status, 409); assert.match(response.body.error, /Multiple active marketplace listings/);
});

test("listing changes preserve sellability invariants", async () => {
  await prisma.marketplaceListing.deleteMany({ where: { itemId: item.id } });
  const listing = await prisma.marketplaceListing.create({ data: { itemId: item.id, sellerUserId: owner.id, sellerShopId: shop.id, listingType: "SHOP_TO_CUSTOMER", status: "DRAFT", title: item.title, price: 100 } });
  await prisma.item.update({ where: { id: item.id }, data: { availability: "UNAVAILABLE", status: "AVAILABLE", isDeleted: false } });
  const listingPath = `/api/super-admin/shops/${shop.id}/inventory/${item.id}/listing`;
  assert.equal((await api("post", listingPath).set("X-Support-Session-Id", sessionId).send({ action: "publish", reason: "Reject unavailable marketplace listing" })).status, 409);
  await prisma.item.update({ where: { id: item.id }, data: { availability: "AVAILABLE", quantity: 1 } });
  assert.equal((await api("post", listingPath).set("X-Support-Session-Id", sessionId).send({ action: "publish", reason: "Publish available marketplace listing" })).status, 200);
  const updatePath = `/api/super-admin/shops/${shop.id}/inventory/${item.id}`;
  assert.equal((await api("patch", updatePath).set("X-Support-Session-Id", sessionId).send({ availability: "ARCHIVED", reason: "Reject archiving actively listed inventory" })).status, 409);
  assert.equal((await prisma.marketplaceListing.findUnique({ where: { id: listing.id } })).status, "ACTIVE");
  assert.equal((await prisma.item.findUnique({ where: { id: item.id } })).availability, "AVAILABLE");
});

test("Super Admin CSV import rolls back items when mandatory audit evidence fails", async () => {
  await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION fail_support_import_audit() RETURNS trigger AS $$ BEGIN IF NEW."action" = 'BULK_IMPORT_INVENTORY' THEN RAISE EXCEPTION 'injected audit failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_support_import_audit BEFORE INSERT ON "InventoryAdminEvent" FOR EACH ROW EXECUTE FUNCTION fail_support_import_audit()`);
  try {
    const response = await api("post", "/api/inventory-bulk/import").set("X-Support-Session-Id", sessionId).field("shopId", shop.id).field("reason", "Failure injection inventory import").attach("file", Buffer.from("title,price\nAtomic CSV Item,25\n"), "inventory.csv");
    assert.equal(response.status, 500); assert.equal(response.body.error, "Failed to import inventory");
    assert.equal(await prisma.item.count({ where: { pawnShopId: shop.id, title: "Atomic CSV Item" } }), 0);
    assert.equal(await prisma.inventoryImportJob.count({ where: { shopId: shop.id, filename: "inventory.csv" } }), 0);
  } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS fail_support_import_audit ON "InventoryAdminEvent"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS fail_support_import_audit()`);
  }
});

test("Super Admin CSV audit records created item IDs and notification failure rolls back", async () => {
  const success = await api("post", "/api/inventory-bulk/import").set("X-Support-Session-Id", sessionId).field("shopId", shop.id).field("reason", "Record imported inventory identifiers").attach("file", Buffer.from("title,price,status\nRecorded CSV Item,30,SOLD\n"), "recorded.csv");
  assert.equal(success.status, 201); assert.equal(success.body.createdItemIds.length, 1);
  const imported = await prisma.item.findUnique({ where: { id: success.body.createdItemIds[0] } }); assert.equal(imported.status, "SOLD"); assert.equal(imported.availability, "SOLD");
  const audit = await prisma.inventoryAdminEvent.findFirst({ where: { supportSessionId: sessionId, action: "BULK_IMPORT_INVENTORY" }, orderBy: { createdAt: "desc" } });
  assert.deepEqual(audit.afterState.createdItemIds, success.body.createdItemIds);

  await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION fail_support_import_notification() RETURNS trigger AS $$ BEGIN IF NEW."dedupeKey" LIKE 'admin-inventory-import:%' THEN RAISE EXCEPTION 'injected notification failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_support_import_notification BEFORE INSERT ON "Notification" FOR EACH ROW EXECUTE FUNCTION fail_support_import_notification()`);
  try {
    const failed = await api("post", "/api/inventory-bulk/import").set("X-Support-Session-Id", sessionId).field("shopId", shop.id).field("reason", "Notification failure inventory import").attach("file", Buffer.from("title,price\nNotification Rollback Item,40\n"), "notification-failure.csv");
    assert.equal(failed.status, 500); assert.equal(failed.body.error, "Failed to import inventory");
    assert.equal(await prisma.item.count({ where: { pawnShopId: shop.id, title: "Notification Rollback Item" } }), 0);
    assert.equal(await prisma.inventoryAdminEvent.count({ where: { action: "BULK_IMPORT_INVENTORY", afterState: { path: ["filename"], equals: "notification-failure.csv" } } }), 0);
  } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS fail_support_import_notification ON "Notification"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS fail_support_import_notification()`);
  }
});
