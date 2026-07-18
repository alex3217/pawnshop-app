import assert from "node:assert/strict";
import test from "node:test";

import {
  getShopFinanceBalance,
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

test("rejects unauthenticated finance requests", async () => {
  const req = {
    params: {
      id: "shop_1",
    },
    user: null,
  };

  const res = buildResponse();

  await getShopFinanceBalance(req, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error, "Unauthorized");
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

  await getShopFinanceBalance(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, "Shop id is required");
});
