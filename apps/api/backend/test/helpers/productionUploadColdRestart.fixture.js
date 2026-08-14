import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import jwt from "jsonwebtoken";
import request from "supertest";
import sharp from "sharp";
import { validateTestDatabaseEnvironment } from "../../scripts/assert-test-database.mjs";
import { createS3UploadStorage } from "../../src/services/uploadStorage.service.js";

const SECRET = "production-upload-cold-restart-secret-32-chars";
const marker = process.env.COLD_RESTART_MARKER;
const storageDirectory = process.env.COLD_RESTART_STORAGE_DIRECTORY;
const mode = process.argv[2];
const limits = Object.freeze({
  maxFileBytes: 2048, maxFiles: 3, maxAggregateBytes: 4096,
  maxWidth: 100, maxHeight: 100, maxPixels: 10_000,
  rateLimitWindowMs: 60_000, rateLimitUserMax: 100, rateLimitIpMax: 100,
  maxConcurrent: 4, storageTimeoutMs: 1_000,
});

assert.ok(marker);
assert.ok(storageDirectory);
const database = validateTestDatabaseEnvironment(process.env).database;
Object.assign(process.env, { JWT_SECRET: SECRET, DURABLE_UPLOADS_ENABLED: "false" });

const { prisma } = await import("../../src/lib/prisma.js");

function objectPath(key) {
  assert.match(key, /^uploads\//);
  return path.join(storageDirectory, ...key.split("/"));
}

const client = {
  async send(command) {
    const { Key: key, Body: body } = command.input;
    if (command.constructor.name === "PutObjectCommand") {
      const target = objectPath(key);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, body);
    } else if (command.constructor.name === "DeleteObjectCommand") {
      await rm(objectPath(key), { force: true });
    } else if (command.constructor.name === "HeadBucketCommand") {
      await mkdir(storageDirectory, { recursive: true });
    }
    return {};
  },
};

const storage = createS3UploadStorage({
  enabled: true,
  endpoint: "https://storage.example.test",
  region: "auto",
  forcePathStyle: false,
  accessKeyId: "fixture",
  secretAccessKey: "fixture",
  bucket: "fixture",
  publicBaseUrl: "https://images.example.test",
  limits,
}, { client });

async function fixtureRows() {
  const user = await prisma.user.findUnique({ where: { email: `${marker}@example.test` } });
  const shop = await prisma.pawnShop.findFirst({ where: { name: marker } });
  const item = shop ? await prisma.item.findFirst({ where: { pawnShopId: shop.id, title: marker } }) : null;
  const auction = item ? await prisma.auction.findFirst({ where: { itemId: item.id } }) : null;
  const uploadAssets = user ? await prisma.uploadAsset.findMany({ where: { uploaderId: user.id }, orderBy: { createdAt: "asc" } }) : [];
  const uploadAsset = uploadAssets.find(({ deliveryUrl }) => item?.images?.includes(deliveryUrl)) || null;
  const orphanAsset = uploadAssets.find(({ id }) => id !== uploadAsset?.id) || null;
  return { user, shop, item, auction, uploadAsset, orphanAsset };
}

async function cleanup() {
  const { user, shop, item } = await fixtureRows();
  if (item) await prisma.auction.deleteMany({ where: { itemId: item.id } });
  if (user) await prisma.uploadAsset.deleteMany({ where: { uploaderId: user.id } });
  if (item) await prisma.item.deleteMany({ where: { id: item.id } });
  if (shop) await prisma.pawnShop.deleteMany({ where: { id: shop.id } });
  if (user) await prisma.user.deleteMany({ where: { id: user.id } });
}

function token(user) {
  return jwt.sign({ sub: user.id, role: user.role, authVersion: user.authVersion }, SECRET);
}

function authorized(app, user, method, route) {
  return request(app)[method](route).set("Authorization", `Bearer ${token(user)}`);
}

async function writeFixture() {
  await cleanup();
  const [{ createApp }, png] = await Promise.all([
    import("../../src/app.js"),
    sharp({ create: { width: 8, height: 6, channels: 3, background: "red" } }).png().toBuffer(),
  ]);
  const user = await prisma.user.create({ data: { name: marker, email: `${marker}@example.test`, password: "not-used", role: "ADMIN", isActive: true } });
  const shop = await prisma.pawnShop.create({ data: { name: marker, ownerId: user.id, subscriptionPlan: "ULTRA", subscriptionStatus: "ACTIVE" } });
  const app = createApp({ readinessCheck: async () => true, uploadLimits: limits, uploadStorage: storage });
  const itemResponse = await authorized(app, user, "post", "/api/items").send({ pawnShopId: shop.id, title: marker, price: 125, images: [] }).expect(201);
  const uploadResponse = await authorized(app, user, "post", "/api/uploads")
    .field("kind", "ITEM_IMAGE").field("itemId", itemResponse.body.id)
    .attach("image", png, { filename: "durable.png", contentType: "image/png" }).expect(201);
  const url = uploadResponse.body.file.url;
  await authorized(app, user, "put", `/api/items/${itemResponse.body.id}`).send({ images: [url] }).expect(200);
  await authorized(app, user, "post", "/api/uploads")
    .field("kind", "ITEM_IMAGE").field("itemId", itemResponse.body.id)
    .attach("image", png, { filename: "orphan.png", contentType: "image/png" }).expect(201);
  const startsAt = new Date(Date.now() + 60_000);
  const auctionResponse = await authorized(app, user, "post", "/api/auctions").send({
    itemId: itemResponse.body.id, shopId: shop.id, startingPrice: 100,
    startsAt, endsAt: new Date(startsAt.getTime() + 3_600_000),
  }).expect(201);
  const rows = await fixtureRows();
  return {
    database, pid: process.pid, url,
    persisted: { uploadAsset: rows.uploadAsset?.deliveryUrl === url, item: rows.item?.images?.[0] === url, auction: rows.auction?.id === auctionResponse.body.id },
  };
}

async function readFixture() {
  const [{ createApp }, { cleanupStaleUploadAssets }, rows] = await Promise.all([
    import("../../src/app.js"),
    import("../../src/services/uploadAssets.service.js"),
    fixtureRows(),
  ]);
  assert.ok(rows.user && rows.shop && rows.item && rows.auction && rows.uploadAsset && rows.orphanAsset);
  await storage.check();
  const key = new URL(rows.uploadAsset.deliveryUrl).pathname.replace(/^\//, "");
  const bytes = await readFile(objectPath(key));
  const app = createApp({ readinessCheck: async () => true, uploadLimits: limits, uploadStorage: storage });
  const [itemCard, itemDetail, auctionCard, auctionDetail] = await Promise.all([
    request(app).get(`/api/items?shopId=${rows.shop.id}`).expect(200),
    request(app).get(`/api/items/${rows.item.id}`).expect(200),
    request(app).get(`/api/auctions?itemId=${rows.item.id}`).expect(200),
    request(app).get(`/api/auctions/${rows.auction.id}`).expect(200),
  ]);
  await prisma.uploadAsset.update({ where: { id: rows.uploadAsset.id }, data: { status: "DELETE_PENDING", deleteAfter: new Date(0) } });
  await prisma.uploadAsset.update({ where: { id: rows.orphanAsset.id }, data: { deleteAfter: new Date(0) } });
  await cleanupStaleUploadAssets({ storage, prismaClient: prisma, now: new Date(), logger: { warn() {} } });
  const attachedAfterCleanup = await prisma.uploadAsset.findUnique({ where: { id: rows.uploadAsset.id } });
  const orphanAfterCleanup = await prisma.uploadAsset.findUnique({ where: { id: rows.orphanAsset.id } });
  const attachedPreserved = (await readFile(objectPath(key))).length > 0 && attachedAfterCleanup.status === "ATTACHED";
  await authorized(app, rows.user, "put", `/api/items/${rows.item.id}`).send({ images: [] }).expect(200);
  const attachedAfterDetach = await prisma.uploadAsset.findUnique({ where: { id: rows.uploadAsset.id } });
  return {
    database, pid: process.pid, objectExists: bytes.length > 0,
    referenceCleanup: {
      attachedPreserved,
      orphanDeleted: orphanAfterCleanup.status === "DELETED",
      detachedDeleted: attachedAfterDetach.status === "DELETED",
    },
    representations: {
      itemCard: itemCard.body.rows.find(({ id }) => id === rows.item.id).images,
      itemDetail: itemDetail.body.images,
      auctionCard: auctionCard.body.rows.find(({ id }) => id === rows.auction.id).item.images,
      auctionDetail: auctionDetail.body.item.images,
    },
  };
}

try {
  const result = mode === "write" ? await writeFixture() : mode === "read" ? await readFixture() : await cleanup().then(() => ({ database }));
  process.stdout.write(JSON.stringify(result));
} finally {
  await prisma.$disconnect();
}
