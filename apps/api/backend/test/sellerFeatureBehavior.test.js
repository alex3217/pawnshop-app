import assert from "node:assert/strict";
import test from "node:test";

import { prisma } from "../src/lib/prisma.js";
import { createAuction } from "../src/controllers/auctions.controller.js";
import { createShop } from "../src/controllers/shops.controller.js";
import aiRouter from "../src/routes/ai.routes.js";

const PAWN_SHOP_COLUMNS = [
  "id", "name", "ownerId", "isDeleted", "subscriptionPlan",
  "subscriptionStatus", "subscriptionBillingInterval",
  "subscriptionCurrentPeriodEnd", "cancelAtPeriodEnd", "stripeCustomerId",
  "stripeSubscriptionId", "createdAt", "updatedAt",
];

const ITEM_COLUMNS = [
  "id", "pawnShopId", "title", "status", "isDeleted", "createdAt", "updatedAt",
];

const AUCTION_COLUMNS = [
  "id", "itemId", "shopId", "status", "startingPrice", "minIncrement",
  "startsAt", "endsAt", "antiSnipeWindowSec", "currentPrice", "createdAt", "updatedAt",
];

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function replace(target, key, replacement, restores) {
  const original = target[key];
  target[key] = replacement;
  restores.push(() => { target[key] = original; });
}

async function withPrismaMocks(run) {
  const restores = [];
  try {
    await run(restores);
  } finally {
    for (const restore of restores.reverse()) restore();
  }
}

function planShop(overrides = {}) {
  return {
    id: "shop_1",
    name: "Test Shop",
    ownerId: "owner_1",
    isDeleted: false,
    subscriptionPlan: "PRO",
    subscriptionStatus: "ACTIVE",
    subscriptionBillingInterval: "MONTH",
    subscriptionCurrentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    stripeCustomerId: null,
    stripeSubscriptionId: "sub_local",
    ...overrides,
  };
}

function mockCatalog(restores) {
  replace(prisma.platformPricingRule, "findMany", async () => [], restores);
}

function mockTransaction(restores) {
  replace(prisma, "$transaction", async (operations) => Promise.all(operations), restores);
}

function auctionRequest() {
  return {
    user: { sub: "owner_1", role: "OWNER" },
    body: {
      itemId: "item_1",
      shopId: "shop_1",
      startingPrice: 25,
      startsAt: "2030-01-01T00:00:00.000Z",
      endsAt: "2030-01-02T00:00:00.000Z",
    },
  };
}

async function runAuctionScenario(subscription, { ownerId = "owner_1" } = {}) {
  const calls = { create: 0, existing: 0 };
  const res = responseRecorder();

  await withPrismaMocks(async (restores) => {
    mockCatalog(restores);
    mockTransaction(restores);
    replace(prisma, "$queryRaw", async () => [
      ...PAWN_SHOP_COLUMNS, ...ITEM_COLUMNS, ...AUCTION_COLUMNS,
    ].map((column_name) => ({ column_name })), restores);
    replace(prisma.pawnShop, "findUnique", async () => planShop({ ownerId, ...subscription }), restores);
    replace(prisma.item, "count", async () => 0, restores);
    replace(prisma.item, "findUnique", async () => ({
      id: "item_1",
      pawnShopId: "shop_1",
      isDeleted: false,
      shop: planShop({ ownerId, ...subscription }),
    }), restores);
    replace(prisma.staff, "findFirst", async () => null, restores);
    replace(prisma.auction, "findFirst", async () => { calls.existing += 1; return null; }, restores);
    replace(prisma.auction, "create", async ({ data }) => {
      calls.create += 1;
      return { id: "auction_1", ...data };
    }, restores);

    await createAuction(auctionRequest(), res);
  });

  return { calls, res };
}

test("auction controller lets an owning ACTIVE paid shop reach auction creation", async () => {
  const { calls, res } = await runAuctionScenario({ subscriptionPlan: "PRO", subscriptionStatus: "ACTIVE" });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.id, "auction_1");
  assert.equal(calls.create, 1);
});

test("auction controller rejects FREE and unusable-paid shops before auction creation", async (t) => {
  for (const [name, subscription] of [
    ["Free", { subscriptionPlan: "FREE", subscriptionStatus: "ACTIVE" }],
    ["canceled paid", { subscriptionPlan: "PRO", subscriptionStatus: "CANCELED" }],
  ]) {
    await t.test(name, async () => {
      const { calls, res } = await runAuctionScenario(subscription);
      assert.equal(res.statusCode, 403);
      assert.match(res.body.error, /does not include auction creation/);
      assert.equal(calls.existing, 0);
      assert.equal(calls.create, 0);
    });
  }
});

test("auction controller preserves shop ownership checks before entitlement and create", async () => {
  const { calls, res } = await runAuctionScenario(
    { subscriptionPlan: "PRO", subscriptionStatus: "ACTIVE" },
    { ownerId: "another_owner" },
  );
  assert.equal(res.statusCode, 403);
  assert.match(res.body.error, /do not have access/);
  assert.equal(calls.existing, 0);
  assert.equal(calls.create, 0);
});

async function runLocationScenario(shops, role = "OWNER") {
  const calls = { create: 0 };
  const res = responseRecorder();
  await withPrismaMocks(async (restores) => {
    mockCatalog(restores);
    replace(prisma, "$queryRaw", async () => PAWN_SHOP_COLUMNS.map((column_name) => ({ column_name })), restores);
    replace(prisma.pawnShop, "findMany", async () => shops, restores);
    replace(prisma.pawnShop, "create", async ({ data }) => {
      calls.create += 1;
      return { id: "shop_new", ...data };
    }, restores);
    await createShop(
      { user: { sub: "owner_1", role }, body: { name: "New Location" } },
      res,
    );
  });
  return { calls, res };
}

test("shared owner location controller creates below limit and rejects at limit before write", async () => {
  const below = await runLocationScenario([]);
  assert.equal(below.res.statusCode, 201);
  assert.equal(below.calls.create, 1);

  const atLimit = await runLocationScenario([planShop({ subscriptionPlan: "FREE" })]);
  assert.equal(atLimit.res.statusCode, 403);
  assert.equal(atLimit.calls.create, 0);
  assert.match(atLimit.res.body.error, /allows 1 location/);
});

test("unusable paid state receives the Free location limit", async () => {
  const result = await runLocationScenario([
    planShop({ subscriptionPlan: "PREMIUM", subscriptionStatus: "CANCELED" }),
  ]);
  assert.equal(result.res.statusCode, 403);
  assert.equal(result.calls.create, 0);
  assert.match(result.res.body.error, /FREE allows 1 location/);
});

test("Super Admin location creation deliberately bypasses the owner limit", async () => {
  const result = await runLocationScenario([
    planShop(), planShop({ id: "shop_2" }), planShop({ id: "shop_3" }),
  ], "SUPER_ADMIN");
  assert.equal(result.res.statusCode, 201);
  assert.equal(result.calls.create, 1);
});

function aiEntitlementHandler() {
  const route = aiRouter.stack.find((layer) => layer.route?.path === "/listing-assistant");
  assert.ok(route, "AI listing-assistant route must exist");
  // auth, role, entitlement, controller
  assert.equal(route.route.stack.length, 4);
  return route.route.stack[2].handle;
}

async function invokeMiddleware(handler, req) {
  let nextCalls = 0;
  let error;
  await handler(req, responseRecorder(), (value) => {
    nextCalls += 1;
    error = value;
  });
  await new Promise((resolve) => setImmediate(resolve));
  return { nextCalls, error };
}

test("AI middleware lets an entitled owner with shop permission proceed", async () => {
  await withPrismaMocks(async (restores) => {
    mockCatalog(restores);
    mockTransaction(restores);
    replace(prisma.pawnShop, "findUnique", async () => planShop({ subscriptionPlan: "ULTRA" }), restores);
    replace(prisma.item, "count", async () => 0, restores);
    const result = await invokeMiddleware(aiEntitlementHandler(), {
      user: { sub: "owner_1", role: "OWNER" }, body: { pawnShopId: "shop_1" },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.nextCalls, 1);
  });
});

test("AI middleware rejects an owner without shop permission", async () => {
  let entitlementReads = 0;
  await withPrismaMocks(async (restores) => {
    mockCatalog(restores);
    mockTransaction(restores);
    replace(prisma.pawnShop, "findUnique", async () => planShop({ ownerId: "another_owner", subscriptionPlan: "PREMIUM" }), restores);
    replace(prisma.staff, "findFirst", async () => null, restores);
    replace(prisma.item, "count", async () => { entitlementReads += 1; return 0; }, restores);
    const result = await invokeMiddleware(aiEntitlementHandler(), {
      user: { sub: "owner_1", role: "OWNER" }, body: { pawnShopId: "shop_1" },
    });
    assert.equal(result.nextCalls, 1);
    assert.equal(result.error?.statusCode, 403);
    assert.equal(entitlementReads, 0);
  });
});

test("AI middleware rejects an owner on an ineligible plan", async () => {
  await withPrismaMocks(async (restores) => {
    mockCatalog(restores);
    mockTransaction(restores);
    replace(prisma.pawnShop, "findUnique", async () => planShop({ subscriptionPlan: "FREE" }), restores);
    replace(prisma.item, "count", async () => 0, restores);
    const result = await invokeMiddleware(aiEntitlementHandler(), {
      user: { sub: "owner_1", role: "OWNER" }, body: { pawnShopId: "shop_1" },
    });
    assert.equal(result.nextCalls, 1);
    assert.equal(result.error?.code, "PLAN_AI_LISTING_ASSISTANT_DISABLED");
  });
});

test("AI middleware deliberately bypasses shop and plan checks for Admin and Super Admin", async (t) => {
  for (const role of ["ADMIN", "SUPER_ADMIN"]) {
    await t.test(role, async () => {
      let reads = 0;
      await withPrismaMocks(async (restores) => {
        replace(prisma.pawnShop, "findUnique", async () => { reads += 1; return null; }, restores);
        const result = await invokeMiddleware(aiEntitlementHandler(), {
          user: { sub: `${role.toLowerCase()}_1`, role }, body: { pawnShopId: "shop_1" },
        });
        assert.equal(result.error, undefined);
        assert.equal(result.nextCalls, 1);
        assert.equal(reads, 0);
      });
    });
  }
});
