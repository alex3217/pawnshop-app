import assert from "node:assert/strict";
import test from "node:test";

import {
  createMarketplaceTransactionPaymentIntent,
} from "../src/services/marketplaceTransactionPayment.service.js";

process.env.STRIPE_DEFAULT_CURRENCY = "usd";

function createTransaction(overrides = {}) {
  return {
    id: "transaction-test-1",
    listingId: "listing-test-1",
    buyerUserId: "buyer-test-1",
    sellerUserId: "seller-test-1",
    type: "DIRECT_PURCHASE",
    status: "PENDING",
    totalAmount: "89.99",
    currency: "USD",
    paymentIntentId: null,
    metadata: {
      grossAmountCents: 8999,
    },
    listing: {
      id: "listing-test-1",
      title: "Marketplace payment test item",
      status: "RESERVED",
    },
    ...overrides,
  };
}

function createFakePrisma({
  transaction = createTransaction(),
  updateCount = 1,
} = {}) {
  const calls = {
    findUnique: 0,
    updateMany: 0,
    updateParameters: null,
  };

  return {
    calls,

    marketplaceTransaction: {
      async findUnique() {
        calls.findUnique += 1;
        return transaction;
      },

      async updateMany(parameters) {
        calls.updateMany += 1;
        calls.updateParameters = parameters;

        return {
          count: updateCount,
        };
      },
    },
  };
}

function createFakeStripe({
  createdIntent,
  retrievedIntent,
  retrieveError,
} = {}) {
  const calls = {
    create: 0,
    retrieve: 0,
    cancel: 0,
    createParameters: null,
    createOptions: null,
    canceledId: null,
  };

  const defaultCreatedIntent = {
    id: "pi_marketplace_created",
    client_secret:
      "pi_marketplace_created_secret_test",
    amount: 8999,
    currency: "usd",
    status: "requires_payment_method",
    metadata: {
      marketplaceTransactionId:
        "transaction-test-1",
    },
  };

  return {
    calls,

    paymentIntents: {
      async create(parameters, options) {
        calls.create += 1;
        calls.createParameters = parameters;
        calls.createOptions = options;

        return (
          createdIntent ||
          {
            ...defaultCreatedIntent,
            metadata: parameters.metadata,
          }
        );
      },

      async retrieve() {
        calls.retrieve += 1;

        if (retrieveError) {
          throw retrieveError;
        }

        return retrievedIntent;
      },

      async cancel(paymentIntentId) {
        calls.cancel += 1;
        calls.canceledId = paymentIntentId;

        return {
          id: paymentIntentId,
          status: "canceled",
        };
      },
    },
  };
}

async function expectPaymentError(
  operation,
  {
    statusCode,
    code,
    message,
  },
) {
  await assert.rejects(
    operation,
    (error) => {
      assert.equal(
        error.statusCode,
        statusCode,
      );

      if (code) {
        assert.equal(error.code, code);
      }

      if (message) {
        assert.match(
          String(error.message || ""),
          message,
        );
      }

      return true;
    },
  );
}

test(
  "creates a PaymentIntent from stored transaction values",
  async () => {
    const transaction = createTransaction();

    const prismaClient = createFakePrisma({
      transaction,
    });

    const stripeClient = createFakeStripe();

    const result =
      await createMarketplaceTransactionPaymentIntent({
        transactionId: transaction.id,
        buyerUserId: transaction.buyerUserId,
        role: "CONSUMER",
        stripeClient,
        prismaClient,
      });

    assert.equal(result.amount, 8999);
    assert.equal(result.currency, "usd");
    assert.equal(result.reused, false);
    assert.equal(
      result.transactionStatus,
      "PAYMENT_PROCESSING",
    );

    assert.equal(
      stripeClient.calls
        .createParameters.amount,
      8999,
    );

    assert.equal(
      stripeClient.calls
        .createParameters.currency,
      "usd",
    );

    assert.equal(
      stripeClient.calls
        .createParameters.metadata
        .marketplaceTransactionId,
      transaction.id,
    );

    assert.equal(
      stripeClient.calls
        .createOptions.idempotencyKey,
      `marketplace-transaction-${transaction.id}`,
    );

    assert.equal(
      prismaClient.calls
        .updateParameters.data.status,
      "PAYMENT_PROCESSING",
    );

    assert.equal(
      prismaClient.calls
        .updateParameters.data.paymentIntentId,
      "pi_marketplace_created",
    );
  },
);

test(
  "reuses an active existing PaymentIntent",
  async () => {
    const transaction = createTransaction({
      status: "PAYMENT_PROCESSING",
      paymentIntentId: "pi_existing_active",
    });

    const prismaClient = createFakePrisma({
      transaction,
    });

    const stripeClient = createFakeStripe({
      retrievedIntent: {
        id: "pi_existing_active",
        client_secret:
          "pi_existing_active_secret_test",
        amount: 8999,
        currency: "usd",
        status: "requires_action",
        metadata: {
          marketplaceTransactionId:
            transaction.id,
        },
      },
    });

    const result =
      await createMarketplaceTransactionPaymentIntent({
        transactionId: transaction.id,
        buyerUserId: transaction.buyerUserId,
        role: "CONSUMER",
        stripeClient,
        prismaClient,
      });

    assert.equal(result.reused, true);
    assert.equal(result.finalized, false);
    assert.equal(
      result.paymentIntentId,
      "pi_existing_active",
    );

    assert.equal(stripeClient.calls.retrieve, 1);
    assert.equal(stripeClient.calls.create, 0);
    assert.equal(prismaClient.calls.updateMany, 0);
  },
);

test(
  "reports an already-succeeded PaymentIntent as finalized",
  async () => {
    const transaction = createTransaction({
      status: "PAYMENT_PROCESSING",
      paymentIntentId:
        "pi_existing_succeeded",
    });

    const prismaClient = createFakePrisma({
      transaction,
    });

    const stripeClient = createFakeStripe({
      retrievedIntent: {
        id: "pi_existing_succeeded",
        client_secret: null,
        amount: 8999,
        currency: "usd",
        status: "succeeded",
        metadata: {
          marketplaceTransactionId:
            transaction.id,
        },
      },
    });

    const result =
      await createMarketplaceTransactionPaymentIntent({
        transactionId: transaction.id,
        buyerUserId: transaction.buyerUserId,
        role: "CONSUMER",
        stripeClient,
        prismaClient,
      });

    assert.equal(result.reused, true);
    assert.equal(result.finalized, true);
    assert.equal(result.paymentStatus, "succeeded");

    assert.equal(stripeClient.calls.create, 0);
    assert.equal(prismaClient.calls.updateMany, 0);
  },
);

test(
  "blocks a user who is not the transaction buyer",
  async () => {
    const transaction = createTransaction();

    const prismaClient = createFakePrisma({
      transaction,
    });

    const stripeClient = createFakeStripe();

    await expectPaymentError(
      createMarketplaceTransactionPaymentIntent({
        transactionId: transaction.id,
        buyerUserId: "outside-user",
        role: "CONSUMER",
        stripeClient,
        prismaClient,
      }),
      {
        statusCode: 403,
        code: "MARKETPLACE_PAYMENT_FORBIDDEN",
        message: /forbidden/i,
      },
    );

    assert.equal(stripeClient.calls.create, 0);
    assert.equal(stripeClient.calls.retrieve, 0);
    assert.equal(prismaClient.calls.updateMany, 0);
  },
);

test(
  "blocks transactions that are already paid",
  async () => {
    const transaction = createTransaction({
      status: "PAID",
    });

    const prismaClient = createFakePrisma({
      transaction,
    });

    const stripeClient = createFakeStripe();

    await expectPaymentError(
      createMarketplaceTransactionPaymentIntent({
        transactionId: transaction.id,
        buyerUserId: transaction.buyerUserId,
        role: "CONSUMER",
        stripeClient,
        prismaClient,
      }),
      {
        statusCode: 409,
        code:
          "MARKETPLACE_TRANSACTION_ALREADY_PAID",
        message: /already paid/i,
      },
    );

    assert.equal(stripeClient.calls.create, 0);
  },
);

test(
  "blocks payment when the amount differs from the reservation snapshot",
  async () => {
    const transaction = createTransaction({
      metadata: {
        grossAmountCents: 5000,
      },
    });

    const prismaClient = createFakePrisma({
      transaction,
    });

    const stripeClient = createFakeStripe();

    await expectPaymentError(
      createMarketplaceTransactionPaymentIntent({
        transactionId: transaction.id,
        buyerUserId: transaction.buyerUserId,
        role: "CONSUMER",
        stripeClient,
        prismaClient,
      }),
      {
        statusCode: 409,
        code:
          "MARKETPLACE_TRANSACTION_AMOUNT_MISMATCH",
        message: /reservation snapshot/i,
      },
    );

    assert.equal(stripeClient.calls.create, 0);
  },
);

test(
  "blocks a currency that differs from Stripe configuration",
  async () => {
    const transaction = createTransaction({
      currency: "CAD",
    });

    const prismaClient = createFakePrisma({
      transaction,
    });

    const stripeClient = createFakeStripe();

    await expectPaymentError(
      createMarketplaceTransactionPaymentIntent({
        transactionId: transaction.id,
        buyerUserId: transaction.buyerUserId,
        role: "CONSUMER",
        stripeClient,
        prismaClient,
      }),
      {
        statusCode: 409,
        code:
          "MARKETPLACE_TRANSACTION_CURRENCY_MISMATCH",
        message: /currency/i,
      },
    );

    assert.equal(stripeClient.calls.create, 0);
  },
);

test(
  "cancels a newly created PaymentIntent if attachment loses the state race",
  async () => {
    const transaction = createTransaction();

    const prismaClient = createFakePrisma({
      transaction,
      updateCount: 0,
    });

    const stripeClient = createFakeStripe();

    await expectPaymentError(
      createMarketplaceTransactionPaymentIntent({
        transactionId: transaction.id,
        buyerUserId: transaction.buyerUserId,
        role: "CONSUMER",
        stripeClient,
        prismaClient,
      }),
      {
        statusCode: 409,
        code:
          "MARKETPLACE_TRANSACTION_PAYMENT_STATE_CHANGED",
        message: /changed before payment/i,
      },
    );

    assert.equal(stripeClient.calls.create, 1);
    assert.equal(stripeClient.calls.cancel, 1);

    assert.equal(
      stripeClient.calls.canceledId,
      "pi_marketplace_created",
    );
  },
);

test(
  "surfaces an existing PaymentIntent retrieval failure",
  async () => {
    const transaction = createTransaction({
      status: "PAYMENT_PROCESSING",
      paymentIntentId:
        "pi_existing_unavailable",
    });

    const prismaClient = createFakePrisma({
      transaction,
    });

    const retrieveError =
      new Error("Stripe connection failed");

    retrieveError.code =
      "api_connection_error";

    const stripeClient = createFakeStripe({
      retrieveError,
    });

    await expectPaymentError(
      createMarketplaceTransactionPaymentIntent({
        transactionId: transaction.id,
        buyerUserId: transaction.buyerUserId,
        role: "CONSUMER",
        stripeClient,
        prismaClient,
      }),
      {
        statusCode: 502,
        code: "api_connection_error",
        message: /unable to retrieve/i,
      },
    );

    assert.equal(stripeClient.calls.retrieve, 1);
    assert.equal(stripeClient.calls.create, 0);
  },
);
