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
  "pawnloop-marketplace-reservation-tests-2026";

const TEST_DOMAIN =
  "@marketplace-reserve.integration.pawnloop.test";

let app;
let prisma;
let reserveMarketplacePurchase;

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

async function createUser(
  prefix,
  role = "CONSUMER",
) {
  return prisma.user.create({
    data: {
      name: `${prefix} ${role}`,
      email: testEmail(prefix),
      password: await bcrypt.hash(
        "MarketplaceReserve123!",
        4,
      ),
      role,
      isActive: true,
    },
  });
}

async function createShop(
  owner,
  prefix,
  subscriptionPlan = "FREE",
) {
  return prisma.pawnShop.create({
    data: {
      name: `${prefix} shop`,
      ownerId: owner.id,
      subscriptionPlan,
      subscriptionStatus: "ACTIVE",
      isDeleted: false,
    },
  });
}

async function createListing({
  seller,
  sellerShop = null,
  listingType = "CUSTOMER_TO_CUSTOMER",
  quantity = 1,
  price = "100.00",
}) {
  return prisma.marketplaceListing.create({
    data: {
      sellerUserId: seller.id,
      sellerShopId: sellerShop?.id || null,
      listingType,
      status: "ACTIVE",
      title: `${listingType} reservation item`,
      description:
        "Marketplace purchase reservation integration test",
      category: "Electronics",
      condition: "Good",
      price,
      currency: "USD",
      quantity,
      images: [],
      allowOffers: true,
      pickupAvailable: true,
      shippingAvailable: false,
      publishedAt: new Date(),
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

async function expectServiceError(
  operation,
  expectedStatus,
  expectedMessage,
) {
  await assert.rejects(
    operation,
    (error) => {
      assert.equal(
        error.statusCode,
        expectedStatus,
      );

      if (expectedMessage) {
        assert.match(
          String(error.message || ""),
          expectedMessage,
        );
      }

      return true;
    },
  );
}

before(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    APP_ENV: "test",
    APP_NAME:
      "pawnloop-marketplace-reserve-integration-test",
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

  const appModule =
    await import("../src/app.js");

  const prismaModule =
    await import("../src/lib/prisma.js");

  const serviceModule =
    await import(
      "../src/services/marketplaceTransaction.service.js"
    );

  app = appModule.createApp();
  prisma = prismaModule.prisma;
  reserveMarketplacePurchase =
    serviceModule.reserveMarketplacePurchase;

  assert.equal(
    typeof reserveMarketplacePurchase,
    "function",
  );

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
  "reserves available inventory and creates a pending transaction",
  async () => {
    const seller =
      await createUser("success-seller");

    const buyer =
      await createUser("success-buyer");

    const listing = await createListing({
      seller,
      quantity: 2,
      price: "125.00",
    });

    const transaction =
      await reserveMarketplacePurchase({
        listingId: listing.id,
        buyerUserId: buyer.id,
        quantity: 1,
      });

    assert.equal(
      transaction.listingId,
      listing.id,
    );

    assert.equal(
      transaction.buyerUserId,
      buyer.id,
    );

    assert.equal(
      transaction.sellerUserId,
      seller.id,
    );

    assert.equal(
      transaction.type,
      "DIRECT_PURCHASE",
    );

    assert.equal(
      transaction.status,
      "PENDING",
    );

    assert.equal(
      transaction.fulfillmentStatus,
      "PAYMENT_PENDING",
    );

    assert.equal(
      Number(transaction.subtotal),
      125,
    );

    assert.equal(
      Number(transaction.totalAmount),
      125,
    );

    assert.ok(
      Number(transaction.platformFee) >= 0,
    );

    assert.equal(
      Math.round(
        Number(transaction.platformFee) * 100,
      ),
      transaction.metadata.platformFeeCents,
    );

    assert.equal(
      transaction.metadata.source,
      "MARKETPLACE_PURCHASE_RESERVATION",
    );

    assert.equal(
      transaction.metadata.sellerPlanCode,
      "FREE",
    );

    assert.equal(
      transaction.metadata
        .revenueTransactionType,
      "MARKETPLACE",
    );

    assert.ok(
      transaction.metadata.pricingRuleSnapshot,
    );

    const updatedListing =
      await prisma.marketplaceListing.findUnique({
        where: {
          id: listing.id,
        },
      });

    assert.equal(updatedListing.quantity, 1);
    assert.equal(updatedListing.status, "ACTIVE");
  },
);

test(
  "blocks buyers from purchasing their own listing",
  async () => {
    const seller =
      await createUser("self-seller");

    const listing = await createListing({
      seller,
      quantity: 1,
    });

    await expectServiceError(
      reserveMarketplacePurchase({
        listingId: listing.id,
        buyerUserId: seller.id,
        quantity: 1,
      }),
      409,
      /cannot purchase your own/i,
    );

    const unchangedListing =
      await prisma.marketplaceListing.findUnique({
        where: {
          id: listing.id,
        },
      });

    const transactionCount =
      await prisma.marketplaceTransaction.count({
        where: {
          listingId: listing.id,
        },
      });

    assert.equal(unchangedListing.quantity, 1);
    assert.equal(unchangedListing.status, "ACTIVE");
    assert.equal(transactionCount, 0);
  },
);

test(
  "blocks a duplicate active transaction for the same buyer and listing",
  async () => {
    const seller =
      await createUser("duplicate-seller");

    const buyer =
      await createUser("duplicate-buyer");

    const listing = await createListing({
      seller,
      quantity: 3,
      price: "75.00",
    });

    await reserveMarketplacePurchase({
      listingId: listing.id,
      buyerUserId: buyer.id,
      quantity: 1,
    });

    await expectServiceError(
      reserveMarketplacePurchase({
        listingId: listing.id,
        buyerUserId: buyer.id,
        quantity: 1,
      }),
      409,
      /active transaction already exists/i,
    );

    const updatedListing =
      await prisma.marketplaceListing.findUnique({
        where: {
          id: listing.id,
        },
      });

    const transactionCount =
      await prisma.marketplaceTransaction.count({
        where: {
          listingId: listing.id,
          buyerUserId: buyer.id,
        },
      });

    assert.equal(updatedListing.quantity, 2);
    assert.equal(updatedListing.status, "ACTIVE");
    assert.equal(transactionCount, 1);
  },
);

test(
  "requires an owned buyer shop for dealer transfers",
  async () => {
    const sellerOwner =
      await createUser(
        "dealer-seller",
        "OWNER",
      );

    const buyerOwner =
      await createUser(
        "dealer-buyer",
        "OWNER",
      );

    const otherOwner =
      await createUser(
        "dealer-other",
        "OWNER",
      );

    const sellerShop = await createShop(
      sellerOwner,
      "dealer-seller",
      "FREE",
    );

    const buyerShop = await createShop(
      buyerOwner,
      "dealer-buyer",
      "FREE",
    );

    const otherShop = await createShop(
      otherOwner,
      "dealer-other",
      "FREE",
    );

    const listing = await createListing({
      seller: sellerOwner,
      sellerShop,
      listingType: "SHOP_TO_SHOP",
      quantity: 2,
      price: "400.00",
    });

    await expectServiceError(
      reserveMarketplacePurchase({
        listingId: listing.id,
        buyerUserId: buyerOwner.id,
        quantity: 1,
      }),
      400,
      /buyer shop is required/i,
    );

    await expectServiceError(
      reserveMarketplacePurchase({
        listingId: listing.id,
        buyerUserId: buyerOwner.id,
        buyerShopId: otherShop.id,
        quantity: 1,
      }),
      403,
      /forbidden/i,
    );

    const transaction =
      await reserveMarketplacePurchase({
        listingId: listing.id,
        buyerUserId: buyerOwner.id,
        buyerShopId: buyerShop.id,
        quantity: 1,
      });

    assert.equal(
      transaction.type,
      "DEALER_TRANSFER",
    );

    assert.equal(
      transaction.buyerShopId,
      buyerShop.id,
    );

    assert.equal(
      transaction.sellerShopId,
      sellerShop.id,
    );

    assert.equal(
      transaction.metadata
        .revenueTransactionType,
      "DEALER",
    );

    const updatedListing =
      await prisma.marketplaceListing.findUnique({
        where: {
          id: listing.id,
        },
      });

    assert.equal(updatedListing.quantity, 1);
    assert.equal(updatedListing.status, "ACTIVE");
  },
);

test(
  "allows only one buyer to reserve the final available unit",
  async () => {
    const seller =
      await createUser("concurrent-seller");

    const buyerOne =
      await createUser("concurrent-buyer-one");

    const buyerTwo =
      await createUser("concurrent-buyer-two");

    const listing = await createListing({
      seller,
      quantity: 1,
      price: "250.00",
    });

    const results = await Promise.allSettled([
      reserveMarketplacePurchase({
        listingId: listing.id,
        buyerUserId: buyerOne.id,
        quantity: 1,
      }),

      reserveMarketplacePurchase({
        listingId: listing.id,
        buyerUserId: buyerTwo.id,
        quantity: 1,
      }),
    ]);

    const fulfilled = results.filter(
      (result) =>
        result.status === "fulfilled",
    );

    const rejected = results.filter(
      (result) =>
        result.status === "rejected",
    );

    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);

    assert.equal(
      rejected[0].reason.statusCode,
      409,
    );

    const updatedListing =
      await prisma.marketplaceListing.findUnique({
        where: {
          id: listing.id,
        },
      });

    const transactions =
      await prisma.marketplaceTransaction.findMany({
        where: {
          listingId: listing.id,
        },
      });

    assert.equal(updatedListing.quantity, 0);
    assert.equal(updatedListing.status, "RESERVED");
    assert.equal(transactions.length, 1);

    assert.ok(
      [
        buyerOne.id,
        buyerTwo.id,
      ].includes(
        transactions[0].buyerUserId,
      ),
    );
  },
);

test(
  "reservation API requires authentication",
  async () => {
    const seller =
      await createUser("api-auth-seller");

    const listing = await createListing({
      seller,
      quantity: 1,
      price: "49.99",
    });

    const response = await request(app)
      .post(
        "/api/marketplace-transactions/reserve",
      )
      .send({
        listingId: listing.id,
        quantity: 1,
      });

    assert.equal(response.status, 401);
    assert.deepEqual(response.body, {
      error: "Unauthorized",
    });

    const unchangedListing =
      await prisma.marketplaceListing.findUnique({
        where: {
          id: listing.id,
        },
      });

    assert.equal(unchangedListing.quantity, 1);
    assert.equal(unchangedListing.status, "ACTIVE");
  },
);

test(
  "reservation API creates a pending marketplace purchase",
  async () => {
    const seller =
      await createUser("api-success-seller");

    const buyer =
      await createUser("api-success-buyer");

    const listing = await createListing({
      seller,
      quantity: 1,
      price: "89.99",
    });

    const response = await request(app)
      .post(
        "/api/marketplace-transactions/reserve",
      )
      .set(
        "Authorization",
        `Bearer ${tokenFor(buyer)}`,
      )
      .send({
        listingId: listing.id,
        quantity: 1,
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);

    const transaction =
      response.body.transaction;

    assert.equal(
      transaction.listingId,
      listing.id,
    );

    assert.equal(
      transaction.buyerUserId,
      buyer.id,
    );

    assert.equal(
      transaction.sellerUserId,
      seller.id,
    );

    assert.equal(
      transaction.status,
      "PENDING",
    );

    assert.equal(
      transaction.type,
      "DIRECT_PURCHASE",
    );

    assert.equal(
      Number(transaction.totalAmount),
      89.99,
    );

    const updatedListing =
      await prisma.marketplaceListing.findUnique({
        where: {
          id: listing.id,
        },
      });

    assert.equal(updatedListing.quantity, 0);
    assert.equal(updatedListing.status, "RESERVED");

    const purchases = await request(app)
      .get(
        "/api/marketplace-transactions/mine/purchases",
      )
      .set(
        "Authorization",
        `Bearer ${tokenFor(buyer)}`,
      );

    assert.equal(purchases.status, 200);

    assert.ok(
      purchases.body.rows.some(
        (row) => row.id === transaction.id,
      ),
    );
  },
);

test(
  "reservation API rejects an invalid quantity without changing inventory",
  async () => {
    const seller =
      await createUser("api-quantity-seller");

    const buyer =
      await createUser("api-quantity-buyer");

    const listing = await createListing({
      seller,
      quantity: 2,
      price: "60.00",
    });

    const response = await request(app)
      .post(
        "/api/marketplace-transactions/reserve",
      )
      .set(
        "Authorization",
        `Bearer ${tokenFor(buyer)}`,
      )
      .send({
        listingId: listing.id,
        quantity: 0,
      });

    assert.equal(response.status, 400);

    assert.match(
      String(response.body.error || ""),
      /quantity/i,
    );

    const unchangedListing =
      await prisma.marketplaceListing.findUnique({
        where: {
          id: listing.id,
        },
      });

    const transactionCount =
      await prisma.marketplaceTransaction.count({
        where: {
          listingId: listing.id,
        },
      });

    assert.equal(unchangedListing.quantity, 2);
    assert.equal(unchangedListing.status, "ACTIVE");
    assert.equal(transactionCount, 0);
  },
);

test(
  "reservation API blocks self-purchases without changing inventory",
  async () => {
    const seller =
      await createUser("api-self-seller");

    const listing = await createListing({
      seller,
      quantity: 1,
      price: "115.00",
    });

    const response = await request(app)
      .post(
        "/api/marketplace-transactions/reserve",
      )
      .set(
        "Authorization",
        `Bearer ${tokenFor(seller)}`,
      )
      .send({
        listingId: listing.id,
        quantity: 1,
      });

    assert.equal(response.status, 409);

    assert.match(
      String(response.body.error || ""),
      /cannot purchase your own/i,
    );

    const unchangedListing =
      await prisma.marketplaceListing.findUnique({
        where: {
          id: listing.id,
        },
      });

    const transactionCount =
      await prisma.marketplaceTransaction.count({
        where: {
          listingId: listing.id,
        },
      });

    assert.equal(unchangedListing.quantity, 1);
    assert.equal(unchangedListing.status, "ACTIVE");
    assert.equal(transactionCount, 0);
  },
);

test(
  "payment endpoint requires authentication",
  async () => {
    const response = await request(app)
      .post(
        "/api/marketplace-transactions/" +
        "missing-payment-transaction/payment-intent",
      )
      .send({});

    assert.equal(response.status, 401);

    assert.deepEqual(response.body, {
      error: "Unauthorized",
    });
  },
);

test(
  "payment endpoint returns a structured error for a missing transaction",
  async () => {
    const buyer =
      await createUser("payment-missing-buyer");

    const response = await request(app)
      .post(
        "/api/marketplace-transactions/" +
        "missing-payment-transaction/payment-intent",
      )
      .set(
        "Authorization",
        `Bearer ${tokenFor(buyer)}`,
      )
      .send({});

    assert.equal(response.status, 404);
    assert.equal(response.body.success, false);

    assert.equal(
      response.body.code,
      "MARKETPLACE_TRANSACTION_NOT_FOUND",
    );

    assert.match(
      String(response.body.error || ""),
      /not found/i,
    );
  },
);

test(
  "payment endpoint blocks users who are not the transaction buyer",
  async () => {
    const seller =
      await createUser("payment-forbidden-seller");

    const buyer =
      await createUser("payment-forbidden-buyer");

    const outsider =
      await createUser("payment-forbidden-outsider");

    const listing = await createListing({
      seller,
      quantity: 1,
      price: "135.00",
    });

    const transaction =
      await reserveMarketplacePurchase({
        listingId: listing.id,
        buyerUserId: buyer.id,
        quantity: 1,
      });

    const response = await request(app)
      .post(
        `/api/marketplace-transactions/${transaction.id}/payment-intent`,
      )
      .set(
        "Authorization",
        `Bearer ${tokenFor(outsider)}`,
      )
      .send({});

    assert.equal(response.status, 403);
    assert.equal(response.body.success, false);

    assert.equal(
      response.body.code,
      "MARKETPLACE_PAYMENT_FORBIDDEN",
    );

    const unchangedTransaction =
      await prisma.marketplaceTransaction.findUnique({
        where: {
          id: transaction.id,
        },
      });

    assert.equal(
      unchangedTransaction.status,
      "PENDING",
    );

    assert.equal(
      unchangedTransaction.paymentIntentId,
      null,
    );

    const unchangedListing =
      await prisma.marketplaceListing.findUnique({
        where: {
          id: listing.id,
        },
      });

    assert.equal(unchangedListing.quantity, 0);
    assert.equal(unchangedListing.status, "RESERVED");
  },
);

test(
  "payment endpoint blocks transactions that are already paid",
  async () => {
    const seller =
      await createUser("payment-paid-seller");

    const buyer =
      await createUser("payment-paid-buyer");

    const listing = await createListing({
      seller,
      quantity: 1,
      price: "210.00",
    });

    const transaction =
      await reserveMarketplacePurchase({
        listingId: listing.id,
        buyerUserId: buyer.id,
        quantity: 1,
      });

    await prisma.marketplaceTransaction.update({
      where: {
        id: transaction.id,
      },
      data: {
        status: "PAID",
      },
    });

    const response = await request(app)
      .post(
        `/api/marketplace-transactions/${transaction.id}/payment-intent`,
      )
      .set(
        "Authorization",
        `Bearer ${tokenFor(buyer)}`,
      )
      .send({});

    assert.equal(response.status, 409);
    assert.equal(response.body.success, false);

    assert.equal(
      response.body.code,
      "MARKETPLACE_TRANSACTION_ALREADY_PAID",
    );

    const unchangedTransaction =
      await prisma.marketplaceTransaction.findUnique({
        where: {
          id: transaction.id,
        },
      });

    assert.equal(
      unchangedTransaction.status,
      "PAID",
    );

    assert.equal(
      unchangedTransaction.paymentIntentId,
      null,
    );
  },
);

test(
  "cancellation endpoint requires authentication",
  async () => {
    const response = await request(app)
      .post(
        "/api/marketplace-transactions/" +
        "missing-cancellation-transaction/" +
        "cancel-reservation",
      )
      .send({
        reason: "BUYER_CANCELED",
      });

    assert.equal(response.status, 401);

    assert.deepEqual(response.body, {
      error: "Unauthorized",
    });
  },
);

test(
  "cancellation endpoint restores inventory and is idempotent",
  async () => {
    const seller =
      await createUser(
        "cancel-success-seller",
      );

    const buyer =
      await createUser(
        "cancel-success-buyer",
      );

    const listing =
      await createListing({
        seller,
        quantity: 3,
        price: "95.00",
      });

    const transaction =
      await reserveMarketplacePurchase({
        listingId: listing.id,
        buyerUserId: buyer.id,
        quantity: 2,
      });

    let storedListing =
      await prisma
        .marketplaceListing
        .findUnique({
          where: {
            id: listing.id,
          },
        });

    assert.equal(
      storedListing.quantity,
      1,
    );

    assert.equal(
      storedListing.status,
      "ACTIVE",
    );

    const firstResponse =
      await request(app)
        .post(
          `/api/marketplace-transactions/${transaction.id}/cancel-reservation`,
        )
        .set(
          "Authorization",
          `Bearer ${tokenFor(buyer)}`,
        )
        .send({
          reason:
            "BUYER_CHANGED_MIND",
        });

    assert.equal(
      firstResponse.status,
      200,
    );

    assert.equal(
      firstResponse.body.success,
      true,
    );

    assert.equal(
      firstResponse.body.idempotent,
      false,
    );

    assert.equal(
      firstResponse.body.transactionStatus,
      "CANCELED",
    );

    assert.equal(
      firstResponse.body.quantityRestored,
      2,
    );

    assert.equal(
      firstResponse.body.listingStatus,
      "ACTIVE",
    );

    let storedTransaction =
      await prisma
        .marketplaceTransaction
        .findUnique({
          where: {
            id: transaction.id,
          },
        });

    storedListing =
      await prisma
        .marketplaceListing
        .findUnique({
          where: {
            id: listing.id,
          },
        });

    assert.equal(
      storedTransaction.status,
      "CANCELED",
    );

    assert.equal(
      storedTransaction
        .fulfillmentStatus,
      "CANCELED",
    );

    assert.ok(
      storedTransaction.canceledAt,
    );

    assert.equal(
      storedTransaction
        .metadata
        .reservationRelease
        .reason,
      "BUYER_CHANGED_MIND",
    );

    assert.equal(
      storedTransaction
        .metadata
        .reservationRelease
        .restoredQuantity,
      2,
    );

    assert.equal(
      storedTransaction
        .metadata
        .reservationRelease
        .releasedByUserId,
      buyer.id,
    );

    assert.equal(
      storedListing.quantity,
      3,
    );

    assert.equal(
      storedListing.status,
      "ACTIVE",
    );

    const duplicateResponse =
      await request(app)
        .post(
          `/api/marketplace-transactions/${transaction.id}/cancel-reservation`,
        )
        .set(
          "Authorization",
          `Bearer ${tokenFor(buyer)}`,
        )
        .send({
          reason:
            "BUYER_CHANGED_MIND",
        });

    assert.equal(
      duplicateResponse.status,
      200,
    );

    assert.equal(
      duplicateResponse.body.success,
      true,
    );

    assert.equal(
      duplicateResponse.body.idempotent,
      true,
    );

    assert.equal(
      duplicateResponse.body.quantityRestored,
      0,
    );

    storedTransaction =
      await prisma
        .marketplaceTransaction
        .findUnique({
          where: {
            id: transaction.id,
          },
        });

    storedListing =
      await prisma
        .marketplaceListing
        .findUnique({
          where: {
            id: listing.id,
          },
        });

    assert.equal(
      storedTransaction.status,
      "CANCELED",
    );

    assert.equal(
      storedListing.quantity,
      3,
    );

    assert.equal(
      storedListing.status,
      "ACTIVE",
    );
  },
);

test(
  "cancellation endpoint blocks users who are not the buyer",
  async () => {
    const seller =
      await createUser(
        "cancel-forbidden-seller",
      );

    const buyer =
      await createUser(
        "cancel-forbidden-buyer",
      );

    const outsider =
      await createUser(
        "cancel-forbidden-outsider",
      );

    const listing =
      await createListing({
        seller,
        quantity: 1,
        price: "140.00",
      });

    const transaction =
      await reserveMarketplacePurchase({
        listingId: listing.id,
        buyerUserId: buyer.id,
        quantity: 1,
      });

    const response =
      await request(app)
        .post(
          `/api/marketplace-transactions/${transaction.id}/cancel-reservation`,
        )
        .set(
          "Authorization",
          `Bearer ${tokenFor(outsider)}`,
        )
        .send({
          reason: "BUYER_CANCELED",
        });

    assert.equal(
      response.status,
      403,
    );

    assert.equal(
      response.body.success,
      false,
    );

    assert.equal(
      response.body.code,
      "MARKETPLACE_RESERVATION_FORBIDDEN",
    );

    const storedTransaction =
      await prisma
        .marketplaceTransaction
        .findUnique({
          where: {
            id: transaction.id,
          },
        });

    const storedListing =
      await prisma
        .marketplaceListing
        .findUnique({
          where: {
            id: listing.id,
          },
        });

    assert.equal(
      storedTransaction.status,
      "PENDING",
    );

    assert.equal(
      storedTransaction.canceledAt,
      null,
    );

    assert.equal(
      storedListing.quantity,
      0,
    );

    assert.equal(
      storedListing.status,
      "RESERVED",
    );
  },
);

test(
  "cancellation endpoint blocks transactions that are already paid",
  async () => {
    const seller =
      await createUser(
        "cancel-paid-seller",
      );

    const buyer =
      await createUser(
        "cancel-paid-buyer",
      );

    const listing =
      await createListing({
        seller,
        quantity: 1,
        price: "225.00",
      });

    const transaction =
      await reserveMarketplacePurchase({
        listingId: listing.id,
        buyerUserId: buyer.id,
        quantity: 1,
      });

    await prisma
      .marketplaceTransaction
      .update({
        where: {
          id: transaction.id,
        },
        data: {
          status: "PAID",
        },
      });

    const response =
      await request(app)
        .post(
          `/api/marketplace-transactions/${transaction.id}/cancel-reservation`,
        )
        .set(
          "Authorization",
          `Bearer ${tokenFor(buyer)}`,
        )
        .send({
          reason: "BUYER_CANCELED",
        });

    assert.equal(
      response.status,
      409,
    );

    assert.equal(
      response.body.success,
      false,
    );

    assert.equal(
      response.body.code,
      "MARKETPLACE_TRANSACTION_ALREADY_FINALIZED",
    );

    const storedTransaction =
      await prisma
        .marketplaceTransaction
        .findUnique({
          where: {
            id: transaction.id,
          },
        });

    const storedListing =
      await prisma
        .marketplaceListing
        .findUnique({
          where: {
            id: listing.id,
          },
        });

    assert.equal(
      storedTransaction.status,
      "PAID",
    );

    assert.equal(
      storedTransaction.canceledAt,
      null,
    );

    assert.equal(
      storedListing.quantity,
      0,
    );

    assert.equal(
      storedListing.status,
      "RESERVED",
    );
  },
);
