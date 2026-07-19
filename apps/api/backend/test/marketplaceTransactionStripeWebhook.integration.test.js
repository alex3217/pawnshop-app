import assert from "node:assert/strict";
import test, {
  after,
  before,
  beforeEach,
} from "node:test";

import bcrypt from "bcryptjs";
import Stripe from "stripe";
import request from "supertest";

const TEST_DOMAIN =
  "@marketplace-stripe-webhook.integration.pawnloop.test";

const TEST_JWT_SECRET =
  "pawnloop-marketplace-stripe-webhook-tests-2026";

const TEST_STRIPE_SECRET_KEY =
  "sk_test_marketplace_webhook_integration_only";

const TEST_WEBHOOK_SECRET =
  "whsec_marketplace_webhook_integration_only";

let app;
let prisma;
let reserveMarketplacePurchase;
let stripeSigner;

function testEmail(prefix) {
  return `${prefix}${TEST_DOMAIN}`;
}

async function createUser(prefix) {
  return prisma.user.create({
    data: {
      name: `${prefix} user`,
      email: testEmail(prefix),
      password: await bcrypt.hash(
        "MarketplaceWebhook123!",
        4,
      ),
      role: "CONSUMER",
      isActive: true,
    },
  });
}

async function createListing({
  seller,
  price = "89.99",
}) {
  return prisma.marketplaceListing.create({
    data: {
      sellerUserId: seller.id,
      listingType:
        "CUSTOMER_TO_CUSTOMER",
      status: "ACTIVE",
      title:
        "Stripe webhook integration item",
      description:
        "Signed marketplace Stripe webhook test",
      category: "Electronics",
      condition: "Good",
      price,
      currency: "USD",
      quantity: 1,
      images: [],
      allowOffers: true,
      pickupAvailable: true,
      shippingAvailable: false,
      publishedAt: new Date(),
    },
  });
}

async function createPaymentTransaction({
  seller,
  buyer,
  price = "89.99",
  paymentIntentId,
}) {
  const listing = await createListing({
    seller,
    price,
  });

  const transaction =
    await reserveMarketplacePurchase({
      listingId: listing.id,
      buyerUserId: buyer.id,
      quantity: 1,
    });

  const preparedTransaction =
    await prisma.marketplaceTransaction.update({
      where: {
        id: transaction.id,
      },
      data: {
        status: "PAYMENT_PROCESSING",
        paymentIntentId,
      },
    });

  return {
    listing,
    transaction:
      preparedTransaction,
  };
}

function createStripeEvent({
  type,
  transaction,
  paymentIntentId,
  amount,
  failure = null,
}) {
  const succeeded =
    type === "payment_intent.succeeded";

  return {
    id:
      `evt_${type.replaceAll(".", "_")}_${transaction.id}`,
    object: "event",
    api_version:
      "2025-01-27.acacia",
    created:
      Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: paymentIntentId,
        object: "payment_intent",
        status: succeeded
          ? "succeeded"
          : "requires_payment_method",
        amount,
        amount_received:
          succeeded ? amount : 0,
        currency: "usd",
        latest_charge:
          succeeded
            ? `ch_${transaction.id}`
            : null,
        metadata: {
          marketplaceTransactionId:
            transaction.id,
        },
        last_payment_error:
          failure,
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: null,
      idempotency_key: null,
    },
    type,
  };
}

async function sendSignedWebhook(event) {
  const payload =
    JSON.stringify(event);

  const signature =
    stripeSigner.webhooks
      .generateTestHeaderString({
        payload,
        secret:
          TEST_WEBHOOK_SECRET,
      });

  return request(app)
    .post("/api/webhooks/stripe")
    .set(
      "Content-Type",
      "application/json",
    )
    .set(
      "stripe-signature",
      signature,
    )
    .send(payload);
}

async function cleanupTestRecords() {
  const users =
    await prisma.user.findMany({
      where: {
        email: {
          endsWith: TEST_DOMAIN,
        },
      },
      select: {
        id: true,
      },
    });

  const userIds =
    users.map((user) => user.id);

  if (userIds.length === 0) {
    return;
  }

  await prisma
    .marketplaceTransaction
    .deleteMany({
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

  await prisma
    .marketplaceListing
    .deleteMany({
      where: {
        sellerUserId: {
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
    APP_NAME:
      "pawnloop-marketplace-stripe-webhook-integration-test",
    JWT_SECRET:
      TEST_JWT_SECRET,
    AUCTION_SCHEDULER_ENABLED:
      "false",
    STRIPE_SECRET_KEY:
      TEST_STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET:
      TEST_WEBHOOK_SECRET,
    STRIPE_DEFAULT_CURRENCY:
      "usd",
  });

  const rawDatabaseUrl =
    String(
      process.env.DATABASE_URL || "",
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
    await import("../src/app.js");

  const prismaModule =
    await import(
      "../src/lib/prisma.js"
    );

  const transactionModule =
    await import(
      "../src/services/marketplaceTransaction.service.js"
    );

  app = appModule.createApp();
  prisma = prismaModule.prisma;

  reserveMarketplacePurchase =
    transactionModule
      .reserveMarketplacePurchase;

  stripeSigner =
    new Stripe(
      TEST_STRIPE_SECRET_KEY,
      {
        apiVersion:
          "2025-01-27.acacia",
      },
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
  "Stripe webhook rejects a missing signature",
  async () => {
    const payload =
      JSON.stringify({
        id: "evt_missing_signature",
        object: "event",
        type:
          "payment_intent.succeeded",
        data: {
          object: {},
        },
      });

    const response =
      await request(app)
        .post(
          "/api/webhooks/stripe",
        )
        .set(
          "Content-Type",
          "application/json",
        )
        .send(payload);

    assert.equal(
      response.status,
      400,
    );

    assert.equal(
      response.body.success,
      false,
    );

    assert.match(
      String(
        response.body.message || "",
      ),
      /missing stripe signature/i,
    );
  },
);

test(
  "signed success webhook finalizes the transaction and listing idempotently",
  async () => {
    const seller =
      await createUser(
        "webhook-success-seller",
      );

    const buyer =
      await createUser(
        "webhook-success-buyer",
      );

    const paymentIntentId =
      "pi_marketplace_success_integration";

    const {
      listing,
      transaction,
    } =
      await createPaymentTransaction({
        seller,
        buyer,
        price: "89.99",
        paymentIntentId,
      });

    const event =
      createStripeEvent({
        type:
          "payment_intent.succeeded",
        transaction,
        paymentIntentId,
        amount: 8999,
      });

    const firstResponse =
      await sendSignedWebhook(event);

    assert.equal(
      firstResponse.status,
      200,
    );

    assert.deepEqual(
      firstResponse.body,
      {
        received: true,
      },
    );

    let storedTransaction =
      await prisma
        .marketplaceTransaction
        .findUnique({
          where: {
            id: transaction.id,
          },
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
      storedTransaction.status,
      "PAID",
    );

    assert.equal(
      storedTransaction
        .metadata.payment.status,
      "succeeded",
    );

    assert.equal(
      storedListing.quantity,
      0,
    );

    assert.equal(
      storedListing.status,
      "SOLD",
    );

    const duplicateResponse =
      await sendSignedWebhook(event);

    assert.equal(
      duplicateResponse.status,
      200,
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
      "PAID",
    );

    assert.equal(
      storedListing.status,
      "SOLD",
    );
  },
);

test(
  "signed failure webhook records the error and retains the reservation",
  async () => {
    const seller =
      await createUser(
        "webhook-failure-seller",
      );

    const buyer =
      await createUser(
        "webhook-failure-buyer",
      );

    const paymentIntentId =
      "pi_marketplace_failure_integration";

    const {
      listing,
      transaction,
    } =
      await createPaymentTransaction({
        seller,
        buyer,
        price: "60.00",
        paymentIntentId,
      });

    const event =
      createStripeEvent({
        type:
          "payment_intent.payment_failed",
        transaction,
        paymentIntentId,
        amount: 6000,
        failure: {
          code: "card_declined",
          decline_code:
            "generic_decline",
          message:
            "The card was declined.",
        },
      });

    const response =
      await sendSignedWebhook(event);

    assert.equal(
      response.status,
      200,
    );

    assert.deepEqual(
      response.body,
      {
        received: true,
      },
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
      "PAYMENT_PROCESSING",
    );

    assert.equal(
      storedTransaction
        .metadata.payment.status,
      "payment_failed",
    );

    assert.equal(
      storedTransaction
        .metadata.payment.failureCode,
      "card_declined",
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
