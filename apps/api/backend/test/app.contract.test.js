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
]);

before(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    APP_ENV: "test",
    APP_NAME: "pawnloop-api-test",
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

    assert.equal(
      Number.isNaN(Date.parse(response.body.ts)),
      false,
      "Expected a valid ISO timestamp",
    );

    assert.equal(
      Number.isInteger(response.body.uptimeSeconds),
      true,
    );

    assert.equal(
      typeof response.body.memory,
      "object",
    );

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
  const response = await request(app)
    .get("/api/watchlist/mine")
    .expect(401);

  assert.deepEqual(response.body, {
    error: "Unauthorized",
  });
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
