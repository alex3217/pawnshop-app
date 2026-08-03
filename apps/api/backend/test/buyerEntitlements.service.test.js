import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../src/lib/prisma.js";
import { BUYER_PLANS, BUYER_PLAN_CODES } from "../src/config/buyerPlans.js";
import {
  assertBuyerResourceCapacity,
  buildBuyerEntitlements,
  getBuyerEntitlementsForUser,
} from "../src/services/buyerEntitlements.service.js";
import { getMyBuyerPlanUsage, upsertMyBuyerSubscription } from "../src/controllers/buyerPlans.controller.js";
import { addSavedSearch, removeSavedSearch } from "../src/controllers/savedSearches.controller.js";
import { addToWatchlist } from "../src/controllers/watchlist.controller.js";

function response() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

function client({ plan = "FREE", status = "ACTIVE", savedSearches = 0, watchlistItems = 0 } = {}) {
  return {
    buyerSubscription: { findUnique: async ({ where }) => where.userId === "buyer-1" ? { id: "sub-1", userId: "buyer-1", plan, status } : null },
    savedSearch: { count: async ({ where }) => where.userId === "buyer-1" ? savedSearches : 0 },
    watchlist: { count: async ({ where }) => where.userId === "buyer-1" ? watchlistItems : 0 },
    buyerItemSubmission: { count: async () => 0 },
    marketplaceListing: { count: async () => 0 },
  };
}

test("display names preserve internal buyer plan and Stripe compatibility codes", () => {
  assert.equal(BUYER_PLANS[BUYER_PLAN_CODES.FREE].label, "Free");
  assert.equal(BUYER_PLANS[BUYER_PLAN_CODES.PLUS].label, "Plus");
  assert.equal(BUYER_PLANS[BUYER_PLAN_CODES.PREMIUM].label, "Premium");
  assert.equal(BUYER_PLANS[BUYER_PLAN_CODES.ULTRA].label, "Ultra");
  assert.deepEqual(Object.values(BUYER_PLAN_CODES), ["FREE", "PLUS", "PREMIUM", "ULTRA"]);
});

test("Free retains every core marketplace commerce capability", () => {
  const result = buildBuyerEntitlements();
  assert.equal(result.subscription.effectivePlan, "FREE");
  assert.equal(result.coreCommerce.browse, true);
  assert.equal(result.coreCommerce.shopSubmissions, true);
  assert.equal(result.coreCommerce.marketplaceSelling, true);
  assert.equal(result.entitlements.savedSearchLimit, 10);
});

test("unusable legacy paid subscription falls back to Free without rewriting stored code", () => {
  const result = buildBuyerEntitlements({ subscription: { plan: "PREMIUM", status: "CANCELED" } });
  assert.equal(result.subscription.storedPlan, "PREMIUM");
  assert.equal(result.subscription.effectivePlan, "FREE");
  assert.equal(result.subscription.displayName, "Free");
});

test("Plus and Premium preserve their implemented entitlement representation", () => {
  const pro = buildBuyerEntitlements({ subscription: { plan: "PLUS", status: "ACTIVE" } });
  assert.equal(pro.subscription.displayName, "Plus");
  assert.equal(pro.entitlements.savedSearchLimit, null);
  const plus = buildBuyerEntitlements({ subscription: { plan: "PREMIUM", status: "ACTIVE" } });
  assert.equal(plus.subscription.displayName, "Premium");
  assert.equal(plus.entitlements.collectionManagerEnabled, false);
  assert.equal(plus.implementation.collections, false);
});

test("Ultra represents concierge eligibility without claiming a workflow exists", () => {
  const result = buildBuyerEntitlements({ subscription: { plan: "ULTRA", status: "ACTIVE" } });
  assert.equal(result.entitlements.conciergeEnabled, false);
  assert.equal(result.implementation.conciergeWorkflow, false);
});

test("Free saved-search capacity produces a clear upgrade response", async () => {
  await assert.rejects(
    assertBuyerResourceCapacity("buyer-1", "savedSearches", client({ savedSearches: 10 })),
    (error) => error.statusCode === 409 && error.code === "BUYER_PLAN_LIMIT_REACHED" && error.details.upgradePath === "/buyer/subscription",
  );
});

test("usage resolution is scoped to the authenticated buyer id", async () => {
  const calls = [];
  const scoped = client({ plan: "PLUS", savedSearches: 3, watchlistItems: 4 });
  for (const model of [scoped.buyerSubscription, scoped.savedSearch, scoped.watchlist]) {
    const original = model.findUnique || model.count;
    const key = model.findUnique ? "findUnique" : "count";
    model[key] = async (input) => { calls.push(input.where.userId); return original(input); };
  }
  const result = await getBuyerEntitlementsForUser("buyer-1", scoped);
  assert.deepEqual(calls, ["buyer-1", "buyer-1", "buyer-1"]);
  assert.equal(result.usage.savedSearches.used, 3);
  assert.equal(result.usage.watchlistItems.used, 4);
});

test("buyer usage API returns only the authenticated user's usage", async () => {
  const originals = {
    subscription: prisma.buyerSubscription.findUnique,
    searches: prisma.savedSearch.count,
    watchlist: prisma.watchlist.count,
    submissions: prisma.buyerItemSubmission.count,
    listings: prisma.marketplaceListing.count,
    aiGenerations: prisma.aiListingGeneration.count,
  };
  prisma.buyerSubscription.findUnique = async ({ where }) => ({ userId: where.userId, plan: "FREE", status: "ACTIVE" });
  prisma.savedSearch.count = async ({ where }) => where.userId === "buyer-1" ? 2 : 99;
  prisma.watchlist.count = async ({ where }) => where.userId === "buyer-1" ? 1 : 99;
  prisma.buyerItemSubmission.count = async () => 0;
  prisma.marketplaceListing.count = async () => 0;
  prisma.aiListingGeneration.count = async () => 0;
  try {
    const res = response();
    await getMyBuyerPlanUsage({ user: { sub: "buyer-1", role: "CONSUMER" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.usage.savedSearches.used, 2);
    assert.equal(res.body.usage.watchlistItems.used, 1);
  } finally {
    prisma.buyerSubscription.findUnique = originals.subscription;
    prisma.savedSearch.count = originals.searches;
    prisma.watchlist.count = originals.watchlist;
    prisma.buyerItemSubmission.count = originals.submissions;
    prisma.marketplaceListing.count = originals.listings;
    prisma.aiListingGeneration.count = originals.aiGenerations;
  }
});

test("saved-search deletion cannot delete another buyer's record", async () => {
  const original = prisma.savedSearch.delete;
  let where;
  prisma.savedSearch.delete = async (input) => { where = input.where; throw Object.assign(new Error("not found"), { code: "P2025" }); };
  try {
    const res = response();
    await removeSavedSearch({ user: { sub: "buyer-1" }, params: { id: "search-owned-by-buyer-2" } }, res);
    assert.deepEqual(where, { id: "search-owned-by-buyer-2", userId: "buyer-1" });
    assert.equal(res.statusCode, 404);
  } finally { prisma.savedSearch.delete = original; }
});

test("saved-search controller enforces the Free limit on the backend", async () => {
  const originals = { subscription: prisma.buyerSubscription.findUnique, count: prisma.savedSearch.count, watchCount: prisma.watchlist.count, submissionCount: prisma.buyerItemSubmission.count, listingCount: prisma.marketplaceListing.count, aiCount: prisma.aiListingGeneration.count, create: prisma.savedSearch.create };
  let createCalled = false;
  prisma.buyerSubscription.findUnique = async () => null;
  prisma.savedSearch.count = async () => 10;
  prisma.watchlist.count = async () => 0;
  prisma.buyerItemSubmission.count = async () => 0;
  prisma.marketplaceListing.count = async () => 0;
  prisma.aiListingGeneration.count = async () => 0;
  prisma.savedSearch.create = async () => { createCalled = true; return {}; };
  try {
    const res = response();
    await addSavedSearch({ user: { sub: "buyer-1" }, body: { query: "vintage watch" } }, res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, "BUYER_PLAN_LIMIT_REACHED");
    assert.equal(createCalled, false);
  } finally {
    prisma.buyerSubscription.findUnique = originals.subscription;
    prisma.savedSearch.count = originals.count;
    prisma.watchlist.count = originals.watchCount;
    prisma.buyerItemSubmission.count = originals.submissionCount;
    prisma.marketplaceListing.count = originals.listingCount;
    prisma.aiListingGeneration.count = originals.aiCount;
    prisma.savedSearch.create = originals.create;
  }
});

test("watchlist controller enforces limits while preserving idempotent re-adds", async () => {
  const originals = { item: prisma.item.findUnique, existing: prisma.watchlist.findUnique, subscription: prisma.buyerSubscription.findUnique, searchCount: prisma.savedSearch.count, watchCount: prisma.watchlist.count, submissionCount: prisma.buyerItemSubmission.count, listingCount: prisma.marketplaceListing.count, aiCount: prisma.aiListingGeneration.count, upsert: prisma.watchlist.upsert };
  prisma.item.findUnique = async () => ({ id: "item-1", status: "AVAILABLE", isDeleted: false });
  prisma.buyerSubscription.findUnique = async () => null;
  prisma.savedSearch.count = async () => 0;
  prisma.watchlist.count = async () => 25;
  prisma.buyerItemSubmission.count = async () => 0;
  prisma.marketplaceListing.count = async () => 0;
  prisma.aiListingGeneration.count = async () => 0;
  prisma.watchlist.upsert = async () => ({ id: "watch-1", itemId: "item-1", userId: "buyer-1" });
  try {
    prisma.watchlist.findUnique = async () => null;
    const blocked = response();
    await addToWatchlist({ user: { sub: "buyer-1" }, body: { itemId: "item-1" } }, blocked);
    assert.equal(blocked.statusCode, 409);
    prisma.watchlist.findUnique = async () => ({ id: "watch-1" });
    const repeated = response();
    await addToWatchlist({ user: { sub: "buyer-1" }, body: { itemId: "item-1" } }, repeated);
    assert.equal(repeated.statusCode, 201);
  } finally {
    prisma.item.findUnique = originals.item;
    prisma.watchlist.findUnique = originals.existing;
    prisma.buyerSubscription.findUnique = originals.subscription;
    prisma.savedSearch.count = originals.searchCount;
    prisma.watchlist.count = originals.watchCount;
    prisma.buyerItemSubmission.count = originals.submissionCount;
    prisma.marketplaceListing.count = originals.listingCount;
    prisma.aiListingGeneration.count = originals.aiCount;
    prisma.watchlist.upsert = originals.upsert;
  }
});

test("buyer usage API rejects an unauthenticated request", async () => {
  const res = response();
  await getMyBuyerPlanUsage({ user: null }, res);
  assert.equal(res.statusCode, 401);
});

test("consumer cannot self-promote a buyer subscription plan", async () => {
  const res = response();
  await upsertMyBuyerSubscription({ user: { sub: "buyer-1", role: "CONSUMER" }, body: { planCode: "ULTRA", status: "ACTIVE", stripeSubscriptionId: "sub_untrusted" } }, res);
  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /verified billing or administrator workflow/i);
});
