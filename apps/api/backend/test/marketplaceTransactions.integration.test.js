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
  "pawnloop-marketplace-transactions-tests-only-secret-2026";

const TEST_DOMAIN = "@marketplace-transactions.integration.pawnloop.test";

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

async function createUser(prefix, role) {
  const user = await prisma.user.create({
    data: {
      name: `${prefix} ${role}`,
      email: testEmail(prefix),
      password: await bcrypt.hash("Marketplace123!", 12),
      role,
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });

  if (role === "OWNER") {
    await prisma.ownerApplication.upsert({
      where: {
        ownerId: user.id,
      },
      update: {
        status: "APPROVED",
      },
      create: {
        ownerId: user.id,
        status: "APPROVED",
        businessEmail: user.email,
      },
    });
  }

  return user;
}

async function cleanup() {
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

  if (userIds.length === 0) return;

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

before(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    APP_ENV: "test",
    APP_NAME: "pawnloop-marketplace-transactions-test",
    JWT_SECRET: TEST_JWT_SECRET,
    AUCTION_SCHEDULER_ENABLED: "false",
  });

  const rawDatabaseUrl = String(process.env.DATABASE_URL || "");

  assert.ok(rawDatabaseUrl, "DATABASE_URL is required");

  const databaseName = decodeURIComponent(
    new URL(rawDatabaseUrl).pathname.replace(/^\/+/, ""),
  );

  assert.equal(
    databaseName,
    "pawnshop_test",
    "Integration tests may only use pawnshop_test",
  );

  const appModule = await import("../src/app.js");
  const prismaModule = await import("../src/lib/prisma.js");

  app = appModule.createApp();
  prisma = prismaModule.prisma;

  await cleanup();
});

beforeEach(async () => {
  await cleanup();
});

after(async () => {
  if (!prisma) return;
  await cleanup();
  await prisma.$disconnect();
});

test("direct purchase reserves inventory and cancellation restores it", async () => {
  const seller = await createUser("direct-seller", "CONSUMER");
  const buyer = await createUser("direct-buyer", "CONSUMER");
  const outsider = await createUser("direct-outsider", "CONSUMER");

  const listing = await prisma.marketplaceListing.create({
    data: {
      sellerUserId: seller.id,
      listingType: "SHOP_TO_CUSTOMER",
      status: "ACTIVE",
      title: "Integration marketplace item",
      description: "Direct purchase integration test",
      price: "125.00",
      currency: "USD",
      quantity: 1,
      images: [],
      allowOffers: true,
      pickupAvailable: true,
      shippingAvailable: false,
    },
  });

  const created = await request(app)
    .post("/api/marketplace-transactions/reserve")
    .set("Authorization", `Bearer ${tokenFor(buyer)}`)
    .send({
      listingId: listing.id,
      quantity: 1,
      fulfillmentMethod: "PICKUP",
      buyerNote: "Integration purchase",
    });

  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.success, true);
  assert.equal(created.body.transaction.type, "DIRECT_PURCHASE");
  assert.equal(created.body.transaction.status, "PENDING");
  assert.equal(created.body.transaction.fulfillmentStatus, "PAYMENT_PENDING");
  assert.equal(created.body.transaction.buyerUserId, buyer.id);
  assert.equal(created.body.transaction.sellerUserId, seller.id);
  assert.equal(Number(created.body.transaction.subtotal), 125);
  assert.equal(Number(created.body.transaction.totalAmount), 125);

  const reservedListing = await prisma.marketplaceListing.findUnique({
    where: {
      id: listing.id,
    },
  });

  assert.equal(reservedListing.status, "RESERVED");
  assert.equal(reservedListing.quantity, 0);

  const purchases = await request(app)
    .get("/api/marketplace-transactions/mine/purchases")
    .set("Authorization", `Bearer ${tokenFor(buyer)}`);

  assert.equal(purchases.status, 200);
  assert.equal(purchases.body.rows.length, 1);
  assert.equal(
    purchases.body.rows[0].id,
    created.body.transaction.id,
  );

  const sales = await request(app)
    .get("/api/marketplace-transactions/mine/sales")
    .set("Authorization", `Bearer ${tokenFor(seller)}`);

  assert.equal(sales.status, 200);
  assert.equal(sales.body.rows.length, 1);

  const denied = await request(app)
    .get(`/api/marketplace-transactions/${created.body.transaction.id}`)
    .set("Authorization", `Bearer ${tokenFor(outsider)}`);

  assert.equal(denied.status, 403);

  const canceled = await request(app)
    .post(
      `/api/marketplace-transactions/${created.body.transaction.id}/cancel-reservation`,
    )
    .set("Authorization", `Bearer ${tokenFor(buyer)}`);

  assert.equal(canceled.status, 200, JSON.stringify(canceled.body));
  assert.equal(canceled.body.success, true, JSON.stringify(canceled.body));
  assert.equal(
    canceled.body.transactionStatus,
    "CANCELED",
    JSON.stringify(canceled.body),
  );
  assert.equal(
    canceled.body.quantityRestored,
    1,
    JSON.stringify(canceled.body),
  );
  assert.equal(
    canceled.body.listingStatus,
    "ACTIVE",
    JSON.stringify(canceled.body),
  );

  const restoredListing = await prisma.marketplaceListing.findUnique({
    where: {
      id: listing.id,
    },
  });

  assert.equal(restoredListing.status, "ACTIVE");
  assert.equal(restoredListing.quantity, 1);
});

test("dealer transfer requires buyer shop and supports paid fulfillment", async () => {
  const seller = await createUser("dealer-seller", "OWNER");
  const buyer = await createUser("dealer-buyer", "OWNER");
  const admin = await createUser("dealer-admin", "ADMIN");

  const sellerShop = await prisma.pawnShop.create({
    data: {
      name: "Seller Integration Shop",
      ownerId: seller.id,
    },
  });

  const buyerShop = await prisma.pawnShop.create({
    data: {
      name: "Buyer Integration Shop",
      ownerId: buyer.id,
    },
  });

  const listing = await prisma.marketplaceListing.create({
    data: {
      sellerUserId: seller.id,
      sellerShopId: sellerShop.id,
      listingType: "SHOP_TO_SHOP",
      status: "ACTIVE",
      title: "Dealer inventory lot",
      description: "Dealer transfer integration test",
      price: "300.00",
      currency: "USD",
      quantity: 2,
      images: [],
      allowOffers: true,
      pickupAvailable: true,
      shippingAvailable: false,
    },
  });

  const missingShop = await request(app)
    .post("/api/marketplace-transactions/reserve")
    .set("Authorization", `Bearer ${tokenFor(buyer)}`)
    .send({
      listingId: listing.id,
      quantity: 1,
      fulfillmentMethod: "PICKUP",
    });

  assert.equal(missingShop.status, 400, JSON.stringify(missingShop.body));

  const created = await request(app)
    .post("/api/marketplace-transactions/reserve")
    .set("Authorization", `Bearer ${tokenFor(buyer)}`)
    .send({
      listingId: listing.id,
      buyerShopId: buyerShop.id,
      quantity: 1,
      fulfillmentMethod: "PICKUP",
    });

  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.transaction.type, "DEALER_TRANSFER");
  assert.equal(created.body.transaction.buyerShopId, buyerShop.id);

  const tooEarly = await request(app)
    .patch(
      `/api/marketplace-transactions/${created.body.transaction.id}/fulfillment`,
    )
    .set("Authorization", `Bearer ${tokenFor(seller)}`)
    .send({
      fulfillmentStatus: "READY_FOR_PICKUP",
    });

  assert.equal(tooEarly.status, 409);

  const paid = await prisma.marketplaceTransaction.update({
    where: {
      id: created.body.transaction.id,
    },
    data: {
      status: "PAYMENT_PROCESSING",
    },
  });

  assert.equal(paid.status, "PAYMENT_PROCESSING");

  const paidComplete = await prisma.marketplaceTransaction.update({
    where: {
      id: created.body.transaction.id,
    },
    data: {
      status: "PAID",
    },
  });

  assert.equal(paidComplete.status, "PAID");

  for (const fulfillmentStatus of [
    "READY_FOR_PICKUP",
    "PICKED_UP",
    "COMPLETED",
  ]) {
    const fulfillment = await request(app)
      .patch(
        `/api/marketplace-transactions/${created.body.transaction.id}/fulfillment`,
      )
      .set("Authorization", `Bearer ${tokenFor(seller)}`)
      .send({
        fulfillmentStatus,
      });

    assert.equal(fulfillment.status, 200);
    assert.equal(
      fulfillment.body.transaction.fulfillmentStatus,
      fulfillmentStatus,
    );
  }

  const completed = await prisma.marketplaceTransaction.findUnique({
    where: {
      id: created.body.transaction.id,
    },
  });

  assert.equal(completed.status, "COMPLETED");
  assert.ok(completed.completedAt);

  const remainingListing = await prisma.marketplaceListing.findUnique({
    where: {
      id: listing.id,
    },
  });

  assert.equal(remainingListing.status, "ACTIVE");
  assert.equal(remainingListing.quantity, 1);
});
