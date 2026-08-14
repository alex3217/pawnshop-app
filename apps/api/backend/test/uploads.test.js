import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";
import jwt from "jsonwebtoken";
import request from "supertest";
import sharp from "sharp";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { createAggregateMemoryStorage } from "../src/middleware/aggregateMemoryStorage.js";
import { createUploadProtection } from "../src/middleware/uploadProtection.js";
import { HARD_UPLOAD_LIMITS, loadUploadLimits } from "../src/config/uploads.js";
import { createS3UploadStorage } from "../src/services/uploadStorage.service.js";

const SECRET = "upload-tests-only-secret-at-least-thirty-two-characters";
const limits = Object.freeze({ maxFileBytes: 2048, maxFiles: 3, maxAggregateBytes: 4096, maxWidth: 100, maxHeight: 100, maxPixels: 10_000, rateLimitWindowMs: 60_000, rateLimitUserMax: 100, rateLimitIpMax: 100, maxConcurrent: 4, storageTimeoutMs: 50 });
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
let deleteFailure;
let warnings;
let png;
let jpeg;
let webp;
let assetRows;

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
  prisma.uploadAsset.create = async ({ data }) => { assetRows.set(data.id, { ...data, status: "TEMPORARY" }); return assetRows.get(data.id); };
  prisma.uploadAsset.updateMany = async ({ where, data }) => {
    let count = 0;
    const ids = where.id?.in || [where.id];
    for (const id of ids) {
      if (assetRows.get(id)?.status === where.status) {
        assetRows.set(id, { ...assetRows.get(id), ...data });
        count += 1;
      }
    }
    return { count };
  };
  png = await sharp({ create: { width: 8, height: 6, channels: 3, background: "red" } }).png().toBuffer();
  jpeg = await sharp(png).jpeg().toBuffer();
  webp = await sharp(png).webp().toBuffer();
  app = appModule.createApp({
    readinessCheck: async () => true,
    uploadLimits: limits,
    uploadStorage: {
      async put(input) {
        stored.push(input);
        if (putFailureAt === stored.length) throw new Error("provider secret detail");
        return { url: `https://assets.example.test/${input.key}` };
      },
      async delete(input) { deleted.push(input); if (deleteFailure) throw new Error("private provider cleanup detail"); },
    },
    uploadLogger: { warn(message, details) { warnings.push({ message, details }); } },
  });
});

beforeEach(() => {
  stored = [];
  deleted = [];
  putFailureAt = 0;
  deleteFailure = false;
  warnings = [];
  assetRows = new Map();
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
  assert.equal(assetRows.get(response.body.file.id)?.shopId, "shop");
  assert.equal(assetRows.get(response.body.file.id)?.itemId, "item");
});

test("JPEG and WebP uploads are decoded, normalized, and tracked without provider network calls", async () => {
  const jpgResponse = await upload("/api/uploads").field("kind", "SHOP_LOGO").field("shopId", "shop").attach("logo", jpeg, { filename: "photo.jpg", contentType: "image/jpeg" }).expect(201);
  const webpResponse = await upload("/api/uploads").field("kind", "SHOP_BANNER").field("shopId", "shop").attach("banner", webp, { filename: "photo.webp", contentType: "image/webp" }).expect(201);
  assert.equal(jpgResponse.body.file.mimeType, "image/jpeg");
  assert.equal(webpResponse.body.file.mimeType, "image/webp");
  assert.equal(stored.length, 2);
  assert.equal(assetRows.size, 2);
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

test("partial bulk provider failure removes objects and retains terminal lifecycle records", async () => {
  putFailureAt = 2;
  await upload("/api/uploads/bulk").field("kind", "SHOP_BANNER").field("shopId", "shop").attach("images", png, { filename: "1.png", contentType: "image/png" }).attach("images", png, { filename: "2.png", contentType: "image/png" }).expect(502);
  assert.equal(deleted.length, 1);
  assert.equal(deleted[0].key, stored[0].key);
  assert.equal(assetRows.size, 1);
  assert.equal([...assetRows.values()][0].status, "DELETED");
});

test("cleanup failures are sanitized and observable without replacing the original response", async () => {
  putFailureAt = 2;
  deleteFailure = true;
  const response = await upload("/api/uploads/bulk").field("kind", "SHOP_BANNER").field("shopId", "shop").attach("images", png, { filename: "1.png", contentType: "image/png" }).attach("images", png, { filename: "2.png", contentType: "image/png" }).expect(502);
  assert.equal(response.body.error, "Image storage is temporarily unavailable");
  assert.deepEqual(warnings, [{ message: "[uploads] durable cleanup incomplete", details: { requestId: warnings[0].details.requestId, cleanupFailureCount: 1 } }]);
  assert.equal(JSON.stringify(warnings).includes("private provider"), false);
  assert.equal(JSON.stringify(warnings).includes("uploads/"), false);
  assert.equal([...assetRows.values()][0].status, "DELETE_PENDING");
});

test("aggregate storage rejects while receiving and does not retain the overflowing file", async () => {
  const storage = createAggregateMemoryStorage(5);
  const req = {};
  const stream = Readable.from([Buffer.from("1234"), Buffer.from("5678")]);
  const result = await new Promise((resolve) => storage._handleFile(req, { stream }, (error, file) => resolve({ error, file })));
  assert.equal(result.error?.statusCode, 413);
  assert.equal(result.file, undefined);
  assert.equal(req.uploadIncomingBytes > 5, true);
});

test("immutable upload ceilings and limit relationships fail closed", () => {
  for (const [key, maximum] of Object.entries(HARD_UPLOAD_LIMITS)) {
    const envName = ({ maxFileBytes: "UPLOAD_MAX_FILE_BYTES", maxFiles: "UPLOAD_MAX_FILES", maxAggregateBytes: "UPLOAD_MAX_AGGREGATE_BYTES", maxWidth: "UPLOAD_MAX_WIDTH", maxHeight: "UPLOAD_MAX_HEIGHT", maxPixels: "UPLOAD_MAX_PIXELS", rateLimitWindowMs: "UPLOAD_RATE_LIMIT_WINDOW_MS", rateLimitUserMax: "UPLOAD_RATE_LIMIT_USER_MAX", rateLimitIpMax: "UPLOAD_RATE_LIMIT_IP_MAX", maxConcurrent: "UPLOAD_MAX_CONCURRENT", storageTimeoutMs: "UPLOAD_STORAGE_TIMEOUT_MS" })[key];
    assert.throws(() => loadUploadLimits({ [envName]: String(maximum + 1) }), /immutable safety ceiling/);
  }
  assert.throws(() => loadUploadLimits({ UPLOAD_MAX_FILE_BYTES: "100", UPLOAD_MAX_AGGREGATE_BYTES: "99" }), /at least/);
  assert.throws(() => loadUploadLimits({ UPLOAD_MAX_WIDTH: "10", UPLOAD_MAX_HEIGHT: "10", UPLOAD_MAX_PIXELS: "101" }), /WIDTH.*HEIGHT/);
});

test("upload protection enforces user, IP, and bounded concurrency without a queue", async () => {
  const protection = createUploadProtection({ limits: { ...limits, rateLimitUserMax: 1, rateLimitIpMax: 2, maxConcurrent: 1 }, now: () => 100 });
  const next = () => {};
  function response() { const value = new EventEmitter(); value.headers = {}; value.setHeader = (k, v) => { value.headers[k] = v; }; value.status = (status) => { value.statusCode = status; return value; }; value.json = (body) => { value.body = body; return value; }; return value; }
  const req = { user: { sub: "u1" }, ip: "127.0.0.1" };
  await protection.rateLimit(req, response(), next);
  const userLimited = response(); await protection.rateLimit(req, userLimited, next); assert.equal(userLimited.statusCode, 429);
  const secondUser = response(); await protection.rateLimit({ user: { sub: "u2" }, ip: "127.0.0.1" }, secondUser, next); assert.equal(secondUser.statusCode, undefined);
  const ipLimited = response(); await protection.rateLimit({ user: { sub: "u3" }, ip: "127.0.0.1" }, ipLimited, next); assert.equal(ipLimited.statusCode, 429);
  const held = response(); protection.concurrency(req, held, next);
  const capacity = response(); protection.concurrency(req, capacity, next); assert.equal(capacity.statusCode, 503); assert.equal(protection.active, 1);
  held.emit("finish"); assert.equal(protection.active, 0);
});

test("S3-compatible operations abort after the configured timeout", async () => {
  const client = { send(_command, { abortSignal }) { return new Promise((_resolve, reject) => abortSignal.addEventListener("abort", () => reject(abortSignal.reason), { once: true })); } };
  const storage = createS3UploadStorage({ enabled: true, endpoint: "https://storage.example.test", region: "auto", forcePathStyle: false, accessKeyId: "test", secretAccessKey: "test", bucket: "test", publicBaseUrl: "https://assets.example.test", limits: { ...limits, storageTimeoutMs: 5 } }, { client });
  async function expectTimeout(operation) {
    const keepAlive = setTimeout(() => {}, 1_000);
    try { await assert.rejects(operation(), /abort|timeout/i); } finally { clearTimeout(keepAlive); }
  }
  await expectTimeout(() => storage.put({ key: "uploads/test.png", body: png, contentType: "image/png" }));
  await expectTimeout(() => storage.delete({ key: "uploads/test.png" }));
  await expectTimeout(() => storage.check());
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
