import assert from "node:assert/strict";
import test, {
  after,
  before,
  beforeEach,
} from "node:test";

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";

const TEST_JWT_SECRET =
  "pawnloop-marketplace-read-tests-only-secret-2026";

const TEST_DOMAIN =
  "@marketplace-read.integration.pawnloop.test";

let app;
let prisma;

function testEmail(prefix) {
  return `${prefix}${TEST_DOMAIN}`;
}

function tokenFor(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      authVersion: user.authVersion,
    },
    TEST_JWT_SECRET,
    {
      expiresIn: "15m",
    },
  );
}

async function createUser(prefix, role = "CONSUMER") {
  return prisma.user.create({
    data: {
      name: `${prefix} ${role}`,
      email: testEmail(prefix),
      password: await bcrypt.hash(
        "MarketplaceRead123!",
        12,
      ),
      role,
      isActive: true,
    },
  });
}

async function cleanupTestRecords() {
  const users = await prisma.user.findMany({
    where: {
      email: {
        endsWith: TEST_DOMAIN,
      },
    },
    select: {
      id: true,
    },
  });

  const userIds = users.map((user) => user.id);

  if (userIds.length === 0) {
    return;
  }

  await prisma.marketplaceTransaction.deleteMany({
    where: {
      OR: [
        {
          buyerUserId: {
            in: userIds,
          },
        },
        {
          sellerUserId: {
            in: userIds,
          },
        },
      ],
    },
  });

  await prisma.marketplaceListing.deleteMany({
    where: {
      sellerUserId: {
        in: userIds,
      },
    },
  });

  await prisma.pawnShop.deleteMany({
    where: {
      ownerId: {
        in: userIds,
      },
    },
  });

  await prisma.user.deleteMany({
    where: {
      id: {
        in: userIds,
      },
    },
  });
}

async function createListing(seller) {
  return prisma.marketplaceListing.create({
    data: {
      sellerUserId: seller.id,
      listingType: "CUSTOMER_TO_CUSTOMER",
      status: "ACTIVE",
      title: "Read API integration item",
      description:
        "Marketplace transaction read test listing",
      category: "Electronics",
      condition: "Good",
      price: "125.00",
      currency: "USD",
      quantity: 3,
      images: [],
      allowOffers: true,
      pickupAvailable: true,
      shippingAvailable: false,
    },
  });
}

async function createTransaction({
  listing,
  buyer,
  seller,
  status = "PENDING",
  totalAmount = "125.00",
}) {
  return prisma.marketplaceTransaction.create({
    data: {
      listingId: listing.id,
      buyerUserId: buyer.id,
      sellerUserId: seller.id,
      type: "DIRECT_PURCHASE",
      status,
      quantity: 1,
      subtotal: totalAmount,
      platformFee: "0.00",
      shippingFee: "0.00",
      taxAmount: "0.00",
      totalAmount,
      currency: "USD",
      fulfillmentStatus: "PAYMENT_PENDING",
    },
  });
}

before(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    APP_ENV: "test",
    APP_NAME:
      "pawnloop-marketplace-read-integration-test",
    JWT_SECRET: TEST_JWT_SECRET,
    AUCTION_SCHEDULER_ENABLED: "false",
  });

  const rawDatabaseUrl = String(
    process.env.DATABASE_URL || "",
  );

  assert.ok(
    rawDatabaseUrl,
    "DATABASE_URL is required",
  );

  const databaseName = decodeURIComponent(
    new URL(rawDatabaseUrl).pathname.replace(
      /^\/+/,
      "",
    ),
  );

  assert.equal(
    databaseName,
    "pawnshop_test",
    "Integration tests may only use pawnshop_test",
  );

  const appModule = await import("../src/app.js");
  const prismaModule =
    await import("../src/lib/prisma.js");

  app = appModule.createApp();
  prisma = prismaModule.prisma;

  await cleanupTestRecords();
});

beforeEach(async () => {
  await cleanupTestRecords();
});

after(async () => {
  if (!prisma) {
    return;
  }

  await cleanupTestRecords();
  await prisma.$disconnect();
});

test(
  "buyers and sellers see only their transaction records",
  async () => {
    const seller = await createUser("list-seller");
    const buyer = await createUser("list-buyer");
    const otherBuyer =
      await createUser("list-other-buyer");

    const listing = await createListing(seller);

    const buyerTransaction =
      await createTransaction({
        listing,
        buyer,
        seller,
        status: "PAID",
      });

    const otherTransaction =
      await createTransaction({
        listing,
        buyer: otherBuyer,
        seller,
        status: "PENDING",
      });

    const purchases = await request(app)
      .get(
        "/api/marketplace-transactions/mine/purchases",
      )
      .set(
        "Authorization",
        `Bearer ${tokenFor(buyer)}`,
      );

    assert.equal(purchases.status, 200);
    assert.equal(purchases.body.success, true);
    assert.equal(purchases.body.rows.length, 1);
    assert.equal(
      purchases.body.rows[0].id,
      buyerTransaction.id,
    );
    assert.equal(
      purchases.body.pagination.total,
      1,
    );

    const filteredPurchases = await request(app)
      .get(
        "/api/marketplace-transactions/mine/purchases" +
          "?status=PAID&type=DIRECT_PURCHASE",
      )
      .set(
        "Authorization",
        `Bearer ${tokenFor(buyer)}`,
      );

    assert.equal(filteredPurchases.status, 200);
    assert.equal(
      filteredPurchases.body.rows.length,
      1,
    );
    assert.equal(
      filteredPurchases.body.rows[0].id,
      buyerTransaction.id,
    );

    const sales = await request(app)
      .get(
        "/api/marketplace-transactions/mine/sales",
      )
      .set(
        "Authorization",
        `Bearer ${tokenFor(seller)}`,
      );

    assert.equal(sales.status, 200);
    assert.equal(sales.body.success, true);
    assert.equal(sales.body.rows.length, 2);

    assert.deepEqual(
      new Set(
        sales.body.rows.map(
          (transaction) => transaction.id,
        ),
      ),
      new Set([
        buyerTransaction.id,
        otherTransaction.id,
      ]),
    );
  },
);

test(
  "transaction detail enforces participant and admin access",
  async () => {
    const seller = await createUser("detail-seller");
    const buyer = await createUser("detail-buyer");
    const outsider =
      await createUser("detail-outsider");
    const admin =
      await createUser("detail-admin", "ADMIN");

    const listing = await createListing(seller);

    const transaction = await createTransaction({
      listing,
      buyer,
      seller,
      status: "PAID",
    });

    for (const allowedUser of [
      buyer,
      seller,
      admin,
    ]) {
      const response = await request(app)
        .get(
          `/api/marketplace-transactions/${transaction.id}`,
        )
        .set(
          "Authorization",
          `Bearer ${tokenFor(allowedUser)}`,
        );

      assert.equal(response.status, 200);
      assert.equal(response.body.success, true);
      assert.equal(
        response.body.transaction.id,
        transaction.id,
      );
      assert.equal(
        response.body.transaction.listing.id,
        listing.id,
      );
    }

    const forbidden = await request(app)
      .get(
        `/api/marketplace-transactions/${transaction.id}`,
      )
      .set(
        "Authorization",
        `Bearer ${tokenFor(outsider)}`,
      );

    assert.equal(forbidden.status, 403);
    assert.deepEqual(forbidden.body, {
      success: false,
      error: "Forbidden",
    });

    const missing = await request(app)
      .get(
        "/api/marketplace-transactions/" +
          "missing-marketplace-transaction",
      )
      .set(
        "Authorization",
        `Bearer ${tokenFor(buyer)}`,
      );

    assert.equal(missing.status, 404);
    assert.deepEqual(missing.body, {
      success: false,
      error: "Marketplace transaction not found",
    });
  },
);

test(
  "transaction list routes reject invalid filters",
  async () => {
    const buyer = await createUser("filter-buyer");

    const invalidStatus = await request(app)
      .get(
        "/api/marketplace-transactions/mine/purchases" +
          "?status=NOT_A_STATUS",
      )
      .set(
        "Authorization",
        `Bearer ${tokenFor(buyer)}`,
      );

    assert.equal(invalidStatus.status, 400);
    assert.deepEqual(invalidStatus.body, {
      success: false,
      error:
        "Invalid marketplace transaction status",
    });

    const invalidType = await request(app)
      .get(
        "/api/marketplace-transactions/mine/purchases" +
          "?type=NOT_A_TYPE",
      )
      .set(
        "Authorization",
        `Bearer ${tokenFor(buyer)}`,
      );

    assert.equal(invalidType.status, 400);
    assert.deepEqual(invalidType.body, {
      success: false,
      error:
        "Invalid marketplace transaction type",
    });
  },
);
