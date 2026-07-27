import assert from "node:assert/strict";
import test from "node:test";

import {
  createShopFinanceBalanceController,
} from "../src/controllers/shopFinance.controller.js";

function buildResponse() {
  return {
    statusCode: 200,
    body: null,

    status(code) {
      this.statusCode = code;
      return this;
    },

    json(body) {
      this.body = body;
      return this;
    },
  };
}

function buildController({
  shop = null,
  balance = {
    sellerUserId: "owner_1",
    shopId: "shop_1",
    currency: "USD",
    availableCents: 4200,
  },
  databaseError = null,
} = {}) {
  const calls = {
    shopQuery: null,
    balanceInput: null,
    errors: [],
  };

  const prismaClient = {
    pawnShop: {
      async findFirst(input) {
        calls.shopQuery = input;
        if (databaseError) throw databaseError;
        return shop;
      },
    },
  };

  const controller = createShopFinanceBalanceController({
    prismaClient,
    async loadSellerBalance(input) {
      calls.balanceInput = input;
      return balance;
    },
    logger: {
      error(...args) {
        calls.errors.push(args);
      },
    },
  });

  return {
    controller,
    calls,
    prismaClient,
  };
}

test("rejects unauthenticated finance requests", async () => {
  const req = {
    params: {
      id: "shop_1",
    },
    user: null,
  };

  const res = buildResponse();

  const { controller, calls } = buildController();

  await controller(req, res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, {
    success: false,
    error: "Unauthorized",
  });
  assert.equal(calls.shopQuery, null);
});

test("rejects a missing shop id", async () => {
  const req = {
    params: {
      id: "",
    },
    user: {
      sub: "owner_1",
      role: "OWNER",
    },
  };

  const res = buildResponse();

  const { controller, calls } = buildController();

  await controller(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, {
    success: false,
    error: "Shop id is required",
  });
  assert.equal(calls.shopQuery, null);
});

test("returns 404 for missing or deleted shops", async () => {
  const { controller, calls } = buildController();
  const res = buildResponse();

  await controller({
    params: { id: " shop_1 " },
    user: { sub: "owner_1", role: "OWNER" },
  }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, {
    success: false,
    error: "Shop not found",
  });
  assert.deepEqual(calls.shopQuery, {
    where: {
      id: "shop_1",
      isDeleted: false,
    },
    select: {
      id: true,
      name: true,
      ownerId: true,
    },
  });
});

test("forbids an owner from reading another shop", async () => {
  const { controller, calls } = buildController({
    shop: {
      id: "shop_1",
      name: "Test Shop",
      ownerId: "owner_1",
    },
  });
  const res = buildResponse();

  await controller({
    params: { id: "shop_1" },
    user: { sub: "owner_2", role: "OWNER" },
  }, res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, {
    success: false,
    error: "Forbidden",
  });
  assert.equal(calls.balanceInput, null);
});

test("returns the current balance contract to the shop owner", async () => {
  const shop = {
    id: "shop_1",
    name: "Test Shop",
    ownerId: "owner_1",
  };
  const balance = {
    sellerUserId: "owner_1",
    shopId: "shop_1",
    currency: "USD",
    pendingCents: 0,
    availableCents: 4200,
    heldCents: 0,
    paidCents: 0,
    reversedCents: 0,
    totalCents: 4200,
    entryCount: 1,
  };
  const {
    controller,
    calls,
    prismaClient,
  } = buildController({ shop, balance });
  const res = buildResponse();

  await controller({
    params: { id: "shop_1" },
    user: { id: "owner_1", role: "SHOP_OWNER" },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    shop,
    balance,
  });
  assert.deepEqual(calls.balanceInput, {
    sellerUserId: "owner_1",
    shopId: "shop_1",
    currency: "USD",
    prismaClient,
  });
});

test("allows a platform administrator to read any shop", async () => {
  const { controller } = buildController({
    shop: {
      id: "shop_1",
      name: "Test Shop",
      ownerId: "owner_1",
    },
  });
  const res = buildResponse();

  await controller({
    params: { id: "shop_1" },
    user: {
      userId: "super_admin_1",
      role: "SUPER_ADMIN",
    },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
});

test("hides unexpected database errors behind the API contract", async () => {
  const { controller, calls } = buildController({
    databaseError: new Error("database details"),
  });
  const res = buildResponse();

  await controller({
    params: { id: "shop_1" },
    user: { sub: "owner_1", role: "OWNER" },
  }, res);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, {
    success: false,
    error: "Failed to load shop finance balance",
  });
  assert.equal(calls.errors.length, 1);
});
