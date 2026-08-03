import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import express from "express";
import request from "supertest";
import { SELLER_PLANS } from "../src/config/sellerPlans.js";
import { BUYER_PLANS } from "../src/config/buyerPlans.js";
import { MAX_PRODUCT_IMAGE_BYTES, validateProductImageFile } from "../src/services/productMediaStorage.service.js";
import { assertAiCapacity, createListingAssistantSuggestion, recordAiCredit } from "../src/services/aiListingAssistant.service.js";
import { assertListingCapacity, assertSellerItemPhotoLimit, buildEntitlements, ACTIVE_LISTING_STATUSES } from "../src/services/sellerPlan.service.js";
import uploadsRouter, { parseProductImages } from "../src/routes/uploads.routes.js";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const repositoryFile = (...parts) => path.join(REPOSITORY_ROOT, ...parts);

function response() { return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }

test("buyer and seller image limits cover every plan", () => {
  assert.deepEqual(Object.values(BUYER_PLANS).map((plan) => plan.maxSellItemPhotos), [6, 12, 20, 30]);
  assert.deepEqual(Object.values(SELLER_PLANS).map((plan) => plan.maxItemPhotos), [8, 12, 20, 30]);
});

test("approved active product and marketplace limits are exact", () => {
  assert.equal(SELLER_PLANS.FREE.maxActiveListings, 20);
  assert.equal(SELLER_PLANS.FREE.trialMaxActiveListings, 50);
  assert.equal(SELLER_PLANS.PRO.maxActiveListings, 100);
  assert.equal(SELLER_PLANS.PREMIUM.maxActiveListings, null);
  assert.equal(SELLER_PLANS.ULTRA.maxActiveListings, null);
  assert.equal(BUYER_PLANS.ULTRA.maxActiveMarketplaceListings, 150);
  assert.equal(BUYER_PLANS.ULTRA.maxMonthlyMarketplaceListings, 500);
});

test("paid owner photo limits are authoritative and server-enforced", () => {
  for (const code of ["FREE", "PRO", "PREMIUM", "ULTRA"]) {
    const plan = SELLER_PLANS[code];
    const entitlements = buildEntitlements({ id: "shop", subscriptionPlan: code, subscriptionStatus: "ACTIVE" }, 0, plan);
    assert.equal(entitlements.limits.maxItemPhotos, plan.maxItemPhotos);
    assert.doesNotThrow(() => assertSellerItemPhotoLimit(entitlements, plan.maxItemPhotos));
    assert.throws(() => assertSellerItemPhotoLimit(entitlements, plan.maxItemPhotos + 1), { code: "SELLER_PLAN_LIMIT_REACHED" });
  }
});

test("activation and reactivation enforce active-product limits while non-public statuses do not count", () => {
  assert.deepEqual(ACTIVE_LISTING_STATUSES, ["AVAILABLE", "PENDING"]);
  const freeAtLimit = buildEntitlements({ id: "shop", subscriptionPlan: "FREE", subscriptionStatus: "ACTIVE" }, 20, SELLER_PLANS.FREE);
  assert.throws(() => assertListingCapacity(freeAtLimit, 1), { code: "PLAN_LIMIT_REACHED" });
  for (const status of ["DRAFT", "SOLD", "ARCHIVED", "INACTIVE", "REJECTED", "REMOVED"]) assert.equal(ACTIVE_LISTING_STATUSES.includes(status), false);
});

test("concurrent AI credits cannot exceed the plan limit", async () => {
  let used = 0;
  let queue = Promise.resolve();
  const database = { $transaction(callback) { const run = queue.then(() => callback({ aiListingGeneration: { count: async () => used, create: async () => { used += 1; } } })); queue = run.catch(() => undefined); return run; } };
  const scope = { userId: "buyer", shopId: null, periodStart: new Date(0), usage: { limit: 3 }, planCode: "FREE", displayName: "Free", resource: "buyerAiListingGenerations", upgradePath: "/buyer/subscription" };
  const results = await Promise.allSettled(Array.from({ length: 4 }, () => recordAiCredit(scope, "fallback", database)));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 3);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(used, 3);
});

test("marketplace AI panel uses typed fields without an unsafe cast", () => {
  const source = fs.readFileSync(repositoryFile("apps/web/src/pages/CreateMarketplaceListingPage.tsx"), "utf8");
  assert.doesNotMatch(source, /AiListingAssistantPanel[^\n]*as never/);
});

test("owner and consumer image enforcement remains on server create and update paths", () => {
  const items = fs.readFileSync(repositoryFile("apps/api/backend/src/controllers/items.controller.js"), "utf8");
  const marketplace = fs.readFileSync(repositoryFile("apps/api/backend/src/controllers/marketplaceListings.controller.js"), "utf8");
  assert.match(items, /assertSellerItemPhotoCapacity\(pawnShopId, images\.length\)/);
  assert.match(items, /assertSellerItemPhotoCapacity\(item\.shop\.id, images\.length\)/);
  assert.match(items, /assertCanCreateListingForShop\(item\.shop\.id\)/);
  assert.match(marketplace, /assertBuyerSellingCapacity\(userId, \{ photoCount: data\.images\.length \}\)/);
  assert.match(marketplace, /assertSellerItemPhotoCapacity\(existing\.sellerShopId, data\.images\.length\)/);
});

test("marketplace forms do not slice images before server enforcement", () => {
  for (const file of ["CreateMarketplaceListingPage.tsx", "EditMarketplaceListingPage.tsx"]) {
    const source = fs.readFileSync(repositoryFile("apps/web/src/pages", file), "utf8");
    assert.doesNotMatch(source, /images:\s*\[[^\n]+\]\.slice\(/);
  }
});

test("buyer and seller AI generation credits cover every plan and never use null", () => {
  assert.deepEqual(Object.values(BUYER_PLANS).map((plan) => plan.maxAiListingGenerationsPerMonth), [3, 30, 100, 300]);
  assert.deepEqual(Object.values(SELLER_PLANS).map((plan) => plan.maxAiListingGenerationsPerMonth), [3, 30, 100, 300]);
});

test("AI generation capacity is enforced for every buyer and seller plan", () => {
  for (const [kind, plans] of [["buyer", BUYER_PLANS], ["seller", SELLER_PLANS]]) {
    for (const plan of Object.values(plans)) {
      assert.throws(() => assertAiCapacity({ usage: { used: plan.maxAiListingGenerationsPerMonth, limit: plan.maxAiListingGenerationsPerMonth, atLimit: true }, resource: kind === "buyer" ? "buyerAiListingGenerations" : "sellerAiListingGenerations", planCode: plan.code, displayName: plan.label, upgradePath: kind === "buyer" ? "/buyer/subscription" : "/owner/subscription" }), (error) => error.statusCode === 409 && error.details.limit === plan.maxAiListingGenerationsPerMonth);
    }
  }
});

test("product media rejects unsupported and oversized files", () => {
  assert.throws(() => validateProductImageFile({ buffer: Buffer.from("x"), mimetype: "image/heic", size: 1, originalname: "item.heic" }), (error) => error.statusCode === 415 && error.code === "UNSUPPORTED_PRODUCT_IMAGE_TYPE");
  assert.throws(() => validateProductImageFile({ buffer: Buffer.alloc(1), mimetype: "image/jpeg", size: MAX_PRODUCT_IMAGE_BYTES + 1, originalname: "large.jpg" }), (error) => error.statusCode === 413 && error.code === "PRODUCT_IMAGE_TOO_LARGE");
  assert.throws(() => validateProductImageFile({ buffer: Buffer.from("not-a-png"), mimetype: "image/png", size: 9, originalname: "fake.png" }), (error) => error.statusCode === 415 && error.code === "INVALID_PRODUCT_IMAGE_CONTENT");
});

test("media upload mutations remain authenticated and role-protected", () => {
  const source = fs.readFileSync(repositoryFile("apps/api/backend/src/routes/uploads.routes.js"), "utf8");
  assert.match(source, /authRequired, requireRole\("CONSUMER", "OWNER", "ADMIN", "SUPER_ADMIN"\)/);
  assert.match(source, /router\.post\("\/", \.\.\.allowed/);
  assert.match(source, /router\.post\("\/bulk", \.\.\.allowed/);
});

function uploadParserApp() {
  const app = express();
  app.post("/", parseProductImages, (req, res) => {
    try {
      validateProductImageFile(req.files?.[0]);
      return res.status(204).end();
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message, code: error.code });
    }
  });
  return app;
}

test("upload parser returns safe 413 responses for oversized images and excess file counts", async () => {
  const oversized = await request(uploadParserApp())
    .post("/")
    .attach("images", Buffer.alloc(MAX_PRODUCT_IMAGE_BYTES + 1), { filename: "private-path-secret.png", contentType: "image/png" });
  assert.equal(oversized.status, 413);
  assert.deepEqual(oversized.body, { success: false, error: "Each product image must be 8 MB or smaller.", code: "LIMIT_FILE_SIZE" });
  assert.doesNotMatch(JSON.stringify(oversized.body), /private-path-secret|buffer|stack/i);

  let excessFiles = request(uploadParserApp()).post("/");
  for (let index = 0; index < 31; index += 1) {
    excessFiles = excessFiles.attach("images", Buffer.from([0x89]), { filename: `secret-${index}.png`, contentType: "image/png" });
  }
  const excessive = await excessFiles;
  assert.equal(excessive.status, 413);
  assert.deepEqual(excessive.body, { success: false, error: "A maximum of 30 product images may be uploaded at once.", code: "LIMIT_FILE_COUNT" });
  assert.doesNotMatch(JSON.stringify(excessive.body), /secret-|buffer|stack/i);
});

test("allowed upload parsing reaches normal product image validation", async () => {
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const result = await request(uploadParserApp())
    .post("/")
    .attach("images", pngSignature, { filename: "item.png", contentType: "image/png" });
  assert.equal(result.status, 204);
});

test("upload routes reject unauthenticated multipart requests before parsing", async () => {
  const app = express();
  app.use(uploadsRouter);
  const result = await request(app)
    .post("/")
    .attach("images", Buffer.from("not-an-image"), { filename: "invalid.png", contentType: "image/png" });
  assert.equal(result.status, 401);
  assert.deepEqual(result.body, { error: "Unauthorized" });
});

test("AI can generate without an existing description using safe fallback", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try { const res = response(); await createListingAssistantSuggestion({ body: { title: "Piano", description: "", category: "Musical Instruments", condition: "Good" } }, res); assert.equal(res.statusCode, 200); assert.equal(res.body.suggestion.source, "fallback"); assert.match(res.body.suggestion.description, /pre-owned/i); }
  finally { if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey; }
});

test("AI image input is opt-in and uses Responses API image content", async () => {
  const previousKey = process.env.OPENAI_API_KEY; const previousFetch = globalThis.fetch; process.env.OPENAI_API_KEY = "test"; let request;
  globalThis.fetch = async (_url, options) => { request = JSON.parse(options.body); return { ok: true, status: 200, json: async () => ({ output_text: JSON.stringify({ title: "Piano", description: "Buyer-friendly piano description", category: "Musical Instruments", condition: "Good", tags: [], searchKeywords: [], qualityScore: 80, qualityIssues: [], riskWarnings: [], ownerChecklist: [], buyerTrustNotes: [] }) }) }; };
  try { const res = response(); await createListingAssistantSuggestion({ body: { category: "Musical Instruments", condition: "Good", images: ["https://example.com/piano.jpg"] } }, res); assert.equal(request.input[1].content[1].type, "input_image"); assert.equal(request.input[1].content[1].image_url, "https://example.com/piano.jpg"); assert.equal(res.body.suggestion.source, "openai"); }
  finally { globalThis.fetch = previousFetch; if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey; }
});

test("AI safely retries text-only when image analysis is unavailable", async () => {
  const previousKey = process.env.OPENAI_API_KEY; const previousFetch = globalThis.fetch; process.env.OPENAI_API_KEY = "test"; let calls = 0;
  globalThis.fetch = async () => { calls += 1; return { ok: false, status: 400, json: async () => ({ error: { type: "invalid_image" } }) }; };
  try { const res = response(); await createListingAssistantSuggestion({ body: { title: "Piano", images: ["https://example.com/piano.jpg"] } }, res); assert.equal(calls, 2); assert.equal(res.body.suggestion.source, "fallback"); assert.equal(res.body.usageCharged, false); assert.ok(res.body.suggestion.riskWarnings.some((warning) => /image analysis was unavailable/i.test(warning))); }
  finally { globalThis.fetch = previousFetch; if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey; }
});
