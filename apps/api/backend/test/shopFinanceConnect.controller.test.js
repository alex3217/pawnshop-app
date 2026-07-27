import assert from "node:assert/strict";
import test from "node:test";

import {
  createShopFinanceConnectControllers,
} from "../src/controllers/shopFinanceConnect.controller.js";

function response() {
  return {
    statusCode: 200,
    body: null,
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
}

function setup({
  source = "SHOP_OWNER",
  enabled = true,
  shop = {
    id: "shop_1",
    ownerId: "owner_1",
    isDeleted: false,
    stripeConnectAccountId: null,
  },
  stripeError = null,
} = {}) {
  const calls = { ensure: 0, link: 0, errors: [] };
  const controllers = createShopFinanceConnectControllers({
    prismaClient: {
      pawnShop: {
        async findUnique() {
          return shop;
        },
      },
    },
    async resolveAccess({ user, shopId }) {
      if (!user) {
        const error = new Error("Unauthorized");
        error.statusCode = 401;
        throw error;
      }
      if (shopId === "deleted") {
        const error = new Error("Shop not found.");
        error.statusCode = 404;
        throw error;
      }
      return {
        authorized: source !== "NONE",
        source,
        shop,
      };
    },
    connectEnabled: () => enabled,
    async ensureAccount() {
      calls.ensure += 1;
      if (stripeError) throw stripeError;
      return {
        shop: {
          ...shop,
          stripeConnectAccountId: "acct_private",
        },
        created: true,
      };
    },
    async createOnboardingLink() {
      calls.link += 1;
      if (stripeError) throw stripeError;
      return {
        shop: {
          ...shop,
          stripeConnectAccountId: "acct_private",
        },
        url: "https://connect.stripe.com/setup/s/test",
        expiresAt: null,
      };
    },
    async refreshStatus() {
      if (stripeError) throw stripeError;
      return shop;
    },
    logger: {
      error(...args) {
        calls.errors.push(args);
      },
    },
  });
  return { controllers, calls };
}

const ownerRequest = {
  params: { id: "shop_1" },
  user: { sub: "owner_1", role: "OWNER" },
  body: {
    returnUrl: "https://app.example.com/owner/finance",
    refreshUrl: "https://app.example.com/owner/finance?refresh=1",
  },
};

test("disabled status is readable but Connect mutations return safe 503 responses", async () => {
  const { controllers, calls } = setup({ enabled: false });
  const statusRes = response();
  await controllers.getStatus(ownerRequest, statusRes);
  assert.equal(statusRes.statusCode, 200);
  assert.equal(statusRes.body.connect.state, "DISABLED");

  for (const controller of [
    controllers.createAccount,
    controllers.onboardingLink,
  ]) {
    const res = response();
    await controller(ownerRequest, res);
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, {
      success: false,
      error: "Stripe Connect is unavailable",
      code: "STRIPE_CONNECT_DISABLED",
    });
  }
  assert.equal(calls.ensure, 0);
  assert.equal(calls.link, 0);
});

test("rejects unauthenticated users, outsiders, and all staff sources", async () => {
  for (const requestCase of [
    { user: null, source: "SHOP_OWNER", status: 401 },
    { user: ownerRequest.user, source: "NONE", status: 403 },
    { user: ownerRequest.user, source: "STAFF", status: 403 },
  ]) {
    const { controllers } = setup({ source: requestCase.source });
    const res = response();
    await controllers.getStatus(
      { ...ownerRequest, user: requestCase.user },
      res,
    );
    assert.equal(res.statusCode, requestCase.status);
  }
});

test("returns 404 for deleted shops and allows platform administrators", async () => {
  const deleted = setup();
  const deletedRes = response();
  await deleted.controllers.getStatus(
    { ...ownerRequest, params: { id: "deleted" } },
    deletedRes,
  );
  assert.equal(deletedRes.statusCode, 404);

  for (const source of ["ADMIN", "SUPER_ADMIN"]) {
    const { controllers } = setup({ source });
    const res = response();
    await controllers.createAccount(ownerRequest, res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.success, true);
    assert.equal("stripeConnectAccountId" in res.body.connect, false);
  }
});

test("creates onboarding links with a minimal normalized response", async () => {
  const { controllers, calls } = setup();
  const res = response();
  await controllers.onboardingLink(ownerRequest, res);

  assert.equal(res.statusCode, 201);
  assert.equal(calls.link, 1);
  assert.deepEqual(res.body.onboarding, {
    url: "https://connect.stripe.com/setup/s/test",
    expiresAt: null,
  });
  assert.equal(res.body.connect.hasAccount, true);
});

test("Stripe failures are logged and hidden behind a safe 502 response", async () => {
  const { controllers, calls } = setup({
    stripeError: new Error("secret Stripe response"),
  });
  const res = response();
  await controllers.createAccount(ownerRequest, res);

  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.body, {
    success: false,
    error: "Stripe Connect is temporarily unavailable",
  });
  assert.equal(calls.errors.length, 1);
});
