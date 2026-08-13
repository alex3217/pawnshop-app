import assert from "node:assert/strict";
import test from "node:test";
import { AI_LISTING_LIMITS, MARKETPLACE_DESCRIPTION_SYSTEM_PROMPT, generateListingAssistantSuggestion, generateMarketplaceDescription, normalizeListingAssistantInput } from "../src/services/aiListingAssistant.service.js";
import { authorizeAiDescriptionRequest } from "../src/services/aiDescriptionAuthorization.service.js";
import { createAiRateLimit } from "../src/middleware/aiRateLimit.js";
import { readFile } from "node:fs/promises";
import jwt from "jsonwebtoken";
import request from "supertest";

const valid = { context: "MARKETPLACE_LISTING", title: "Cordless drill", description: "", category: "Tools", condition: "Used" };

test("validates required fields and length limits", () => {
  assert.throws(() => normalizeListingAssistantInput({ ...valid, title: "" }), /listing title or linked inventory details/);
  assert.throws(() => normalizeListingAssistantInput({ ...valid, title: "x".repeat(AI_LISTING_LIMITS.title + 1) }), /180 characters or fewer/);
  assert.throws(() => normalizeListingAssistantInput({ ...valid, attributes: Array(21).fill("fact") }), /at most 20/);
  assert.equal(normalizeListingAssistantInput(valid).title, "Cordless drill");
});

test("prompt contains hallucination-resistant marketplace rules", () => {
  for (const term of ["Never infer or invent", "brand", "model", "serial number", "authenticity", "warranty", "accessory", "defect", "shipping"]) {
    assert.match(MARKETPLACE_DESCRIPTION_SYSTEM_PROMPT, new RegExp(term, "i"));
  }
});

test("fails honestly when provider configuration is unavailable", async () => {
  await assert.rejects(generateMarketplaceDescription(valid, { env: {} }), (error) => error.statusCode === 503 && error.code === "AI_UNAVAILABLE");
});

test("returns provider output and sends only configured model and supplied facts", async () => {
  let request;
  const providerSuggestion = { title: "Cordless Drill", description: "A used cordless drill.", category: "Tools", condition: "Used", tags: ["drill"], searchKeywords: ["cordless drill"], qualityScore: 88, qualityIssues: [], riskWarnings: [], ownerChecklist: ["Verify condition"], buyerTrustNotes: ["Condition supplied"] };
  const suggestion = await generateListingAssistantSuggestion(valid, {
    env: { OPENAI_API_KEY: "test-key", OPENAI_LISTING_MODEL: "configured-model" },
    fetchImpl: async (_url, options) => {
      request = JSON.parse(options.body);
      return { ok: true, async json() { return { output_text: JSON.stringify(providerSuggestion) }; } };
    },
  });
  assert.equal(suggestion.description, "A used cordless drill.");
  assert.equal(suggestion.qualityScore, 88);
  assert.deepEqual(suggestion.tags, ["drill"]);
  assert.equal(request.model, "configured-model");
  assert.match(request.input[1].content, /Cordless drill/);
  assert.doesNotMatch(request.input[1].content, /test-key/);
});

test("maps provider failure and timeout to safe errors", async () => {
  await assert.rejects(generateMarketplaceDescription(valid, { env: { OPENAI_API_KEY: "x" }, fetchImpl: async () => ({ ok: false, status: 500, async json() { return {}; } }) }), (error) => error.statusCode === 503);
  await assert.rejects(generateMarketplaceDescription(valid, { env: { OPENAI_API_KEY: "x", AI_LISTING_TIMEOUT_MS: "1000" }, fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))) }), (error) => error.statusCode === 504);
});

test("per-user shared rate limiting rejects excess requests", async () => {
  let count = 0;
  const middleware = createAiRateLimit({ max: 2, windowMs: 60_000, store: { async increment() { count += 1; return { count, resetAt: 60_100 }; } }, now: () => 100 });
  const req = { user: { sub: "user-1" } };
  const responses = [];
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { responses.push({ code: this.code, body }); return this; } };
  let allowed = 0;
  await middleware(req, res, () => allowed++); await middleware(req, res, () => allowed++); await middleware(req, res, () => allowed++);
  assert.equal(allowed, 2);
  assert.equal(responses[0].code, 429);
});

test("authorization owns consumer records and checks managed shop resources", async () => {
  const prismaClient = {
    marketplaceListing: { async findUnique() { return { sellerUserId: "buyer-1", sellerShopId: null }; } },
    buyerItemSubmission: { async findUnique() { return { buyerId: "buyer-1", intent: "PAWN_OFFERS" }; } },
    item: { async findFirst() { return { id: "item-1" }; } },
  };
  const canonicalListingAccess = async ({ userId }) => {
    if (userId !== "buyer-1") throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
  };
  await authorizeAiDescriptionRequest({ user: { sub: "buyer-1", role: "CONSUMER" }, body: { context: "MARKETPLACE_LISTING", resourceId: "listing-1" }, prismaClient, assertMarketplaceListingAccess: canonicalListingAccess });
  await assert.rejects(authorizeAiDescriptionRequest({ user: { sub: "buyer-2", role: "CONSUMER" }, body: { context: "MARKETPLACE_LISTING", resourceId: "listing-1" }, prismaClient, assertMarketplaceListingAccess: canonicalListingAccess }), /Forbidden/);
  let permissionChecked = false;
  await authorizeAiDescriptionRequest({ user: { sub: "staff-1", role: "STAFF" }, body: { context: "INVENTORY_ITEM", pawnShopId: "shop-1", resourceId: "item-1" }, prismaClient, assertPermission: async () => { permissionChecked = true; }, assertEntitlement: async () => {} });
  assert.equal(permissionChecked, true);
});

test("consumer-owned listing AI access delegates positive and negative admin decisions to the canonical edit guard", async () => {
  const prismaClient = {
    marketplaceListing: { async findUnique() { return { sellerUserId: "buyer-1", sellerShopId: null }; } },
  };
  const calls = [];
  const canonicalAllow = async (input) => { calls.push(input); return { id: input.listingId }; };
  await authorizeAiDescriptionRequest({
    user: { sub: "admin-1", role: "ADMIN" },
    body: { context: "MARKETPLACE_LISTING", resourceId: "listing-1" },
    prismaClient,
    assertMarketplaceListingAccess: canonicalAllow,
  });
  assert.deepEqual(calls, [{ listingId: "listing-1", userId: "admin-1", role: "ADMIN" }]);

  const canonicalDeny = async () => { throw Object.assign(new Error("Forbidden"), { statusCode: 403 }); };
  await assert.rejects(authorizeAiDescriptionRequest({
    user: { sub: "admin-1", role: "ADMIN" },
    body: { context: "MARKETPLACE_LISTING", resourceId: "listing-1" },
    prismaClient,
    assertMarketplaceListingAccess: canonicalDeny,
  }), (error) => error.statusCode === 403);
});

test("authorization rejects cross-shop resources and validates auction and submission context", async () => {
  const prismaClient = {
    marketplaceListing: { async findUnique() { return { sellerUserId: "buyer-1", sellerShopId: "shop-1" }; } },
    buyerItemSubmission: { async findUnique() { return { buyerId: "buyer-1", intent: "PAWN_OFFERS" }; } },
    auction: { async findUnique() { return { item: { pawnShopId: "shop-1", isDeleted: false } }; } },
  };
  const allowShop = async () => {};
  const allowPlan = async () => {};
  await assert.rejects(authorizeAiDescriptionRequest({ user: { sub: "admin-1", role: "ADMIN" }, body: { context: "MARKETPLACE_LISTING", resourceId: "listing-1", pawnShopId: "shop-2" }, prismaClient, assertPermission: allowShop, assertEntitlement: allowPlan }), /cannot generate/);
  await authorizeAiDescriptionRequest({ user: { sub: "admin-1", role: "ADMIN" }, body: { context: "AUCTION", resourceId: "auction-1", pawnShopId: "shop-1" }, prismaClient, assertPermission: allowShop, assertEntitlement: allowPlan });
  await assert.rejects(authorizeAiDescriptionRequest({ user: { sub: "buyer-1", role: "CONSUMER" }, body: { context: "SELL_SUBMISSION", resourceId: "submission-1" }, prismaClient }), /cannot generate/);
  await assert.rejects(authorizeAiDescriptionRequest({ user: { sub: "buyer-2", role: "CONSUMER" }, body: { context: "PAWN_SUBMISSION", resourceId: "submission-1" }, prismaClient }), /cannot generate/);
});

test("production AI limiting requires the shared Redis-backed store", async () => {
  const middleware = createAiRateLimit({ env: { NODE_ENV: "production" } });
  const req = { user: { sub: "user-1" }, requestId: "request-1" };
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, setHeader() {} };
  let allowed = false;
  await middleware(req, res, () => { allowed = true; });
  assert.equal(allowed, false);
  assert.equal(res.code, 503);
  assert.equal(res.body.code, "AI_RATE_LIMIT_UNAVAILABLE");
});

test("AI endpoint requires authentication before rate limit, authorization, and generation", async () => {
  const source = await readFile(new URL("../src/routes/ai.routes.js", import.meta.url), "utf8");
  const route = source.slice(source.indexOf("router.post"));
  assert.ok(route.indexOf("authRequired") < route.indexOf("aiListingRateLimit"));
  assert.ok(route.indexOf("aiListingRateLimit") < route.indexOf("enforceAiDescriptionAuthorization"));
  assert.ok(route.indexOf("enforceAiDescriptionAuthorization") < route.indexOf("createListingAssistantSuggestion"));
});

test("authenticated consumer generation succeeds and unauthorized requests are rejected", async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "ai-description-test-secret";
  const [{ createApp }, { prisma }] = await Promise.all([import("../src/app.js"), import("../src/lib/prisma.js")]);
  prisma.user.findUnique = async ({ where }) => where.id === "buyer-ai-test" ? { id: where.id, email: "buyer-ai@test.invalid", role: "CONSUMER", isActive: true, authVersion: 0 } : null;
  const app = createApp({
    aiListingDependencies: {
      env: { OPENAI_API_KEY: "test-provider-key", OPENAI_LISTING_MODEL: "test-model" },
      fetchImpl: async () => ({ ok: true, async json() { return { output_text: JSON.stringify({ title: "Cordless drill", description: "A factual used drill description.", category: "Tools", condition: "Used", tags: ["drill"], searchKeywords: ["cordless drill"], qualityScore: 90, qualityIssues: [], riskWarnings: [], ownerChecklist: [], buyerTrustNotes: [] }) }; } }),
    },
  });
  await request(app).post("/api/ai/listing-assistant").send(valid).expect(401);
  const token = jwt.sign({ sub: "buyer-ai-test", role: "CONSUMER", email: "buyer-ai@test.invalid", authVersion: 0 }, process.env.JWT_SECRET);
  const response = await request(app).post("/api/ai/listing-assistant").set("Authorization", `Bearer ${token}`).send(valid).expect(200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.suggestion.description, "A factual used drill description.");
  assert.equal(response.body.data.qualityScore, 90);
});
