import assert from "node:assert/strict";
import test from "node:test";
import {
  addWatchlistItemWithinCapacity,
  assertBuyerResourceCapacity,
  buildBuyerEntitlements,
  createSavedSearchWithinCapacity,
} from "../src/services/buyerEntitlements.service.js";
import { runBuyerAtomicTransaction } from "../src/services/buyerAtomicTransaction.service.js";
import {
  listBuyerPlans,
  normalizeOptionalBuyerLimit,
} from "../src/config/buyerPlans.js";

function prismaWith({ subscription = null, savedSearches = 0, watchlistItems = 0 } = {}) {
  return {
    buyerSubscription: { findUnique: async () => subscription },
    savedSearch: { count: async () => savedSearches },
    watchlist: { count: async () => watchlistItems },
  };
}

test("buyer resource capacity rejects a Free buyer at the saved-search limit", async () => {
  await assert.rejects(
    assertBuyerResourceCapacity("buyer-1", "savedSearches", prismaWith({ savedSearches: 5 })),
    { statusCode: 409, code: "BUYER_PLAN_LIMIT_REACHED" },
  );
});

test("buyer resource capacity rejects a Plus buyer at the watchlist limit", async () => {
  await assert.rejects(
    assertBuyerResourceCapacity("buyer-1", "watchlistItems", prismaWith({
      subscription: { plan: "PLUS", status: "ACTIVE" },
      watchlistItems: 250,
    })),
    { statusCode: 409, code: "BUYER_PLAN_LIMIT_REACHED" },
  );
});

test("buyer resource capacity permits paid plans with unlimited resources", async () => {
  const entitlements = await assertBuyerResourceCapacity("buyer-1", "watchlistItems", prismaWith({
    subscription: { plan: "PREMIUM", status: "ACTIVE" },
    watchlistItems: 10_000,
  }));
  assert.equal(entitlements.usage.watchlistItems.unlimited, true);
});

test("optional buyer limits preserve omitted, null, blank, zero, and positive semantics", () => {
  assert.equal(normalizeOptionalBuyerLimit(undefined), null);
  assert.equal(normalizeOptionalBuyerLimit(null), null);
  assert.equal(normalizeOptionalBuyerLimit(""), null);
  assert.equal(normalizeOptionalBuyerLimit("   "), null);
  assert.equal(normalizeOptionalBuyerLimit(0), 0);
  assert.equal(normalizeOptionalBuyerLimit("0"), 0);
  assert.equal(normalizeOptionalBuyerLimit(25), 25);
  assert.equal(normalizeOptionalBuyerLimit("50"), 50);
  assert.equal(normalizeOptionalBuyerLimit("not-a-limit"), null);
  assert.equal(normalizeOptionalBuyerLimit(Number.POSITIVE_INFINITY), null);
});

test("omitted limits remain unlimited and never report usage over capacity", () => {
  const result = buildBuyerEntitlements({
    subscription: { plan: "FREE", status: "ACTIVE" },
    counts: { wishLists: 1, comparisons: 4, collectionItems: 7, aiRequests: 9 },
  });
  for (const resource of ["wishLists", "comparisons", "collectionItems", "aiRequests"]) {
    assert.equal(result.usage[resource].limit, null, resource);
    assert.equal(result.usage[resource].unlimited, true, resource);
    assert.equal(result.usage[resource].atLimit, false, resource);
    assert.equal(result.usage[resource].remaining, null, resource);
  }
  assert.equal(result.entitlements.wishListLimit, null);
  assert.equal(result.entitlements.favoriteLimit, null);
  assert.equal(result.entitlements.comparisonLimit, null);
  assert.equal(result.entitlements.collectionItemLimit, null);
  assert.equal(result.entitlements.aiShoppingMonthlyLimit, null);
});

test("all buyer plan responses retain configured limits and null optional limits", () => {
  const plans = listBuyerPlans();
  assert.deepEqual(plans.map((plan) => plan.code), ["FREE", "PLUS", "PREMIUM", "ULTRA"]);
  assert.deepEqual(plans.map((plan) => [plan.code, plan.maxSavedSearches, plan.maxWatchlistItems]), [
    ["FREE", 5, 25],
    ["PLUS", 50, 250],
    ["PREMIUM", null, null],
    ["ULTRA", null, null],
  ]);
  for (const plan of plans) {
    assert.equal(plan.wishListLimit, null, `${plan.code} wishListLimit`);
    assert.equal(plan.favoriteLimit, null, `${plan.code} favoriteLimit`);
    assert.equal(plan.comparisonLimit, null, `${plan.code} comparisonLimit`);
    assert.equal(plan.aiShoppingMonthlyLimit, null, `${plan.code} aiShoppingMonthlyLimit`);
    assert.equal(plan.collectionItemLimit, null, `${plan.code} collectionItemLimit`);
  }
});

test("terminal and non-usable Stripe statuses fall back to Free entitlements", () => {
  for (const status of ["UNKNOWN", "INCOMPLETE", "INCOMPLETE_EXPIRED", "CANCELED", "PAUSED"]) {
    const result = buildBuyerEntitlements({ subscription: { plan: "PLUS", status } });
    assert.equal(result.subscription.storedPlan, "PLUS", status);
    assert.equal(result.subscription.effectivePlan, "FREE", status);
    assert.equal(result.subscription.isPaid, false, status);
    assert.equal(result.usage.savedSearches.limit, 5, status);
  }
  for (const status of ["ACTIVE", "TRIALING", "PAST_DUE"]) {
    const result = buildBuyerEntitlements({ subscription: { plan: "PLUS", status } });
    assert.equal(result.subscription.effectivePlan, "PLUS", status);
    assert.equal(result.subscription.isPaid, true, status);
    assert.equal(result.usage.savedSearches.limit, 50, status);
  }
});

function concurrentResourceClient({ savedSearches = [], watchlistItems = [] } = {}) {
  const state = { savedSearches: [...savedSearches], watchlistItems: [...watchlistItems] };
  let transactionTail = Promise.resolve();
  const transaction = {
    $queryRaw: async () => [{ pg_advisory_xact_lock: null }],
    buyerSubscription: { findUnique: async () => null },
    savedSearch: {
      count: async () => state.savedSearches.length,
      create: async ({ data }) => {
        const row = { id: `search-${state.savedSearches.length + 1}`, ...data };
        state.savedSearches.push(row);
        return row;
      },
    },
    watchlist: {
      count: async () => state.watchlistItems.length,
      findUnique: async ({ where }) => state.watchlistItems.find((row) => row.userId === where.userId_itemId.userId && row.itemId === where.userId_itemId.itemId) || null,
      upsert: async ({ create }) => {
        const existing = state.watchlistItems.find((row) => row.userId === create.userId && row.itemId === create.itemId);
        if (existing) return existing;
        const row = { id: `watch-${state.watchlistItems.length + 1}`, ...create };
        state.watchlistItems.push(row);
        return row;
      },
    },
  };
  return {
    state,
    $transaction: async (operation) => {
      const previous = transactionTail;
      let release;
      transactionTail = new Promise((resolve) => { release = resolve; });
      await previous;
      try { return await operation(transaction); } finally { release(); }
    },
  };
}

test("concurrent saved-search requests at limit minus one allow exactly one creation", async () => {
  const prismaClient = concurrentResourceClient({
    savedSearches: Array.from({ length: 4 }, (_, index) => ({ id: `existing-${index}`, userId: "buyer-1" })),
  });
  const results = await Promise.allSettled([
    createSavedSearchWithinCapacity({ userId: "buyer-1", query: "camera", prismaClient }),
    createSavedSearchWithinCapacity({ userId: "buyer-1", query: "watch", prismaClient }),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), ["fulfilled", "rejected"]);
  assert.equal(results.find((result) => result.status === "rejected").reason.code, "BUYER_PLAN_LIMIT_REACHED");
  assert.equal(prismaClient.state.savedSearches.length, 5);
});

test("concurrent watchlist additions at limit minus one allow exactly one new item", async () => {
  const prismaClient = concurrentResourceClient({
    watchlistItems: Array.from({ length: 24 }, (_, index) => ({ id: `existing-${index}`, userId: "buyer-1", itemId: `item-${index}` })),
  });
  const results = await Promise.allSettled([
    addWatchlistItemWithinCapacity({ userId: "buyer-1", itemId: "new-a", prismaClient }),
    addWatchlistItemWithinCapacity({ userId: "buyer-1", itemId: "new-b", prismaClient }),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), ["fulfilled", "rejected"]);
  assert.equal(results.find((result) => result.status === "rejected").reason.code, "BUYER_PLAN_LIMIT_REACHED");
  assert.equal(prismaClient.state.watchlistItems.length, 25);
});

test("adding an existing watchlist item remains idempotent even at capacity", async () => {
  const existing = Array.from({ length: 25 }, (_, index) => ({ id: `existing-${index}`, userId: "buyer-1", itemId: `item-${index}` }));
  const prismaClient = concurrentResourceClient({ watchlistItems: existing });
  const row = await addWatchlistItemWithinCapacity({ userId: "buyer-1", itemId: "item-0", prismaClient });
  assert.equal(row.id, "existing-0");
  assert.equal(prismaClient.state.watchlistItems.length, 25);
});

test("buyer transactions retry serialization conflicts with a strict bound", async () => {
  let attempts = 0;
  const transaction = { $queryRaw: async () => [] };
  const prismaClient = {
    $transaction: async (operation) => {
      attempts += 1;
      if (attempts < 3) throw Object.assign(new Error("serialization conflict"), { code: "P2034" });
      return operation(transaction);
    },
  };
  const result = await runBuyerAtomicTransaction({
    prismaClient,
    lockKey: "buyer-resources:buyer-1",
    operation: async () => "created",
  });
  assert.equal(result, "created");
  assert.equal(attempts, 3);

  attempts = 0;
  await assert.rejects(
    runBuyerAtomicTransaction({
      prismaClient: { $transaction: async () => { attempts += 1; throw Object.assign(new Error("deadlock"), { cause: { code: "40P01" } }); } },
      lockKey: "buyer-resources:buyer-1",
      operation: async () => "never",
    }),
    /deadlock/,
  );
  assert.equal(attempts, 3);
});
