import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";
import jwt from "jsonwebtoken";
import request from "supertest";
import sharp from "sharp";

const SECRET = "upload-tests-only-secret-at-least-thirty-two-characters";
const limits = Object.freeze({ maxFileBytes: 2048, maxFiles: 3, maxAggregateBytes: 4096, maxWidth: 100, maxHeight: 100, maxPixels: 10_000 });
const users = new Map([
  ["owner", { id: "owner", email: "owner@upload.test", role: "OWNER", isActive: true, authVersion: 0 }],
  ["buyer", { id: "buyer", email: "buyer@upload.test", role: "CONSUMER", isActive: true, authVersion: 0 }],
  ["other", { id: "other", email: "other@upload.test", role: "OWNER", isActive: true, authVersion: 0 }],
  ["admin", { id: "admin", email: "admin@upload.test", role: "ADMIN", isActive: true, authVersion: 0 }],
  ["staff", { id: "staff", email: "staff@upload.test", role: "CONSUMER", isActive: true, authVersion: 0 }],
]);

let app;
let prisma;
let stored;
let deleted;
let putFailureAt;
let png;

function token(id) {
  return jwt.sign({ sub: id, role: users.get(id).role, authVersion: 0 }, SECRET);
}

function upload(path, id = "owner") {
  const call = request(app).post(path);
  return id ? call.set("Authorization", `Bearer ${token(id)}`) : call;
}

before(async () => {
  Object.assign(process.env, { NODE_ENV: "test", APP_ENV: "test", JWT_SECRET: SECRET, DURABLE_UPLOADS_ENABLED: "false" });
  const [prismaModule, appModule] = await Promise.all([import("../src/lib/prisma.js"), import("../src/app.js")]);
  prisma = prismaModule.prisma;
  prisma.user.findUnique = async ({ where }) => users.get(where.id) || null;
  prisma.ownerApplication.findUnique = async ({ where }) => where.ownerId === "owner" || where.ownerId === "other" ? { status: "APPROVED" } : null;
  prisma.staff.findMany = async ({ where }) => where.OR?.some((entry) => entry.userId === "staff") ? [{
    shopId: "shop", userId: "staff", email: "staff@upload.test", status: "ACTIVE",
    permissions: ["inventory:write"],
    shop: { id: "shop", ownerId: "owner", isDeleted: false, subscriptionStatus: "ACTIVE" },
  }] : [];
  prisma.item.findUnique = async ({ where }) => where.id === "item" ? { id: "item", isDeleted: false, shop: { id: "shop", ownerId: "owner", isDeleted: false } } : null;
  prisma.pawnShop.findUnique = async ({ where }) => where.id === "shop" ? { id: "shop", ownerId: "owner", isDeleted: false } : null;
  png = await sharp({ create: { width: 8, height: 6, channels: 3, background: "red" } }).png().toBuffer();
  app = appModule.createApp({
    readinessCheck: async () => true,
    uploadLimits: limits,
    uploadStorage: {
      async put(input) {
        stored.push(input);
        if (putFailureAt === stored.length) throw new Error("provider secret detail");
        return { url: `https://assets.example.test/${input.key}` };
      },
      async delete(input) { deleted.push(input); },
    },
  });
});

beforeEach(() => {
  stored = [];
  deleted = [];
  putFailureAt = 0;
});

test("upload router is mounted once at the frontend API path", async () => {
  await upload("/api/uploads", null).expect(401);
  await upload("/api/api/uploads", null).expect(404);
});

test("unauthenticated uploads are rejected before multipart processing", async () => {
  await upload("/api/uploads", null).attach("image", png, { filename: "photo.png", contentType: "image/png" }).expect(401);
  assert.equal(stored.length, 0);
});

test("buyers and unapproved owners cannot upload", async () => {
  await upload("/api/uploads", "buyer").field("kind", "SHOP_LOGO").field("shopId", "shop").attach("logo", png, { filename: "x.png", contentType: "image/png" }).expect(403);
  const prior = prisma.ownerApplication.findUnique;
  prisma.ownerApplication.findUnique = async () => ({ status: "PENDING" });
  await upload("/api/uploads", "owner").field("kind", "SHOP_LOGO").field("shopId", "shop").attach("logo", png, { filename: "x.png", contentType: "image/png" }).expect(403);
  prisma.ownerApplication.findUnique = prior;
});

test("an approved owner cannot upload for an unrelated shop", async () => {
  await upload("/api/uploads", "other").field("kind", "SHOP_LOGO").field("shopId", "shop").attach("logo", png, { filename: "x.png", contentType: "image/png" }).expect(403);
});

test("active shop staff with inventory write permission can upload for that shop", async () => {
  await upload("/api/uploads", "staff").field("kind", "SHOP_LOGO").field("shopId", "shop").attach("logo", png, { filename: "x.png", contentType: "image/png" }).expect(201);
  assert.equal(stored.length, 1);
});

test("single item upload returns the frontend-compatible durable asset contract", async () => {
  const response = await upload("/api/uploads").field("kind", "ITEM_IMAGE").field("itemId", "item").attach("image", png, { filename: "photo.png", contentType: "image/png" }).expect(201);
  assert.match(response.body.file.id, /^[0-9a-f-]{36}$/);
  assert.match(response.body.file.url, /^https:\/\/assets\.example\.test\/uploads\//);
  assert.equal(response.body.file.mimeType, "image/png");
  assert.equal(response.body.file.width, 8);
  assert.equal(response.body.file.height, 6);
  assert.equal(response.body.file.key, undefined);
});

test("bulk uploads are atomic and preserve input order", async () => {
  const response = await upload("/api/uploads/bulk").field("kind", "SHOP_BANNER").field("shopId", "shop").attach("images", png, { filename: "one.png", contentType: "image/png" }).attach("images", png, { filename: "two.png", contentType: "image/png" }).expect(201);
  assert.equal(response.body.files.length, 2);
  assert.notEqual(response.body.files[0].id, response.body.files[1].id);
});

test("MIME allowlist rejects SVG and executable content", async () => {
  await upload("/api/uploads").field("kind", "SHOP_LOGO").field("shopId", "shop").attach("logo", Buffer.from("<svg><script/></svg>"), { filename: "x.svg", contentType: "image/svg+xml" }).expect(415);
});

test("magic-byte and declared MIME mismatches are rejected", async () => {
  await upload("/api/uploads").field("kind", "SHOP_LOGO").field("shopId", "shop").attach("logo", png, { filename: "x.jpg", contentType: "image/jpeg" }).expect(415);
});

test("empty and corrupt images are rejected", async () => {
  await upload("/api/uploads").field("kind", "SHOP_LOGO").field("shopId", "shop").attach("logo", Buffer.alloc(0), { filename: "empty.png", contentType: "image/png" }).expect(400);
  await upload("/api/uploads").field("kind", "SHOP_LOGO").field("shopId", "shop").attach("logo", Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]), { filename: "bad.png", contentType: "image/png" }).expect(400);
});

test("per-file, bulk-count, and aggregate limits are enforced", async () => {
  await upload("/api/uploads").field("kind", "SHOP_LOGO").field("shopId", "shop").attach("logo", Buffer.alloc(3000), { filename: "large.png", contentType: "image/png" }).expect(413);
  const count = upload("/api/uploads/bulk").field("kind", "SHOP_BANNER").field("shopId", "shop");
  for (let i = 0; i < 4; i += 1) count.attach("images", png, { filename: `${i}.png`, contentType: "image/png" });
  await count.expect(413);
  const aggregateLimits = { ...limits, maxFileBytes: 4096, maxAggregateBytes: png.length + 1 };
  const appModule = await import("../src/app.js");
  const aggregateApp = appModule.createApp({ readinessCheck: async () => true, uploadLimits: aggregateLimits, uploadStorage: app.locals.uploadStorage });
  await request(aggregateApp).post("/api/uploads/bulk").set("Authorization", `Bearer ${token("owner")}`).field("kind", "SHOP_BANNER").field("shopId", "shop").attach("images", png, { filename: "1.png", contentType: "image/png" }).attach("images", png, { filename: "2.png", contentType: "image/png" }).expect(413);
});

test("object keys are randomized and ignore traversal filenames", async () => {
  await upload("/api/uploads").field("kind", "SHOP_LOGO").field("shopId", "shop").attach("logo", png, { filename: "../../escape.php.png", contentType: "image/png" }).expect(201);
  assert.match(stored[0].key, /^uploads\/[0-9a-f-]{36}\.png$/);
  assert.doesNotMatch(stored[0].key, /escape|\.\.|php/);
});

test("provider failures are sanitized", async () => {
  putFailureAt = 1;
  const response = await upload("/api/uploads").field("kind", "SHOP_LOGO").field("shopId", "shop").attach("logo", png, { filename: "x.png", contentType: "image/png" }).expect(502);
  assert.equal(JSON.stringify(response.body).includes("provider secret detail"), false);
});

test("partial bulk provider failure removes objects created in the request", async () => {
  putFailureAt = 2;
  await upload("/api/uploads/bulk").field("kind", "SHOP_BANNER").field("shopId", "shop").attach("images", png, { filename: "1.png", contentType: "image/png" }).attach("images", png, { filename: "2.png", contentType: "image/png" }).expect(502);
  assert.equal(deleted.length, 1);
  assert.equal(deleted[0].key, stored[0].key);
});

test("admin uploads still require a real target and receive no arbitrary path control", async () => {
  await upload("/api/uploads", "admin").field("kind", "SHOP_LOGO").field("shopId", "missing").field("key", "chosen/path").attach("logo", png, { filename: "x.png", contentType: "image/png" }).expect(404);
});

test("durable storage configuration fails closed without required provider settings", async () => {
  const { loadDurableUploadConfig } = await import("../src/config/uploads.js");
  assert.throws(() => loadDurableUploadConfig({ DURABLE_UPLOADS_ENABLED: "true" }), /UPLOAD_STORAGE_/);
  assert.throws(() => loadDurableUploadConfig({ DURABLE_UPLOADS_ENABLED: "yes" }), /exactly true or false/);
  assert.equal(loadDurableUploadConfig({ DURABLE_UPLOADS_ENABLED: "false" }).enabled, false);
});
