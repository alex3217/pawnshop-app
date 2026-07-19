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
  "pawnloop-marketplace-fulfillment-integration-2026";

const TEST_DOMAIN =
  "@marketplace-fulfillment.integration.pawnloop.test";

let app;
let prisma;
let passwordHash;

function testEmail(
  prefix,
) {
  return `${prefix}${TEST_DOMAIN}`;
}

function tokenFor(
  user,
) {
  return jwt.sign(
    {
      sub:
        user.id,

      email:
        user.email,

      role:
        user.role,
    },
    TEST_JWT_SECRET,
    {
      expiresIn:
        "15m",
    },
  );
}

async function createUser(
  prefix,
) {
  return prisma.user.create({
    data: {
      name:
        `${prefix} Consumer`,

      email:
        testEmail(
          prefix,
        ),

      password:
        passwordHash,

      role:
        "CONSUMER",

      isActive:
        true,
    },
  });
}

async function createFixture({
  prefix,
  pickupAvailable = true,
  shippingAvailable = false,
}) {
  const seller =
    await createUser(
      `${prefix}-seller`,
    );

  const buyer =
    await createUser(
      `${prefix}-buyer`,
    );

  const listing =
    await prisma
      .marketplaceListing
      .create({
        data: {
          sellerUserId:
            seller.id,

          sellerShopId:
            null,

          listingType:
            "CUSTOMER_TO_CUSTOMER",

          status:
            "SOLD",

          title:
            `${prefix} fulfillment listing`,

          description:
            `${prefix} seller fulfillment test`,

          category:
            "Electronics",

          condition:
            "Good",

          price:
            "100.00",

          currency:
            "USD",

          quantity:
            0,

          images:
            [],

          allowOffers:
            true,

          pickupAvailable,
          shippingAvailable,
        },
      });

  const transaction =
    await prisma
      .marketplaceTransaction
      .create({
        data: {
          listingId:
            listing.id,

          buyerUserId:
            buyer.id,

          buyerShopId:
            null,

          sellerUserId:
            seller.id,

          sellerShopId:
            null,

          type:
            "DIRECT_PURCHASE",

          status:
            "PAID",

          quantity:
            1,

          subtotal:
            "100.00",

          platformFee:
            "15.00",

          shippingFee:
            "0.00",

          taxAmount:
            "0.00",

          totalAmount:
            "100.00",

          currency:
            "USD",

          fulfillmentStatus:
            "PAYMENT_PENDING",

          metadata: {
            sellerNetCents:
              8500,
          },
        },
      });

  return {
    seller,
    buyer,
    listing,
    transaction,
  };
}

function updateFulfillmentRequest(
  user,
  transactionId,
  payload,
) {
  const operation =
    request(app)
      .patch(
        `/api/marketplace-transactions/${transactionId}/fulfillment`,
      )
      .send(
        payload,
      );

  return user
    ? operation.set(
        "Authorization",
        `Bearer ${tokenFor(user)}`,
      )
    : operation;
}

async function cleanupTestRecords() {
  const users =
    await prisma.user.findMany({
      where: {
        email: {
          endsWith:
            TEST_DOMAIN,
        },
      },

      select: {
        id:
          true,
      },
    });

  const userIds =
    users.map(
      (user) =>
        user.id,
    );

  if (
    userIds.length ===
    0
  ) {
    return;
  }

  await prisma
    .marketplaceTransaction
    .deleteMany({
      where: {
        OR: [
          {
            buyerUserId: {
              in:
                userIds,
            },
          },
          {
            sellerUserId: {
              in:
                userIds,
            },
          },
        ],
      },
    });

  await prisma
    .marketplaceListing
    .deleteMany({
      where: {
        sellerUserId: {
          in:
            userIds,
        },
      },
    });

  await prisma.user.deleteMany({
    where: {
      id: {
        in:
          userIds,
      },
    },
  });
}

before(async () => {
  Object.assign(
    process.env,
    {
      NODE_ENV:
        "test",

      APP_ENV:
        "test",

      APP_NAME:
        "pawnloop-marketplace-fulfillment-integration-test",

      JWT_SECRET:
        TEST_JWT_SECRET,

      AUCTION_SCHEDULER_ENABLED:
        "false",

      MARKETPLACE_RESERVATION_SCHEDULER_ENABLED:
        "false",

      STRIPE_SECRET_KEY:
        "sk_test_marketplace_fulfillment_only",

      STRIPE_WEBHOOK_SECRET:
        "whsec_marketplace_fulfillment_only",
    },
  );

  const rawDatabaseUrl =
    String(
      process.env
        .DATABASE_URL ||
      "",
    );

  assert.ok(
    rawDatabaseUrl,
    "DATABASE_URL is required",
  );

  const databaseName =
    decodeURIComponent(
      new URL(
        rawDatabaseUrl,
      ).pathname.replace(
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
    await import(
      "../src/app.js"
    );

  const prismaModule =
    await import(
      "../src/lib/prisma.js"
    );

  app =
    appModule.createApp();

  prisma =
    prismaModule.prisma;

  passwordHash =
    await bcrypt.hash(
      "MarketplaceFulfillment123!",
      4,
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
  "marketplace fulfillment requires authentication",
  async () => {
    const fixture =
      await createFixture({
        prefix:
          "auth-required",
      });

    const response =
      await updateFulfillmentRequest(
        null,
        fixture
          .transaction
          .id,
        {
          fulfillmentStatus:
            "READY_FOR_PICKUP",
        },
      );

    assert.equal(
      response.status,
      401,
    );
  },
);

test(
  "marketplace buyer cannot update seller fulfillment",
  async () => {
    const fixture =
      await createFixture({
        prefix:
          "buyer-forbidden",
      });

    const response =
      await updateFulfillmentRequest(
        fixture.buyer,
        fixture
          .transaction
          .id,
        {
          fulfillmentStatus:
            "READY_FOR_PICKUP",
        },
      );

    assert.equal(
      response.status,
      403,
    );

    assert.equal(
      response.body.code,
      "MARKETPLACE_FULFILLMENT_FORBIDDEN",
    );
  },
);

test(
  "unrelated account cannot update seller fulfillment",
  async () => {
    const fixture =
      await createFixture({
        prefix:
          "outsider-forbidden",
      });

    const outsider =
      await createUser(
        "outsider-forbidden-user",
      );

    const response =
      await updateFulfillmentRequest(
        outsider,
        fixture
          .transaction
          .id,
        {
          fulfillmentStatus:
            "READY_FOR_PICKUP",
        },
      );

    assert.equal(
      response.status,
      403,
    );

    assert.equal(
      response.body.code,
      "MARKETPLACE_FULFILLMENT_FORBIDDEN",
    );
  },
);

test(
  "seller completes the pickup fulfillment lifecycle",
  async () => {
    const fixture =
      await createFixture({
        prefix:
          "pickup-lifecycle",

        pickupAvailable:
          true,

        shippingAvailable:
          false,
      });

    const ready =
      await updateFulfillmentRequest(
        fixture.seller,
        fixture
          .transaction
          .id,
        {
          fulfillmentStatus:
            "READY_FOR_PICKUP",

          note:
            "Item is ready at the front counter.",
        },
      );

    assert.equal(
      ready.status,
      200,
    );

    assert.equal(
      ready.body.idempotent,
      false,
    );

    assert.equal(
      ready.body.transaction.status,
      "FULFILLING",
    );

    assert.equal(
      ready.body.transaction.fulfillmentStatus,
      "READY_FOR_PICKUP",
    );

    const pickedUp =
      await updateFulfillmentRequest(
        fixture.seller,
        fixture
          .transaction
          .id,
        {
          fulfillmentStatus:
            "PICKED_UP",

          note:
            "Buyer collected the item.",
        },
      );

    assert.equal(
      pickedUp.status,
      200,
    );

    assert.equal(
      pickedUp.body.transaction.fulfillmentStatus,
      "PICKED_UP",
    );

    const completed =
      await updateFulfillmentRequest(
        fixture.seller,
        fixture
          .transaction
          .id,
        {
          fulfillmentStatus:
            "COMPLETED",
        },
      );

    assert.equal(
      completed.status,
      200,
    );

    assert.equal(
      completed.body.transaction.status,
      "COMPLETED",
    );

    assert.equal(
      completed.body.transaction.fulfillmentStatus,
      "COMPLETED",
    );

    assert.ok(
      completed.body.transaction.completedAt,
    );

    assert.deepEqual(
      completed.body.transaction.metadata
        .fulfillment
        .history
        .map(
          (entry) =>
            entry.status,
        ),
      [
        "READY_FOR_PICKUP",
        "PICKED_UP",
        "COMPLETED",
      ],
    );

    const repeated =
      await updateFulfillmentRequest(
        fixture.seller,
        fixture
          .transaction
          .id,
        {
          fulfillmentStatus:
            "COMPLETED",
        },
      );

    assert.equal(
      repeated.status,
      200,
    );

    assert.equal(
      repeated.body.idempotent,
      true,
    );
  },
);

test(
  "seller shipping requires and stores tracking information",
  async () => {
    const fixture =
      await createFixture({
        prefix:
          "shipping-tracking",

        pickupAvailable:
          false,

        shippingAvailable:
          true,
      });

    const missingTracking =
      await updateFulfillmentRequest(
        fixture.seller,
        fixture
          .transaction
          .id,
        {
          fulfillmentStatus:
            "SHIPPED",

          carrier:
            "UPS",
        },
      );

    assert.equal(
      missingTracking.status,
      400,
    );

    assert.equal(
      missingTracking.body.code,
      "MARKETPLACE_FULFILLMENT_TRACKING_REQUIRED",
    );

    const shipped =
      await updateFulfillmentRequest(
        fixture.seller,
        fixture
          .transaction
          .id,
        {
          fulfillmentStatus:
            "SHIPPED",

          carrier:
            "UPS",

          trackingNumber:
            "1Z999AA10123456784",

          note:
            "Package handed to carrier.",
        },
      );

    assert.equal(
      shipped.status,
      200,
    );

    assert.equal(
      shipped.body.transaction.status,
      "FULFILLING",
    );

    assert.equal(
      shipped.body.transaction.fulfillmentStatus,
      "SHIPPED",
    );

    assert.equal(
      shipped.body.transaction.metadata
        .fulfillment
        .carrier,
      "UPS",
    );

    assert.equal(
      shipped.body.transaction.metadata
        .fulfillment
        .trackingNumber,
      "1Z999AA10123456784",
    );
  },
);

test(
  "seller fulfillment rejects unavailable methods and invalid transitions",
  async () => {
    const fixture =
      await createFixture({
        prefix:
          "invalid-transition",

        pickupAvailable:
          true,

        shippingAvailable:
          false,
      });

    const unavailable =
      await updateFulfillmentRequest(
        fixture.seller,
        fixture
          .transaction
          .id,
        {
          fulfillmentStatus:
            "SHIPPED",

          carrier:
            "UPS",

          trackingNumber:
            "1Z999AA10123456784",
        },
      );

    assert.equal(
      unavailable.status,
      409,
    );

    assert.equal(
      unavailable.body.code,
      "MARKETPLACE_FULFILLMENT_METHOD_UNAVAILABLE",
    );

    const invalid =
      await updateFulfillmentRequest(
        fixture.seller,
        fixture
          .transaction
          .id,
        {
          fulfillmentStatus:
            "PICKED_UP",
        },
      );

    assert.equal(
      invalid.status,
      409,
    );

    assert.equal(
      invalid.body.code,
      "MARKETPLACE_FULFILLMENT_TRANSITION_INVALID",
    );

    const persisted =
      await prisma
        .marketplaceTransaction
        .findUnique({
          where: {
            id:
              fixture
                .transaction
                .id,
          },
        });

    assert.equal(
      persisted.status,
      "PAID",
    );

    assert.equal(
      persisted.fulfillmentStatus,
      "PAYMENT_PENDING",
    );
  },
);
