import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import jwt from "jsonwebtoken";
import request from "supertest";
import sharp from "sharp";
import { validateTestDatabaseEnvironment } from "../scripts/assert-test-database.mjs";
import { createS3UploadStorage } from "../src/services/uploadStorage.service.js";

const SECRET = "production-upload-durability-test-secret-32-chars";
const marker = `production-upload-durability-${process.pid}-${Date.now()}`;
const limits = Object.freeze({
  maxFileBytes: 2048,
  maxFiles: 3,
  maxAggregateBytes: 4096,
  maxWidth: 100,
  maxHeight: 100,
  maxPixels: 10_000,
  rateLimitWindowMs: 60_000,
  rateLimitUserMax: 100,
  rateLimitIpMax: 100,
  maxConcurrent: 4,
  storageTimeoutMs: 100,
});

let prisma;
let createApp;
let cleanupStaleUploadAssets;
let admin;
let shop;
let png;

function fakeObjectStore() {
  const keys = new Set();
  const deletedKeys = [];
  return {
    keys,
    deletedKeys,
    client: {
      async send(command) {
        if (command.constructor.name === "PutObjectCommand") keys.add(command.input.Key);
        if (command.constructor.name === "DeleteObjectCommand") {
          deletedKeys.push(command.input.Key);
          keys.delete(command.input.Key);
        }
        return {};
      },
    },
  };
}

function storageFor(store) {
  return createS3UploadStorage({
    enabled: true,
    endpoint: "https://storage.example.test",
    region: "auto",
    forcePathStyle: false,
    accessKeyId: "fixture",
    secretAccessKey: "fixture",
    bucket: "fixture",
    publicBaseUrl: "https://images.example.test",
    limits,
  }, { client: store.client });
}

function token() {
  return jwt.sign({ sub: admin.id, role: admin.role, authVersion: admin.authVersion }, SECRET);
}

function authorized(app, method, path) {
  return request(app)[method](path).set("Authorization", `Bearer ${token()}`);
}

async function cleanupRows() {
  if (!prisma) return;
  const items = await prisma.item.findMany({
    where: { shop: { name: marker } },
    select: { id: true },
  });
  const itemIds = items.map(({ id }) => id);
  await prisma.auction.deleteMany({ where: { itemId: { in: itemIds } } });
  await prisma.uploadAsset.deleteMany({ where: { uploader: { email: `${marker}@example.test` } } });
  await prisma.item.deleteMany({ where: { id: { in: itemIds } } });
  await prisma.pawnShop.deleteMany({ where: { name: marker } });
  await prisma.user.deleteMany({ where: { email: `${marker}@example.test` } });
}

before(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    APP_ENV: "test",
    JWT_SECRET: SECRET,
    DURABLE_UPLOADS_ENABLED: "false",
  });
  validateTestDatabaseEnvironment(process.env);
  const [prismaModule, appModule, assetModule] = await Promise.all([
    import("../src/lib/prisma.js"),
    import("../src/app.js"),
    import("../src/services/uploadAssets.service.js"),
  ]);
  prisma = prismaModule.prisma;
  createApp = appModule.createApp;
  cleanupStaleUploadAssets = assetModule.cleanupStaleUploadAssets;
  await cleanupRows();
  admin = await prisma.user.create({
    data: {
      name: marker,
      email: `${marker}@example.test`,
      password: "not-used",
      role: "ADMIN",
      isActive: true,
    },
  });
  shop = await prisma.pawnShop.create({
    data: { name: marker, ownerId: admin.id, subscriptionPlan: "ULTRA", subscriptionStatus: "ACTIVE" },
  });
  png = await sharp({ create: { width: 8, height: 6, channels: 3, background: "red" } }).png().toBuffer();
});

after(async () => {
  if (!prisma) return;
  await cleanupRows();
  await prisma.$disconnect();
});

test("uploaded item and auction image URL survives app recreation and follows reference-safe cleanup", async () => {
  const objectStore = fakeObjectStore();
  const firstApp = createApp({ readinessCheck: async () => true, uploadLimits: limits, uploadStorage: storageFor(objectStore) });

  const createdItem = await authorized(firstApp, "post", "/api/items")
    .send({ pawnShopId: shop.id, title: marker, price: 125, images: [] })
    .expect(201);

  const attachedUpload = await authorized(firstApp, "post", "/api/uploads")
    .field("kind", "ITEM_IMAGE")
    .field("itemId", createdItem.body.id)
    .attach("image", png, { filename: "durable.png", contentType: "image/png" })
    .expect(201);
  const durableUrl = attachedUpload.body.file.url;
  const attachedKey = new URL(durableUrl).pathname.replace(/^\//, "");

  await authorized(firstApp, "put", `/api/items/${createdItem.body.id}`)
    .send({ images: [durableUrl] })
    .expect(200)
    .expect(({ body }) => assert.deepEqual(body.images, [durableUrl]));

  const orphanUpload = await authorized(firstApp, "post", "/api/uploads")
    .field("kind", "ITEM_IMAGE")
    .field("itemId", createdItem.body.id)
    .attach("image", png, { filename: "orphan.png", contentType: "image/png" })
    .expect(201);
  const orphanKey = new URL(orphanUpload.body.file.url).pathname.replace(/^\//, "");

  const startsAt = new Date(Date.now() + 60_000);
  const auction = await authorized(firstApp, "post", "/api/auctions")
    .send({ itemId: createdItem.body.id, shopId: shop.id, startingPrice: 100, startsAt, endsAt: new Date(startsAt.getTime() + 3_600_000) })
    .expect(201);

  assert.equal(objectStore.keys.has(attachedKey), true);
  assert.equal(objectStore.keys.has(orphanKey), true);

  const secondApp = createApp({ readinessCheck: async () => true, uploadLimits: limits, uploadStorage: storageFor(objectStore) });
  const [itemCard, itemDetail, auctionCard, auctionDetail] = await Promise.all([
    request(secondApp).get(`/api/items?shopId=${shop.id}`).expect(200),
    request(secondApp).get(`/api/items/${createdItem.body.id}`).expect(200),
    request(secondApp).get(`/api/auctions?itemId=${createdItem.body.id}`).expect(200),
    request(secondApp).get(`/api/auctions/${auction.body.id}`).expect(200),
  ]);
  assert.deepEqual(itemCard.body.rows.find(({ id }) => id === createdItem.body.id).images, [durableUrl]);
  assert.deepEqual(itemDetail.body.images, [durableUrl]);
  assert.deepEqual(auctionCard.body.rows.find(({ id }) => id === auction.body.id).item.images, [durableUrl]);
  assert.deepEqual(auctionDetail.body.item.images, [durableUrl]);

  await prisma.uploadAsset.update({
    where: { id: attachedUpload.body.file.id },
    data: { status: "DELETE_PENDING", deleteAfter: new Date(0) },
  });
  await prisma.uploadAsset.update({
    where: { id: orphanUpload.body.file.id },
    data: { deleteAfter: new Date(0) },
  });
  const cleanup = await cleanupStaleUploadAssets({ storage: secondApp.locals.uploadStorage, prismaClient: prisma, now: new Date() });
  assert.equal(cleanup.deleted, 1);
  assert.equal(objectStore.keys.has(attachedKey), true);
  assert.equal(objectStore.deletedKeys.includes(attachedKey), false);
  assert.equal((await prisma.uploadAsset.findUnique({ where: { id: attachedUpload.body.file.id } })).status, "ATTACHED");
  assert.equal(objectStore.keys.has(orphanKey), false);
  assert.equal((await prisma.uploadAsset.findUnique({ where: { id: orphanUpload.body.file.id } })).status, "DELETED");

  await authorized(secondApp, "put", `/api/items/${createdItem.body.id}`)
    .send({ images: [] })
    .expect(200);
  assert.equal(objectStore.keys.has(attachedKey), false);
  assert.equal((await prisma.uploadAsset.findUnique({ where: { id: attachedUpload.body.file.id } })).status, "DELETED");
});
