import assert from "node:assert/strict";
import test, { before } from "node:test";

import jwt from "jsonwebtoken";
import request from "supertest";

const TEST_JWT_SECRET =
  "pawnloop-core-tests-only-secret-2026-not-for-production";

let app;
let createApp;
let prisma;

const AUTH_VERSION = 0;
const authenticatedUsers = new Map([
  [
    "consumer-core-test",
    {
      id: "consumer-core-test",
      email: "consumer@test.pawnloop.local",
      role: "CONSUMER",
      isActive: true,
      authVersion: AUTH_VERSION,
    },
  ],
  [
    "owner-auction-permission-test",
    {
      id: "owner-auction-permission-test",
      email: "owner-auction@test.pawnloop.local",
      role: "OWNER",
      isActive: true,
      authVersion: AUTH_VERSION,
    },
  ],
  [
    "owner-onboarding-test",
    {
      id: "owner-onboarding-test",
      email: "owner-onboarding@test.pawnloop.local",
      role: "OWNER",
      isActive: true,
      authVersion: AUTH_VERSION,
    },
  ],
  [
    "other-owner-onboarding-test",
    {
      id: "other-owner-onboarding-test",
      email: "other-owner-onboarding@test.pawnloop.local",
      role: "OWNER",
      isActive: true,
      authVersion: AUTH_VERSION,
    },
  ],
  [
    "admin-onboarding-test",
    {
      id: "admin-onboarding-test",
      email: "admin-onboarding@test.pawnloop.local",
      role: "ADMIN",
      isActive: true,
      authVersion: AUTH_VERSION,
    },
  ],
]);

before(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    APP_ENV: "test",
    APP_NAME: "pawnloop-api-test",
    APP_VERSION: "test-revision-0001",
    JWT_SECRET: TEST_JWT_SECRET,
    CORS_ORIGINS: "https://allowed.example",
    AUCTION_SCHEDULER_ENABLED: "false",
    JSON_LIMIT: "2mb",
  });

  const [prismaModule, appModule] = await Promise.all([
    import("../src/lib/prisma.js"),
    import("../src/app.js"),
  ]);

  prisma = prismaModule.prisma;

  prisma.user.findUnique = async ({ where }) =>
    authenticatedUsers.get(where.id) || null;

  createApp = appModule.createApp;
  app = createApp({
    readinessCheck: async () => true,
  });
});

function assertRequestId(value) {
  assert.equal(typeof value, "string");
  assert.ok(value.length > 0, "Expected a non-empty request ID");
}

test(
  "public auction visibility excludes soft-deleted item and shop records",
  async () => {
    const {
      buildPublicAuctionVisibilityWhere,
    } = await import(
      "../src/controllers/auctions.controller.js"
    );

    assert.deepEqual(
      buildPublicAuctionVisibilityWhere(),
      {
        item: {
          isDeleted: false,
          shop: {
            isDeleted: false,
          },
        },
        shop: {
          isDeleted: false,
        },
      },
    );
  },
);

for (const path of [
  "/health",
  "/api/health",
  "/ready",
  "/api/ready",
]) {
  test(`GET ${path} returns a healthy API contract`, async () => {
    const requestId = `test-${path.replaceAll("/", "-")}`;

    const response = await request(app)
      .get(path)
      .set("X-Request-Id", requestId)
      .expect(200);

    assert.equal(response.body.ok, true);
    assert.equal(response.body.success, true);
    assert.equal(response.body.service, "pawnloop-api-test");
    assert.equal(response.body.env, "test");
    assert.equal(response.body.revision, "test-revision-0001");

    assert.equal(
      Number.isNaN(Date.parse(response.body.ts)),
      false,
      "Expected a valid ISO timestamp",
    );

    assert.equal(response.body.pid, undefined);
    assert.equal(response.body.memory, undefined);
    assert.equal(Number.isInteger(response.body.uptimeSeconds), true);

    assert.equal(
      response.headers["cache-control"],
      "no-store",
    );

    assert.equal(
      response.headers["x-request-id"],
      requestId,
    );

    assert.equal(
      response.headers["x-powered-by"],
      undefined,
    );

    if (path.endsWith("/ready")) {
      assert.equal(response.body.ready, true);
      assert.deepEqual(response.body.dependencies, {
        database: "ok",
        storage: "ok",
        imageProcessing: "ok",
      });
    }
  });
}

test(
  "readiness endpoints return 503 when the database is unavailable",
  async () => {
    const unavailableApp = createApp({
      readinessCheck: async () => {
        throw new Error("Database unavailable");
      },
    });

    for (const path of ["/ready", "/api/ready"]) {
      const response = await request(unavailableApp)
        .get(path)
        .expect(503);

      assert.equal(response.body.ok, false);
      assert.equal(response.body.success, false);
      assert.equal(response.body.ready, false);
      assert.equal(response.body.error, "Service unavailable");
      assert.deepEqual(response.body.dependencies, {
        database: "unavailable",
        storage: "unavailable",
        imageProcessing: "unavailable",
      });

      assertRequestId(response.body.requestId);

      assert.equal(
        response.headers["cache-control"],
        "no-store",
      );
    }
  },
);

test("GET /api returns the API root contract", async () => {
  const response = await request(app)
    .get("/api")
    .expect(200);

  assert.equal(response.body.ok, true);
  assert.equal(response.body.success, true);
  assert.equal(response.body.service, "pawnloop-api-test");
  assert.equal(response.body.message, "API is running");
  assert.equal(response.body.env, "test");
});

test("unknown routes return the standardized 404 contract", async () => {
  const requestId = "unknown-route-contract-test";

  const response = await request(app)
    .get("/api/route-that-does-not-exist")
    .set("X-Request-Id", requestId)
    .expect(404);

  assert.deepEqual(response.body, {
    success: false,
    error:
      "Cannot GET /api/route-that-does-not-exist",
    requestId,
  });
});

test("malformed JSON returns 400 without reaching a controller", async () => {
  const requestId = "invalid-json-contract-test";

  const response = await request(app)
    .post("/api/auth/login")
    .set("X-Request-Id", requestId)
    .set("Content-Type", "application/json")
    .send('{"email":')
    .expect(400);

  assert.deepEqual(response.body, {
    success: false,
    error: "Invalid JSON payload",
    requestId,
  });
});

test("an allowed browser origin receives CORS headers", async () => {
  const response = await request(app)
    .get("/api/health")
    .set("Origin", "https://allowed.example")
    .expect(200);

  assert.equal(
    response.headers["access-control-allow-origin"],
    "https://allowed.example",
  );

  assert.equal(
    response.headers[
      "access-control-allow-credentials"
    ],
    "true",
  );
});

test("a trusted staging preview receives exact credentialed CORS headers", async () => {
  const previousAppEnv = process.env.APP_ENV;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.APP_ENV = "staging";
  process.env.NODE_ENV = "test";

  try {
    const stagingApp = createApp({
      readinessCheck: async () => true,
      authRateLimitStore: {},
    });
    const origin = "https://26d7e572.pawnloop-frontend.pages.dev";
    const response = await request(stagingApp)
      .get("/api/health")
      .set("Origin", origin)
      .expect(200);

    assert.equal(response.headers["access-control-allow-origin"], origin);
    assert.equal(response.headers["access-control-allow-credentials"], "true");
    assert.match(response.headers.vary || "", /(?:^|,\s*)Origin(?:,|$)/);
  } finally {
    process.env.APP_ENV = previousAppEnv;
    process.env.NODE_ENV = previousNodeEnv;
  }
});

test("buyer subscription checkout preflight allows the idempotency header", async () => {
  const response = await request(app)
    .options("/api/stripe/checkout/buyer-subscription")
    .set("Origin", "https://allowed.example")
    .set("Access-Control-Request-Method", "POST")
    .set(
      "Access-Control-Request-Headers",
      "authorization,content-type,idempotency-key",
    )
    .expect(204);

  assert.equal(
    response.headers["access-control-allow-origin"],
    "https://allowed.example",
  );
  assert.equal(
    response.headers["access-control-allow-credentials"],
    "true",
  );
  assert.match(
    response.headers["access-control-allow-methods"],
    /(?:^|,\s*)POST(?:,|$)/,
  );
  assert.match(
    response.headers["access-control-allow-headers"],
    /(?:^|,\s*)Idempotency-Key(?:,|$)/,
  );
});

test("an unapproved browser origin is rejected", async () => {
  const response = await request(app)
    .get("/api/health")
    .set("Origin", "https://blocked.example")
    .expect(403);

  assert.equal(response.body.success, false);
  assert.equal(
    response.body.error,
    "CORS blocked: https://blocked.example",
  );

  assertRequestId(response.body.requestId);
});

test("protected buyer routes reject missing tokens", async () => {
  for (const [method, path] of [
    ["get", "/api/watchlist/mine"],
    ["get", "/api/buyer-plans/mine/usage"],
    ["post", "/api/stripe/checkout/buyer-subscription"],
    ["post", "/api/stripe/billing-portal"],
    ["post", "/api/buyer-plans/mine/cancel-at-period-end"],
    ["post", "/api/buyer-plans/mine/resume"],
  ]) {
    const response = await request(app)[method](path).send({}).expect(401);
    assert.deepEqual(response.body, { error: "Unauthorized" }, `${method.toUpperCase()} ${path}`);
  }
});

test("protected routes reject invalid bearer tokens", async () => {
  const response = await request(app)
    .get("/api/watchlist/mine")
    .set("Authorization", "Bearer not-a-valid-token")
    .expect(401);

  assert.deepEqual(response.body, {
    error: "Invalid token",
  });
});

test("consumer tokens cannot access owner-only routes", async () => {
  const token = jwt.sign(
    {
      sub: "consumer-core-test",
      email: "consumer@test.pawnloop.local",
      role: "CONSUMER",
      authVersion: AUTH_VERSION,
    },
    TEST_JWT_SECRET,
    {
      expiresIn: "5m",
    },
  );

  const response = await request(app)
    .get("/api/shops/mine")
    .set("Authorization", `Bearer ${token}`)
    .expect(403);

  assert.deepEqual(response.body, {
    error: "Forbidden",
  });
});

test("Stripe refunds require ADMIN or SUPER_ADMIN and validate a reason", async () => {
  const tokenFor = (id) => {
    const user = authenticatedUsers.get(id);
    return jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
      authVersion: user.authVersion,
    }, TEST_JWT_SECRET, { expiresIn: "5m" });
  };

  await request(app)
    .post("/api/stripe/refunds")
    .set("Authorization", `Bearer ${tokenFor("owner-onboarding-test")}`)
    .set("Idempotency-Key", "owner-cannot-refund")
    .send({ marketplaceTransactionId: "transaction_1", amountCents: 100, reason: "Returned" })
    .expect(403);

  const response = await request(app)
    .post("/api/stripe/refunds")
    .set("Authorization", `Bearer ${tokenFor("admin-onboarding-test")}`)
    .set("Idempotency-Key", "admin-invalid-reason")
    .send({ marketplaceTransactionId: "transaction_1", amountCents: 100, reason: " " })
    .expect(400);

  assert.match(response.body.error, /reason is required/i);
});

test("PUT /api/shops/:id/onboarding/complete enforces the owner launch contract", async () => {
  const originalQueryRaw = prisma.$queryRaw;
  const originalFindFirst = prisma.pawnShop.findFirst;
  const originalUpdate = prisma.pawnShop.update;
  const originalItemCount = prisma.item.count;
  const originalStaffCount = prisma.staff.count;
  const originalOwnerApplicationFindUnique =
    prisma.ownerApplication.findUnique;

  const tokenFor = (id) => {
    const user = authenticatedUsers.get(id);
    return jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        authVersion: user.authVersion,
      },
      TEST_JWT_SECRET,
      { expiresIn: "5m" },
    );
  };

  const ownerToken = tokenFor("owner-onboarding-test");
  const otherOwnerToken = tokenFor("other-owner-onboarding-test");
  const adminToken = tokenFor("admin-onboarding-test");
  const consumerToken = tokenFor("consumer-core-test");
  const completedAt = new Date("2026-07-26T12:00:00.000Z");
  const shops = new Map([
    [
      "owner-shop",
      {
        id: "owner-shop",
        ownerId: "owner-onboarding-test",
        isDeleted: false,
        onboardingCompletedAt: null,
        name: "Owner Shop", address: "1 Main", phone: "555-0100", hours: "9-5", description: "Local pawn shop", subscriptionPlan: "FREE", subscriptionStartedAt: completedAt,
      },
    ],
    [
      "other-owner-shop",
      {
        id: "other-owner-shop",
        ownerId: "other-owner-onboarding-test",
        isDeleted: false,
        onboardingCompletedAt: null,
        name: "Other Shop", address: "2 Main", phone: "555-0200", hours: "9-5", description: "Local pawn shop", subscriptionPlan: "FREE", subscriptionStartedAt: completedAt,
      },
    ],
    [
      "deleted-shop",
      {
        id: "deleted-shop",
        ownerId: "owner-onboarding-test",
        isDeleted: true,
        onboardingCompletedAt: null,
        name: "Deleted", address: "3 Main", phone: "555-0300", hours: "9-5", description: "Deleted", subscriptionPlan: "FREE", subscriptionStartedAt: completedAt,
      },
    ],
    [
      "completed-shop",
      {
        id: "completed-shop",
        ownerId: "owner-onboarding-test",
        isDeleted: false,
        onboardingCompletedAt: completedAt,
        name: "Complete", address: "4 Main", phone: "555-0400", hours: "9-5", description: "Complete", subscriptionPlan: "FREE", subscriptionStartedAt: completedAt,
      },
    ],
  ]);
  let includeOnboardingColumn = false;
  const updateCalls = [];

  try {
    prisma.$queryRaw = async () => [
      "id",
      "ownerId",
      "isDeleted",
      "name", "address", "phone", "hours", "description", "subscriptionPlan", "subscriptionStartedAt",
      ...(includeOnboardingColumn ? ["onboardingCompletedAt"] : []),
    ].map((columnName) => ({ column_name: columnName }));

    prisma.pawnShop.findFirst = async ({ where, select }) => {
      assert.equal(select.id, true);
      assert.equal(select.ownerId, true);
      assert.equal(select.isDeleted, true);
      assert.equal(select.onboardingCompletedAt, true);
      assert.equal(where.isDeleted, false);

      const shop = shops.get(where.id);
      if (!shop || shop.isDeleted) return null;
      return shop;
    };

    prisma.pawnShop.update = async (argumentsObject) => {
      updateCalls.push(argumentsObject);
      const shop = shops.get(argumentsObject.where.id);
      const updated = {
        ...shop,
        onboardingCompletedAt: argumentsObject.data.onboardingCompletedAt,
      };
      shops.set(shop.id, updated);
      return {
        id: updated.id,
        onboardingCompletedAt: updated.onboardingCompletedAt,
      };
    };
    prisma.item.count = async () => 1;
    prisma.staff.count = async () => 1;

    prisma.ownerApplication.findUnique = async () => {
      const error = new Error(
        "The table `OwnerApplication` does not exist.",
      );
      error.code = "P2021";
      throw error;
    };

    await request(app)
      .put("/api/shops/owner-shop/onboarding/complete")
      .expect(401);

    await request(app)
      .put("/api/shops/owner-shop/onboarding/complete")
      .set("Authorization", `Bearer ${consumerToken}`)
      .expect(403);

    const unavailableResponse = await request(app)
      .put("/api/shops/owner-shop/onboarding/complete")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(503);

    assert.deepEqual(unavailableResponse.body, {
      error: "Service unavailable",
    });

    prisma.ownerApplication.findUnique = async () => ({
      status: "APPROVED",
    });
    includeOnboardingColumn = true;

    const progressResponse = await request(app)
      .get("/api/shops/owner-shop/onboarding/progress")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    assert.equal(progressResponse.body.completedCount, 9);
    assert.equal(progressResponse.body.totalCount, 9);
    assert.equal(progressResponse.body.readyToLaunch, true);
    assert.equal(progressResponse.body.launched, false);
    assert.equal(progressResponse.body.items.length, 9);

    const ownerResponse = await request(app)
      .put("/api/shops/owner-shop/onboarding/complete")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);

    assert.equal(ownerResponse.body.success, true);
    assert.equal(ownerResponse.body.shop.id, "owner-shop");
    assert.equal(
      Number.isNaN(Date.parse(ownerResponse.body.shop.onboardingCompletedAt)),
      false,
    );

    const hiddenResponse = await request(app)
      .put("/api/shops/other-owner-shop/onboarding/complete")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(404);
    assert.deepEqual(hiddenResponse.body, {
      success: false,
      error: "Shop not found",
    });

    for (const id of ["missing-shop", "deleted-shop"]) {
      const response = await request(app)
        .put(`/api/shops/${id}/onboarding/complete`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .expect(404);
      assert.deepEqual(response.body, {
        success: false,
        error: "Shop not found",
      });
    }

    const adminResponse = await request(app)
      .put("/api/shops/other-owner-shop/onboarding/complete")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(adminResponse.body.success, true);
    assert.equal(adminResponse.body.shop.id, "other-owner-shop");

    const repeatedResponse = await request(app)
      .put("/api/shops/completed-shop/onboarding/complete")
      .set("Authorization", `Bearer ${otherOwnerToken}`)
      .expect(404);
    assert.deepEqual(repeatedResponse.body, {
      success: false,
      error: "Shop not found",
    });

    const idempotentResponse = await request(app)
      .put("/api/shops/completed-shop/onboarding/complete")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    assert.equal(
      idempotentResponse.body.shop.onboardingCompletedAt,
      completedAt.toISOString(),
    );

    assert.equal(updateCalls.length, 2);
    for (const call of updateCalls) {
      assert.deepEqual(call.select, {
        id: true,
        onboardingCompletedAt: true,
      });
      assert.ok(call.data.onboardingCompletedAt instanceof Date);
    }
  } finally {
    prisma.$queryRaw = originalQueryRaw;
    prisma.pawnShop.findFirst = originalFindFirst;
    prisma.pawnShop.update = originalUpdate;
    prisma.item.count = originalItemCount;
    prisma.staff.count = originalStaffCount;
    prisma.ownerApplication.findUnique =
      originalOwnerApplicationFindUnique;
  }
});

test("admin routes reject unauthenticated requests", async () => {
  const response = await request(app)
    .get("/api/admin/users")
    .expect(401);

  assert.deepEqual(response.body, {
    error: "Unauthorized",
  });
});

test("super-admin routes reject unauthenticated requests", async () => {
  const response = await request(app)
    .get("/api/super-admin/overview")
    .expect(401);

  assert.deepEqual(response.body, {
    error: "Unauthorized",
  });
});


test("item-intake review routes require authentication", async () => {
  for (const path of [
    "/item-intakes",
    "/api/item-intakes",
  ]) {
    const response = await request(app)
      .get(path)
      .expect(401);

    assert.deepEqual(response.body, {
      error: "Unauthorized",
    });
  }
});

test("item-intake review mutation requires authentication", async () => {
  const response = await request(app)
    .patch("/api/item-intakes/test-intake/review")
    .send({
      status: "APPROVED",
    })
    .expect(401);

  assert.deepEqual(response.body, {
    error: "Unauthorized",
  });
});

test("item-intake archive mutation requires authentication", async () => {
  const response = await request(app)
    .post("/api/item-intakes/test-intake/archive")
    .send({
      reviewMessage: "Test archive",
    })
    .expect(401);

  assert.deepEqual(response.body, {
    error: "Unauthorized",
  });
});

test("item-intake publish mutation requires authentication", async () => {
  const response = await request(app)
    .post("/api/item-intakes/test-intake/publish")
    .expect(401);

  assert.deepEqual(response.body, {
    error: "Unauthorized",
  });
});

test("item-intake customer search requires authentication", async () => {
  const response = await request(app)
    .get("/api/item-intakes/customers/search?q=test")
    .expect(401);

  assert.deepEqual(response.body, {
    error: "Unauthorized",
  });
});

test("customer item scan requires authentication", async () => {
  const response =
    await request(app)
      .post(
        "/api/buyer/item-submissions/scan",
      )
      .send({
        code:
          "012345678905",

        destination:
          "CUSTOMER_MARKETPLACE",
      })
      .expect(401);

  assert.deepEqual(
    response.body,
    {
      error:
        "Unauthorized",
    },
  );
});

test("marketplace listing mutations require authentication", async () => {
  const requests = [
    request(app)
      .post("/api/marketplace-listings")
      .send({
        listingType: "CUSTOMER_TO_CUSTOMER",
        title: "Test listing",
        price: 100,
      }),
    request(app)
      .patch("/api/marketplace-listings/test-listing")
      .send({
        title: "Updated listing",
      }),
    request(app)
      .post("/api/marketplace-listings/test-listing/publish"),
    request(app)
      .post("/api/marketplace-listings/test-listing/pause"),
    request(app)
      .post("/api/marketplace-listings/test-listing/cancel"),
  ];

  for (const pendingRequest of requests) {
    const response = await pendingRequest.expect(401);

    assert.deepEqual(response.body, {
      error: "Unauthorized",
    });
  }
});

test("my marketplace listings require authentication", async () => {
  const response = await request(app)
    .get("/api/marketplace-listings/mine")
    .expect(401);

  assert.deepEqual(response.body, {
    error: "Unauthorized",
  });
});

test("marketplace transaction read routes require authentication", async () => {
  for (const path of [
    "/api/marketplace-transactions/mine/purchases",
    "/api/marketplace-transactions/mine/sales",
    "/api/marketplace-transactions/test-transaction",
  ]) {
    const response = await request(app)
      .get(path)
      .expect(401);

    assert.deepEqual(response.body, {
      error: "Unauthorized",
    });
  }
});


test("owner auction scope is limited to owned shops", async () => {
  const {
    buildOwnerAuctionScopeWhere,
  } = await import(
    "../src/controllers/auctions.controller.js"
  );

  assert.deepEqual(
    buildOwnerAuctionScopeWhere(
      "owner-permission-test",
      false,
    ),
    {
      item: {
        shop: {
          ownerId: "owner-permission-test",
        },
      },
    },
  );

  assert.deepEqual(
    buildOwnerAuctionScopeWhere(
      "admin-permission-test",
      true,
    ),
    {},
  );
});

test(
  "auction routes require authentication and preserve buyer-only bidding",
  async () => {
    const ownerToken = jwt.sign(
      {
        sub: "owner-auction-permission-test",
        email:
          "owner-auction@test.pawnloop.local",
        role: "OWNER",
        authVersion: AUTH_VERSION,
      },
      TEST_JWT_SECRET,
      {
        expiresIn: "5m",
      },
    );

    for (const target of [
      {
        method: "get",
        path: "/api/auctions/mine",
      },
      {
        method: "post",
        path: "/api/auctions",
      },
      {
        method: "post",
        path:
          "/api/auctions/test-auction/cancel",
      },
      {
        method: "post",
        path:
          "/api/auctions/test-auction/end",
      },
    ]) {
      let pending = request(app)[
        target.method
      ](target.path);

      if (target.method === "post") {
        pending = pending.send({});
      }

      const response =
        await pending.expect(401);

      assert.deepEqual(response.body, {
        error: "Unauthorized",
      });
    }

    for (const path of [
      "/api/auctions/test-auction/bids",
      "/api/auctions/test-auction/auto-bid",
    ]) {
      const response = await request(app)
        .post(path)
        .set(
          "Authorization",
          `Bearer ${ownerToken}`,
        )
        .send({
          amount: 100,
        })
        .expect(403);

      assert.deepEqual(response.body, {
        error: "Forbidden",
      });
    }
  },
);

test(
  "shop access capability route requires authentication",
  async () => {
    const response = await request(app)
      .get("/api/auth/shop-access")
      .expect(401);

    assert.deepEqual(
      response.body,
      {
        error: "Unauthorized",
      },
    );
  },
);


test("GET /api/items/:id/price-comparison returns local pricing intelligence", async () => {
  const originalQueryRaw = prisma.$queryRaw;
  const originalFindUnique = prisma.item.findUnique;
  const originalFindMany = prisma.item.findMany;

  const itemColumns = [
    "id",
    "pawnShopId",
    "title",
    "description",
    "price",
    "currency",
    "images",
    "category",
    "condition",
    "status",
    "createdAt",
    "updatedAt",
    "isDeleted",
  ];

  const pawnShopColumns = [
    "id",
    "name",
    "address",
    "city",
    "state",
    "zip",
    "latitude",
    "longitude",
    "phone",
    "description",
    "hours",
    "ownerId",
    "createdAt",
    "updatedAt",
    "isDeleted",
    "subscriptionBillingInterval",
  ];

  const now = new Date();

  const target = {
    id: "price-target",
    pawnShopId: "shop-target",
    title: "Sony PS5 Console",
    description: null,
    price: 400,
    currency: "USD",
    images: [],
    category: "Electronics",
    condition: "Good",
    status: "AVAILABLE",
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
    shop: {
      id: "shop-target",
      name: "Target Pawn",
      latitude: 41,
      longitude: -87,
      isDeleted: false,
    },
  };

  const candidate = ({
    id,
    shopId,
    price,
    latitude,
  }) => ({
    id,
    pawnShopId: shopId,
    title: "Sony PlayStation 5 Console",
    description: null,
    price,
    currency: "USD",
    images: [],
    category: "Electronics",
    condition: "Good",
    status: "AVAILABLE",
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
    shop: {
      id: shopId,
      name: `${shopId} Pawn`,
      latitude,
      longitude: -87,
      isDeleted: false,
    },
  });

  let capturedFindManyArguments;

  try {
    const invalidResponse = await request(app)
      .get(
        "/api/items/price-target/price-comparison"
          + "?radiusMiles=0",
      )
      .expect(400);

    assert.match(
      invalidResponse.body.error,
      /radiusMiles must be an integer between 1 and 100/,
    );

    prisma.$queryRaw = async (_strings, tableName) => {
      const fields =
        tableName === "PawnShop"
          ? pawnShopColumns
          : itemColumns;

      return fields.map((columnName) => ({
        column_name: columnName,
      }));
    };

    prisma.item.findUnique = async () => target;

    prisma.item.findMany = async (argumentsObject) => {
      capturedFindManyArguments = argumentsObject;

      return [
        candidate({
          id: "price-candidate-1",
          shopId: "shop-2",
          price: 450,
          latitude: 41.01,
        }),
        candidate({
          id: "price-candidate-2",
          shopId: "shop-3",
          price: 500,
          latitude: 41.02,
        }),
        candidate({
          id: "price-candidate-3",
          shopId: "shop-4",
          price: 550,
          latitude: 41.03,
        }),
      ];
    };

    const response = await request(app)
      .get(
        "/api/items/price-target/price-comparison"
          + "?radiusMiles=100"
          + "&freshnessDays=30"
          + "&perShopCap=3",
      )
      .expect(200);

    assert.equal(response.body.success, true);
    assert.equal(response.body.itemId, "price-target");
    assert.equal(response.body.radiusMiles, 100);
    assert.equal(response.body.freshnessDays, 30);
    assert.equal(response.body.perShopCap, 3);
    assert.equal(response.body.reason, null);

    assert.equal(response.body.comparison.sampleCount, 3);
    assert.equal(response.body.comparison.shopCount, 3);
    assert.equal(response.body.comparison.benchmark, 500);
    assert.equal(response.body.comparison.score, 90);
    assert.equal(
      response.body.comparison.comparables.length,
      3,
    );

    assert.equal(capturedFindManyArguments.take, 500);
    assert.equal(
      capturedFindManyArguments.where.status,
      "AVAILABLE",
    );
    assert.equal(
      capturedFindManyArguments.where.pawnShopId.not,
      "shop-target",
    );

    assert.equal(
      response.headers["cache-control"],
      "no-store",
    );

    assert.equal(
      Object.hasOwn(
        response.body.comparison.comparables[0],
        "shop",
      ),
      false,
    );

    prisma.item.findUnique = async () => null;

    const missingResponse = await request(app)
      .get(
        "/api/items/missing-item/price-comparison",
      )
      .expect(404);

    assert.equal(
      missingResponse.body.error,
      "Available item not found",
    );
  } finally {
    prisma.$queryRaw = originalQueryRaw;
    prisma.item.findUnique = originalFindUnique;
    prisma.item.findMany = originalFindMany;
  }
});
