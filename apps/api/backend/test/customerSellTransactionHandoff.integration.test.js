import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  MarketplaceTransactionType,
  Prisma,
} from "@prisma/client";
import request from "supertest";

const TEST_DOMAIN = "@customer-sell-handoff.integration.pawnloop.test";
const TEST_JWT_SECRET = "pawnloop-customer-sell-handoff-integration-2026";

let app;
let prisma;
let acceptSubmissionOffer;
let isRetryableCustomerSellAcceptanceError;
let createMarketplaceTransactionPaymentIntent;
let reserveMarketplacePurchase;
let passwordHash;

function tokenFor(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, authVersion: user.authVersion },
    TEST_JWT_SECRET,
    { expiresIn: "15m" },
  );
}

async function createUser(prefix, role = "CONSUMER") {
  return prisma.user.create({
    data: {
      name: `${prefix} user`,
      email: `${prefix}${TEST_DOMAIN}`,
      password: passwordHash,
      role,
      isActive: true,
    },
  });
}

async function createOfferFixture({ intent = "SELL_OFFERS", competing = true } = {}) {
  const customer = await createUser(`customer-${Date.now()}`);
  const otherCustomer = await createUser(`other-${Date.now()}`);
  const representative = await createUser(`representative-${Date.now()}`, "OWNER");
  const competitorRepresentative = await createUser(`competitor-${Date.now()}`, "OWNER");
  const shop = await prisma.pawnShop.create({
    data: { name: "Buying Shop", ownerId: representative.id },
  });
  const competitorShop = await prisma.pawnShop.create({
    data: { name: "Competing Shop", ownerId: competitorRepresentative.id },
  });
  const submission = await prisma.buyerItemSubmission.create({
    data: {
      buyerId: customer.id,
      title: "Customer camera",
      category: "Electronics",
      condition: "Good",
      intent,
      status: "OFFERED",
    },
  });
  const offer = await prisma.buyerItemSubmissionOffer.create({
    data: {
      submissionId: submission.id,
      shopId: shop.id,
      ownerId: representative.id,
      amount: "175.25",
      status: "PENDING",
    },
  });
  const competingOffer = competing
    ? await prisma.buyerItemSubmissionOffer.create({
        data: {
          submissionId: submission.id,
          shopId: competitorShop.id,
          ownerId: competitorRepresentative.id,
          amount: "180.00",
          status: "PENDING",
        },
      })
    : null;

  return {
    customer,
    otherCustomer,
    representative,
    shop,
    submission,
    offer,
    competingOffer,
  };
}

async function createListingPurchaseFixture() {
  const seller = await createUser(`listing-seller-${Date.now()}`);
  const buyer = await createUser(`listing-buyer-${Date.now()}`, "OWNER");
  const buyerShop = await prisma.pawnShop.create({
    data: {
      name: "Established Listing Buyer Shop",
      ownerId: buyer.id,
    },
  });
  const listing = await prisma.marketplaceListing.create({
    data: {
      sellerUserId: seller.id,
      listingType: "CUSTOMER_TO_SHOP",
      status: "ACTIVE",
      title: "Established customer listing",
      description: "Customer-to-shop compatibility fixture",
      category: "Electronics",
      condition: "Good",
      price: "125.00",
      currency: "USD",
      quantity: 1,
      images: [],
      allowOffers: false,
      pickupAvailable: true,
      shippingAvailable: false,
    },
  });

  return {
    seller,
    buyer,
    buyerShop,
    listing,
  };
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: TEST_DOMAIN } },
    select: { id: true },
  });
  const userIds = users.map(({ id }) => id);
  if (!userIds.length) return;

  await prisma.marketplaceTransaction.deleteMany({
    where: { OR: [{ buyerUserId: { in: userIds } }, { sellerUserId: { in: userIds } }] },
  });
  await prisma.marketplaceListing.deleteMany({
    where: { sellerUserId: { in: userIds } },
  });
  await prisma.buyerItemSubmissionOffer.deleteMany({
    where: { OR: [{ ownerId: { in: userIds } }, { submission: { buyerId: { in: userIds } } }] },
  });
  await prisma.buyerItemSubmission.deleteMany({ where: { buyerId: { in: userIds } } });
  await prisma.pawnShop.deleteMany({ where: { ownerId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

before(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    APP_ENV: "test",
    APP_NAME: "pawnloop-customer-sell-handoff-integration-test",
    JWT_SECRET: TEST_JWT_SECRET,
    AUCTION_SCHEDULER_ENABLED: "false",
    MARKETPLACE_RESERVATION_SCHEDULER_ENABLED: "false",
    STRIPE_SECRET_KEY: "sk_test_customer_sell_handoff_only",
    STRIPE_WEBHOOK_SECRET: "whsec_customer_sell_handoff_only",
  });
  assert.equal(process.env.NODE_ENV, "test");
  assert.equal(process.env.APP_ENV, "test");

  const rawDatabaseUrl = String(process.env.DATABASE_URL || "");
  assert.ok(rawDatabaseUrl, "DATABASE_URL is required");
  const databaseName = decodeURIComponent(new URL(rawDatabaseUrl).pathname.replace(/^\/+/, ""));
  assert.ok(
    ["pawnloop_test", "pawnshop_test"].includes(databaseName),
    "Integration tests may only use pawnloop_test or pawnshop_test",
  );

  const appModule = await import("../src/app.js");
  const prismaModule = await import("../src/lib/prisma.js");
  const serviceModule = await import("../src/services/customerSellTransaction.service.js");
  const paymentServiceModule = await import("../src/services/marketplaceTransactionPayment.service.js");
  const marketplaceServiceModule = await import("../src/services/marketplaceTransaction.service.js");
  app = appModule.createApp();
  prisma = prismaModule.prisma;
  acceptSubmissionOffer = serviceModule.acceptSubmissionOffer;
  isRetryableCustomerSellAcceptanceError =
    serviceModule.isRetryableCustomerSellAcceptanceError;
  createMarketplaceTransactionPaymentIntent =
    paymentServiceModule.createMarketplaceTransactionPaymentIntent;
  reserveMarketplacePurchase =
    marketplaceServiceModule.reserveMarketplacePurchase;
  passwordHash = await bcrypt.hash("CustomerSellHandoff123!", 4);
  await cleanup();
});

beforeEach(cleanup);

after(async () => {
  if (!prisma) return;
  await cleanup();
  await prisma.$disconnect();
});

test("customer accepts a SELL offer and creates one correctly directed linked transaction", async () => {
  const fixture = await createOfferFixture();
  const response = await request(app)
    .patch(`/api/buyer/item-submissions/offers/${fixture.offer.id}/accept`)
    .set("Authorization", `Bearer ${tokenFor(fixture.customer)}`)
    .send();

  assert.equal(response.status, 200);
  assert.equal(response.body.offer.status, "ACCEPTED");
  assert.equal(response.body.submission.status, "ACCEPTED");
  assert.equal(response.body.transaction.type, "CUSTOMER_SELL_TO_SHOP");

  const transactions = await prisma.marketplaceTransaction.findMany({
    where: { submissionId: fixture.submission.id },
  });
  assert.equal(transactions.length, 1);
  const [transaction] = transactions;
  assert.equal(transaction.sellerUserId, fixture.customer.id);
  assert.equal(transaction.buyerUserId, fixture.representative.id);
  assert.equal(transaction.buyerShopId, fixture.shop.id);
  assert.equal(transaction.sellerShopId, null);
  assert.equal(transaction.submissionId, fixture.submission.id);
  assert.equal(transaction.submissionOfferId, fixture.offer.id);
  assert.equal(String(transaction.totalAmount), "175.25");
  assert.equal(String(transaction.subtotal), "175.25");
  assert.equal(transaction.paymentIntentId, null);

  const competing = await prisma.buyerItemSubmissionOffer.findUnique({
    where: { id: fixture.competingOffer.id },
  });
  assert.equal(competing.status, "REJECTED");
});

test("unauthorized customer cannot accept another customer's offer", async () => {
  const fixture = await createOfferFixture();
  const response = await request(app)
    .patch(`/api/buyer/item-submissions/offers/${fixture.offer.id}/accept`)
    .set("Authorization", `Bearer ${tokenFor(fixture.otherCustomer)}`)
    .send();
  assert.equal(response.status, 404);
  assert.equal(await prisma.marketplaceTransaction.count({ where: { submissionId: fixture.submission.id } }), 0);
});

test("retry returns the existing SELL transaction without duplication", async () => {
  const fixture = await createOfferFixture();
  const operation = () => request(app)
    .patch(`/api/buyer/item-submissions/offers/${fixture.offer.id}/accept`)
    .set("Authorization", `Bearer ${tokenFor(fixture.customer)}`)
    .send();
  const first = await operation();
  const retry = await operation();
  assert.equal(first.status, 200);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.transaction.id, first.body.transaction.id);
  assert.equal(await prisma.marketplaceTransaction.count({ where: { submissionId: fixture.submission.id } }), 1);
});

test("stale pending offers cannot mutate closed submissions", async (t) => {
  for (const status of ["WITHDRAWN", "REJECTED", "LISTED", "ACCEPTED", "COMPLETED"]) {
    await t.test(status, async () => {
      const fixture = await createOfferFixture({ competing: false });
      await prisma.buyerItemSubmission.update({
        where: { id: fixture.submission.id },
        data: { status },
      });

      const response = await request(app)
        .patch(`/api/buyer/item-submissions/offers/${fixture.offer.id}/accept`)
        .set("Authorization", `Bearer ${tokenFor(fixture.customer)}`)
        .send();

      assert.equal(response.status, 409);
      assert.equal(response.body.code, "SUBMISSION_OFFER_SUBMISSION_NOT_ACCEPTABLE");
      const [offer, submission, transactionCount] = await Promise.all([
        prisma.buyerItemSubmissionOffer.findUnique({ where: { id: fixture.offer.id } }),
        prisma.buyerItemSubmission.findUnique({ where: { id: fixture.submission.id } }),
        prisma.marketplaceTransaction.count({ where: { submissionId: fixture.submission.id } }),
      ]);
      assert.equal(offer.status, "PENDING");
      assert.equal(offer.respondedAt, null);
      assert.equal(submission.status, status);
      assert.equal(transactionCount, 0);
    });
  }
});

test("unsupported submission intent is rejected atomically", async () => {
  const fixture = await createOfferFixture({ intent: "TRADE_FOR_CRYPTO", competing: false });
  const response = await request(app)
    .patch(`/api/buyer/item-submissions/offers/${fixture.offer.id}/accept`)
    .set("Authorization", `Bearer ${tokenFor(fixture.customer)}`)
    .send();
  assert.equal(response.status, 409);
  assert.equal(response.body.code, "SUBMISSION_OFFER_INTENT_UNSUPPORTED");
  const offer = await prisma.buyerItemSubmissionOffer.findUnique({ where: { id: fixture.offer.id } });
  const submission = await prisma.buyerItemSubmission.findUnique({ where: { id: fixture.submission.id } });
  assert.equal(offer.status, "PENDING");
  assert.equal(submission.status, "OFFERED");
  assert.equal(await prisma.marketplaceTransaction.count({ where: { submissionId: fixture.submission.id } }), 0);
});

test("deleted and inactive shops cannot accept offers", async (t) => {
  for (const shopUpdate of [{ isDeleted: true }, { subscriptionStatus: "INACTIVE" }]) {
    await t.test(JSON.stringify(shopUpdate), async () => {
      const fixture = await createOfferFixture({ competing: false });
      await prisma.pawnShop.update({ where: { id: fixture.shop.id }, data: shopUpdate });
      const response = await request(app)
        .patch(`/api/buyer/item-submissions/offers/${fixture.offer.id}/accept`)
        .set("Authorization", `Bearer ${tokenFor(fixture.customer)}`)
        .send();
      assert.equal(response.status, 409);
      assert.equal(response.body.code, "SUBMISSION_OFFER_SHOP_INACTIVE");
      assert.equal((await prisma.buyerItemSubmissionOffer.findUnique({ where: { id: fixture.offer.id } })).status, "PENDING");
      assert.equal(await prisma.marketplaceTransaction.count({ where: { submissionId: fixture.submission.id } }), 0);
    });
  }
});

test("changed or mismatched shop ownership rejects a stale offer", async () => {
  const fixture = await createOfferFixture({ competing: false });
  const replacementOwner = await createUser(`replacement-${Date.now()}`, "OWNER");
  await prisma.pawnShop.update({
    where: { id: fixture.shop.id },
    data: { ownerId: replacementOwner.id },
  });
  const response = await request(app)
    .patch(`/api/buyer/item-submissions/offers/${fixture.offer.id}/accept`)
    .set("Authorization", `Bearer ${tokenFor(fixture.customer)}`)
    .send();
  assert.equal(response.status, 409);
  assert.equal(response.body.code, "SUBMISSION_OFFER_SHOP_OWNER_MISMATCH");
  assert.equal((await prisma.buyerItemSubmissionOffer.findUnique({ where: { id: fixture.offer.id } })).status, "PENDING");
  assert.equal(await prisma.marketplaceTransaction.count({ where: { submissionId: fixture.submission.id } }), 0);
});

test("simultaneous acceptance of the same SELL offer converges on one transaction", async () => {
  const fixture = await createOfferFixture();
  const operation = () => request(app)
    .patch(`/api/buyer/item-submissions/offers/${fixture.offer.id}/accept`)
    .set("Authorization", `Bearer ${tokenFor(fixture.customer)}`)
    .send();

  const [first, second] = await Promise.all([operation(), operation()]);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(first.body.transaction.id, second.body.transaction.id);

  const transactions = await prisma.marketplaceTransaction.findMany({
    where: { submissionId: fixture.submission.id },
  });
  const offers = await prisma.buyerItemSubmissionOffer.findMany({
    where: { submissionId: fixture.submission.id },
  });
  assert.equal(transactions.length, 1);
  assert.equal(offers.filter(({ status }) => status === "ACCEPTED").length, 1);
  assert.equal(offers.find(({ status }) => status === "ACCEPTED").id, fixture.offer.id);
});

test("simultaneous acceptance of competing SELL offers yields one acceptance and one conflict", async () => {
  const fixture = await createOfferFixture();
  const operation = (offerId) => request(app)
    .patch(`/api/buyer/item-submissions/offers/${offerId}/accept`)
    .set("Authorization", `Bearer ${tokenFor(fixture.customer)}`)
    .send();

  const responses = await Promise.all([
    operation(fixture.offer.id),
    operation(fixture.competingOffer.id),
  ]);
  const success = responses.find(({ status }) => status === 200);
  const conflict = responses.find(({ status }) => status === 409);

  assert.ok(success);
  assert.ok(conflict);
  assert.equal(conflict.body.code, "SUBMISSION_OFFER_ALREADY_ACCEPTED");

  const transactions = await prisma.marketplaceTransaction.findMany({
    where: { submissionId: fixture.submission.id },
  });
  const offers = await prisma.buyerItemSubmissionOffer.findMany({
    where: { submissionId: fixture.submission.id },
  });
  const acceptedOffer = offers.find(({ status }) => status === "ACCEPTED");
  assert.equal(transactions.length, 1);
  assert.equal(offers.filter(({ status }) => status === "ACCEPTED").length, 1);
  assert.equal(transactions[0].submissionOfferId, acceptedOffer.id);
  assert.equal(success.body.transaction.submissionOfferId, acceptedOffer.id);
  assert.ok(offers.filter(({ id }) => id !== acceptedOffer.id).every(({ status }) => status === "REJECTED"));
});

test("customer SELL transaction is rejected by the generic Stripe payment workflow", async () => {
  const fixture = await createOfferFixture();
  const acceptance = await acceptSubmissionOffer({
    offerId: fixture.offer.id,
    customerId: fixture.customer.id,
  });
  let createCalls = 0;
  let retrieveCalls = 0;
  const stripeClient = {
    paymentIntents: {
      create: async () => { createCalls += 1; },
      retrieve: async () => { retrieveCalls += 1; },
    },
  };

  await assert.rejects(
    createMarketplaceTransactionPaymentIntent({
      transactionId: acceptance.transaction.id,
      buyerUserId: fixture.representative.id,
      role: fixture.representative.role,
      stripeClient,
    }),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.equal(error.code, "MARKETPLACE_TRANSACTION_PAYMENT_TYPE_UNSUPPORTED");
      return true;
    },
  );
  assert.equal(createCalls, 0);
  assert.equal(retrieveCalls, 0);

  const transaction = await prisma.marketplaceTransaction.findUnique({
    where: { id: acceptance.transaction.id },
  });
  assert.equal(transaction.paymentIntentId, null);
  assert.equal(transaction.status, "PENDING");
});

test("CUSTOMER_TO_SHOP listing purchase retains its origin and enters Stripe payment", async () => {
  const fixture = await createListingPurchaseFixture();
  const transaction = await reserveMarketplacePurchase({
    listingId: fixture.listing.id,
    buyerUserId: fixture.buyer.id,
    buyerShopId: fixture.buyerShop.id,
  });

  assert.equal(transaction.type, "CUSTOMER_SELL_TO_SHOP");
  assert.equal(transaction.listingId, fixture.listing.id);
  assert.equal(transaction.submissionId, null);
  assert.equal(transaction.submissionOfferId, null);

  let createCalls = 0;
  let retrieveCalls = 0;
  const stripeClient = {
    paymentIntents: {
      create: async (parameters) => {
        createCalls += 1;
        return {
          id: "pi_listing_origin_customer_to_shop",
          client_secret: "pi_listing_origin_customer_to_shop_secret",
          amount: parameters.amount,
          currency: parameters.currency,
          status: "requires_payment_method",
          metadata: parameters.metadata,
        };
      },
      retrieve: async () => {
        retrieveCalls += 1;
      },
    },
  };

  const payment = await createMarketplaceTransactionPaymentIntent({
    transactionId: transaction.id,
    buyerUserId: fixture.buyer.id,
    role: fixture.buyer.role,
    stripeClient,
  });

  assert.equal(payment.paymentIntentId, "pi_listing_origin_customer_to_shop");
  assert.equal(payment.transactionStatus, "PAYMENT_PROCESSING");
  assert.equal(createCalls, 1);
  assert.equal(retrieveCalls, 0);
});

test("non-listing transaction outside the payment allowlist is rejected before Stripe", async () => {
  const unsupportedType =
    MarketplaceTransactionType.CUSTOMER_SELL_TO_SHOP;
  assert.ok(
    Object.values(
      MarketplaceTransactionType,
    ).includes(unsupportedType),
  );

  let createCalls = 0;
  let retrieveCalls = 0;
  const stripeClient = {
    paymentIntents: {
      create: async () => {
        createCalls += 1;
      },
      retrieve: async () => {
        retrieveCalls += 1;
      },
    },
  };
  const transaction = {
    id: "unsupported-non-listing-transaction",
    listingId: null,
    submissionId: null,
    buyerUserId: "unsupported-transaction-buyer",
    sellerUserId: "unsupported-transaction-seller",
    type: unsupportedType,
    status: "PENDING",
    totalAmount: "125.00",
    currency: "USD",
    paymentIntentId: null,
    metadata: {
      grossAmountCents: 12500,
    },
    listing: null,
  };
  const prismaClient = {
    marketplaceTransaction: {
      findUnique: async () => transaction,
    },
  };

  await assert.rejects(
    createMarketplaceTransactionPaymentIntent({
      transactionId: transaction.id,
      buyerUserId: transaction.buyerUserId,
      role: "CONSUMER",
      stripeClient,
      prismaClient,
    }),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.equal(
        error.code,
        "MARKETPLACE_TRANSACTION_PAYMENT_TYPE_UNSUPPORTED",
      );
      return true;
    },
  );
  assert.equal(createCalls, 0);
  assert.equal(retrieveCalls, 0);
});

test("database accepts valid origins and rejects mixed, incomplete, or incompatible origins", async () => {
  const first = await createOfferFixture({ competing: false });
  const second = await createOfferFixture({ competing: false });
  const acceptance = await acceptSubmissionOffer({
    offerId: first.offer.id,
    customerId: first.customer.id,
  });
  const listingFixture = await createListingPurchaseFixture();
  const listingTransaction = await reserveMarketplacePurchase({
    listingId: listingFixture.listing.id,
    buyerUserId: listingFixture.buyer.id,
    buyerShopId: listingFixture.buyerShop.id,
  });

  assert.equal(listingTransaction.type, "CUSTOMER_SELL_TO_SHOP");
  assert.equal(listingTransaction.listingId, listingFixture.listing.id);
  assert.equal(listingTransaction.submissionId, null);
  assert.equal(listingTransaction.submissionOfferId, null);
  assert.equal(acceptance.transaction.listingId, null);
  assert.equal(acceptance.transaction.submissionId, first.submission.id);
  assert.equal(acceptance.transaction.submissionOfferId, first.offer.id);

  await assert.rejects(
    prisma.marketplaceTransaction.update({
      where: { id: acceptance.transaction.id },
      data: { submissionOfferId: second.offer.id },
    }),
  );
  await assert.rejects(
    prisma.marketplaceTransaction.update({
      where: { id: acceptance.transaction.id },
      data: { submissionId: null },
    }),
  );
  await assert.rejects(
    prisma.marketplaceTransaction.update({
      where: { id: acceptance.transaction.id },
      data: { submissionOfferId: null },
    }),
  );
  await assert.rejects(
    prisma.marketplaceTransaction.update({
      where: { id: acceptance.transaction.id },
      data: { listingId: listingFixture.listing.id },
    }),
  );
  await assert.rejects(
    prisma.marketplaceTransaction.update({
      where: { id: acceptance.transaction.id },
      data: { type: "DIRECT_PURCHASE" },
    }),
  );
  await assert.rejects(
    prisma.marketplaceTransaction.update({
      where: { id: listingTransaction.id },
      data: { listingId: null },
    }),
  );

  const unchanged = await prisma.marketplaceTransaction.findUnique({
    where: { id: acceptance.transaction.id },
  });
  assert.equal(unchanged.submissionId, first.submission.id);
  assert.equal(unchanged.submissionOfferId, first.offer.id);
  assert.equal(unchanged.listingId, null);
});

test("transaction creation failure rolls back offer and submission acceptance", async () => {
  const fixture = await createOfferFixture();
  const failingClient = {
    $transaction: (callback, options) => prisma.$transaction(
      (tx) => callback({
        buyerItemSubmissionOffer: tx.buyerItemSubmissionOffer,
        buyerItemSubmission: tx.buyerItemSubmission,
        marketplaceTransaction: {
          findUnique: tx.marketplaceTransaction.findUnique.bind(tx.marketplaceTransaction),
          create: async () => { throw new Error("injected transaction creation failure"); },
        },
      }),
      options,
    ),
  };

  await assert.rejects(
    acceptSubmissionOffer({
      offerId: fixture.offer.id,
      customerId: fixture.customer.id,
      prismaClient: failingClient,
    }),
    /injected transaction creation failure/,
  );
  const offer = await prisma.buyerItemSubmissionOffer.findUnique({ where: { id: fixture.offer.id } });
  const competing = await prisma.buyerItemSubmissionOffer.findUnique({ where: { id: fixture.competingOffer.id } });
  const submission = await prisma.buyerItemSubmission.findUnique({ where: { id: fixture.submission.id } });
  assert.equal(offer.status, "PENDING");
  assert.equal(competing.status, "PENDING");
  assert.equal(submission.status, "OFFERED");
});

test("accepting a PAWN offer does not create a customer-sale transaction", async () => {
  const fixture = await createOfferFixture({ intent: "PAWN_OFFERS" });
  const response = await request(app)
    .patch(`/api/buyer/item-submissions/offers/${fixture.offer.id}/accept`)
    .set("Authorization", `Bearer ${tokenFor(fixture.customer)}`)
    .send();
  assert.equal(response.status, 200);
  assert.equal(response.body.transaction, null);
  assert.equal(await prisma.marketplaceTransaction.count({ where: { submissionId: fixture.submission.id } }), 0);
});

test("retrying the same accepted PAWN offer is idempotent without changing acceptance state", async () => {
  const fixture = await createOfferFixture({ intent: "PAWN_OFFERS" });
  const operation = () => request(app)
    .patch(`/api/buyer/item-submissions/offers/${fixture.offer.id}/accept`)
    .set("Authorization", `Bearer ${tokenFor(fixture.customer)}`)
    .send();

  const first = await operation();
  const acceptedBeforeReplay = await prisma.buyerItemSubmissionOffer.findUnique({
    where: { id: fixture.offer.id },
    include: { submission: true },
  });
  const replay = await operation();
  const acceptedAfterReplay = await prisma.buyerItemSubmissionOffer.findUnique({
    where: { id: fixture.offer.id },
    include: { submission: true },
  });

  assert.equal(first.status, 200);
  assert.equal(replay.status, 200);
  assert.equal(first.body.transaction, null);
  assert.equal(replay.body.transaction, null);
  assert.equal(replay.body.offer.id, fixture.offer.id);
  assert.deepEqual(acceptedAfterReplay, acceptedBeforeReplay);
  assert.equal(await prisma.marketplaceTransaction.count({ where: { submissionId: fixture.submission.id } }), 0);
});

test("simultaneous acceptance of the same PAWN offer reconciles idempotently", async () => {
  const fixture = await createOfferFixture({ intent: "PAWN" });
  const operation = () => request(app)
    .patch(`/api/buyer/item-submissions/offers/${fixture.offer.id}/accept`)
    .set("Authorization", `Bearer ${tokenFor(fixture.customer)}`)
    .send();

  const [first, second] = await Promise.all([operation(), operation()]);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(first.body.offer.id, fixture.offer.id);
  assert.equal(second.body.offer.id, fixture.offer.id);
  assert.equal(first.body.transaction, null);
  assert.equal(second.body.transaction, null);
  assert.equal(await prisma.marketplaceTransaction.count({ where: { submissionId: fixture.submission.id } }), 0);
});

test("retry exhaustion recognizes the already accepted target PAWN offer", async () => {
  const fixture = await createOfferFixture({ intent: "PAWN_OFFERS", competing: false });
  const accepted = await acceptSubmissionOffer({
    offerId: fixture.offer.id,
    customerId: fixture.customer.id,
  });
  let attempts = 0;
  const retryingClient = {
    $transaction: async () => {
      attempts += 1;
      throw Object.assign(new Error("serialization failure"), { code: "P2034" });
    },
    buyerItemSubmissionOffer: prisma.buyerItemSubmissionOffer,
    marketplaceTransaction: prisma.marketplaceTransaction,
  };

  const reconciled = await acceptSubmissionOffer({
    offerId: fixture.offer.id,
    customerId: fixture.customer.id,
    prismaClient: retryingClient,
  });

  assert.equal(attempts, 3);
  assert.equal(reconciled.offer.id, accepted.offer.id);
  assert.equal(reconciled.submission.id, accepted.submission.id);
  assert.equal(reconciled.transaction, null);
  assert.equal(await prisma.marketplaceTransaction.count({ where: { submissionId: fixture.submission.id } }), 0);
});

test("retry exhaustion keeps a competing accepted PAWN offer as a controlled conflict", async () => {
  const fixture = await createOfferFixture({ intent: "PAWN_OFFERS" });
  await acceptSubmissionOffer({
    offerId: fixture.competingOffer.id,
    customerId: fixture.customer.id,
  });
  let attempts = 0;
  const retryingClient = {
    $transaction: async () => {
      attempts += 1;
      throw Object.assign(new Error("serialization failure"), { code: "P2034" });
    },
    buyerItemSubmissionOffer: prisma.buyerItemSubmissionOffer,
    marketplaceTransaction: prisma.marketplaceTransaction,
  };

  await assert.rejects(
    acceptSubmissionOffer({
      offerId: fixture.offer.id,
      customerId: fixture.customer.id,
      prismaClient: retryingClient,
    }),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.equal(error.code, "SUBMISSION_OFFER_ALREADY_ACCEPTED");
      return true;
    },
  );
  assert.equal(attempts, 3);
  assert.equal(await prisma.marketplaceTransaction.count({ where: { submissionId: fixture.submission.id } }), 0);
});

test("retry classification is narrow and recognizes supported wrapped PostgreSQL codes", () => {
  assert.equal(isRetryableCustomerSellAcceptanceError({ code: "P2034" }), true);
  assert.equal(isRetryableCustomerSellAcceptanceError({ cause: { code: "P2034" } }), true);
  assert.equal(
    isRetryableCustomerSellAcceptanceError({ error: { cause: { error: { code: "P2034" } } } }),
    true,
  );
  assert.equal(isRetryableCustomerSellAcceptanceError({ code: "40001" }), true);
  assert.equal(isRetryableCustomerSellAcceptanceError({ code: "40P01" }), true);
  assert.equal(isRetryableCustomerSellAcceptanceError({ meta: { code: "40001" } }), true);
  assert.equal(isRetryableCustomerSellAcceptanceError({ cause: { code: "40001" } }), true);
  assert.equal(isRetryableCustomerSellAcceptanceError({ error: { cause: { code: "40P01" } } }), true);
  assert.equal(isRetryableCustomerSellAcceptanceError({ sqlState: "40001" }), true);
  assert.equal(isRetryableCustomerSellAcceptanceError({ sqlstate: "40P01" }), true);
  assert.equal(isRetryableCustomerSellAcceptanceError({ meta: { sqlState: "40001" } }), true);
  assert.equal(isRetryableCustomerSellAcceptanceError({ message: "invoice 40001 was already processed" }), false);
  assert.equal(isRetryableCustomerSellAcceptanceError({ message: "order 40P01 is a customer reference" }), false);
  assert.equal(
    isRetryableCustomerSellAcceptanceError({ message: "database error 40001: serialization failure" }),
    false,
  );
  assert.equal(
    isRetryableCustomerSellAcceptanceError({ meta: { database_error: "server returned 40001 serialization failure" } }),
    false,
  );
  assert.equal(
    isRetryableCustomerSellAcceptanceError({ meta: { description: "deadlock detected (40P01)" } }),
    false,
  );
  assert.equal(isRetryableCustomerSellAcceptanceError({ code: "X40001" }), false);
  assert.equal(isRetryableCustomerSellAcceptanceError({ code: "400010" }), false);
  assert.equal(isRetryableCustomerSellAcceptanceError({ code: "40p01" }), false);
  assert.equal(isRetryableCustomerSellAcceptanceError({ sqlState: " 40001 " }), false);
  assert.equal(isRetryableCustomerSellAcceptanceError({ code: "P2002", meta: { target: ["submissionOfferId"] } }), true);
  assert.equal(
    isRetryableCustomerSellAcceptanceError({
      code: "P2002",
      meta: { constraint: "MarketplaceTransaction_submissionId_key" },
    }),
    true,
  );
  assert.equal(isRetryableCustomerSellAcceptanceError({ code: "P2002", meta: { target: ["email"] } }), false);
  assert.equal(isRetryableCustomerSellAcceptanceError({ cause: { code: "P2035" } }), false);
  assert.equal(isRetryableCustomerSellAcceptanceError({ error: { code: "XP2034" } }), false);
  assert.equal(isRetryableCustomerSellAcceptanceError({ cause: { code: "23505" } }), false);
  assert.equal(
    isRetryableCustomerSellAcceptanceError({ cause: { code: "P2002", meta: { target: ["submissionOfferId"] } } }),
    false,
  );
});

test("retry classification recognizes authenticated Prisma PostgreSQL connector diagnostics", () => {
  const connectorDiagnostic = (code) =>
    `ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "${code}", message: "database conflict" }), transient: false })`;
  const prismaError = (diagnostic) =>
    new Prisma.PrismaClientUnknownRequestError(diagnostic, { clientVersion: "6.19.3" });

  assert.equal(
    isRetryableCustomerSellAcceptanceError(prismaError(connectorDiagnostic("40001"))),
    true,
  );
  assert.equal(
    isRetryableCustomerSellAcceptanceError(prismaError(connectorDiagnostic("40P01"))),
    true,
  );
  assert.equal(
    isRetryableCustomerSellAcceptanceError(new Error(connectorDiagnostic("40P01"))),
    false,
  );
  assert.equal(
    isRetryableCustomerSellAcceptanceError({
      name: "PrismaClientUnknownRequestError",
      clientVersion: "6.19.3",
      message: connectorDiagnostic("40P01"),
    }),
    false,
  );

  for (const diagnostic of [
    connectorDiagnostic("4000"),
    connectorDiagnostic("400010"),
    connectorDiagnostic("40P02"),
    connectorDiagnostic("40p01"),
    'QueryError(PostgresError { code: "40P01", message: "missing connector wrapper" })',
    'ConnectorError(QueryError(PostgresError { code = "40P01", message: "wrong field grammar" }))',
    'ConnectorError(QueryError(PostgresError { code: "40P01" message: "missing comma" }))',
  ]) {
    assert.equal(isRetryableCustomerSellAcceptanceError(prismaError(diagnostic)), false);
  }

  const oversized = `${"x".repeat(4096)}${connectorDiagnostic("40P01")}`;
  assert.equal(isRetryableCustomerSellAcceptanceError(prismaError(oversized)), false);
});

test("retry classification safely bounds cyclic structured wrappers", () => {
  const cyclic = { code: "UNRELATED" };
  cyclic.cause = { error: cyclic };
  assert.equal(isRetryableCustomerSellAcceptanceError(cyclic), false);

  let beyondLimit = { code: "P2034" };
  for (let depth = 0; depth < 7; depth += 1) beyondLimit = { cause: beyondLimit };
  assert.equal(isRetryableCustomerSellAcceptanceError(beyondLimit), false);
});

test("message-only PostgreSQL codes are returned unchanged without retry or reconciliation", async () => {
  for (const code of ["40001", "40P01"]) {
    let attempts = 0;
    let reconciliationReads = 0;
    const original = new Error(`invoice ${code} was already processed`);
    const client = {
      $transaction: async () => {
        attempts += 1;
        throw original;
      },
      buyerItemSubmissionOffer: {
        findUnique: async () => {
          reconciliationReads += 1;
          return null;
        },
      },
      marketplaceTransaction: {
        findUnique: async () => {
          reconciliationReads += 1;
          return null;
        },
      },
    };

    await assert.rejects(
      acceptSubmissionOffer({ offerId: "unused", customerId: "unused", prismaClient: client }),
      (error) => error === original,
    );
    assert.equal(attempts, 1);
    assert.equal(reconciliationReads, 0);
  }
});

test("recognized retries are bounded and exhausted contention becomes a controlled conflict", async () => {
  const fixture = await createOfferFixture({ competing: false });
  let attempts = 0;
  const retryingClient = {
    $transaction: async () => {
      attempts += 1;
      throw { cause: { code: "P2034" } };
    },
    buyerItemSubmissionOffer: prisma.buyerItemSubmissionOffer,
    marketplaceTransaction: prisma.marketplaceTransaction,
  };

  await assert.rejects(
    acceptSubmissionOffer({
      offerId: fixture.offer.id,
      customerId: fixture.customer.id,
      prismaClient: retryingClient,
    }),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.equal(error.code, "SUBMISSION_OFFER_ACCEPTANCE_CONFLICT");
      return true;
    },
  );
  assert.equal(attempts, 3);
});

test("unrelated P2002 errors are not retried", async () => {
  let attempts = 0;
  const unrelated = Object.assign(new Error("duplicate email"), {
    code: "P2002",
    meta: { target: ["email"] },
  });
  const client = {
    $transaction: async () => {
      attempts += 1;
      throw unrelated;
    },
  };
  await assert.rejects(
    acceptSubmissionOffer({ offerId: "unused", customerId: "unused", prismaClient: client }),
    (error) => error === unrelated,
  );
  assert.equal(attempts, 1);
});
