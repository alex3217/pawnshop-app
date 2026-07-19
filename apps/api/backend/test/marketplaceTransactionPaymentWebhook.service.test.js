import assert from "node:assert/strict";
import test from "node:test";

import {
  finalizeMarketplacePaymentSucceeded,
  recordMarketplacePaymentFailed,
} from "../src/services/marketplaceTransactionPaymentWebhook.service.js";

function createTransaction(overrides = {}) {
  return {
    id: "transaction-webhook-test",
    listingId: "listing-webhook-test",
    buyerUserId: "buyer-webhook-test",
    sellerUserId: "seller-webhook-test",
    status: "PAYMENT_PROCESSING",
    totalAmount: "89.99",
    currency: "USD",
    paymentIntentId:
      "pi_marketplace_webhook_test",
    metadata: {
      grossAmountCents: 8999,
    },
    listing: {
      id: "listing-webhook-test",
      itemId: "item-webhook-test",
      status: "RESERVED",
      quantity: 0,
    },
    ...overrides,
  };
}

function createPaymentIntent(overrides = {}) {
  return {
    id: "pi_marketplace_webhook_test",
    status: "succeeded",
    amount: 8999,
    amount_received: 8999,
    currency: "usd",
    latest_charge:
      "ch_marketplace_webhook_test",
    metadata: {
      marketplaceTransactionId:
        "transaction-webhook-test",
    },
    ...overrides,
  };
}

function createFakePrisma({
  transaction = createTransaction(),
  transactionUpdateCount = 1,
  listingUpdateCount = 1,
  itemUpdateCount = 1,
} = {}) {
  const calls = {
    findUnique: 0,
    databaseTransactions: 0,
    transactionUpdate: null,
    listingUpdate: null,
    itemUpdate: null,
  };

  const client = {
    marketplaceTransaction: {
      async findUnique() {
        calls.findUnique += 1;
        return transaction;
      },

      async updateMany(parameters) {
        calls.transactionUpdate =
          parameters;

        return {
          count: transactionUpdateCount,
        };
      },
    },

    marketplaceListing: {
      async updateMany(parameters) {
        calls.listingUpdate =
          parameters;

        return {
          count: listingUpdateCount,
        };
      },
    },

    item: {
      async updateMany(parameters) {
        calls.itemUpdate =
          parameters;

        return {
          count: itemUpdateCount,
        };
      },
    },
  };

  client.$transaction =
    async (operation) => {
      calls.databaseTransactions += 1;
      return operation(client);
    };

  return {
    client,
    calls,
  };
}

async function expectWebhookError(
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

      assert.equal(
        error.code,
        code,
      );

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
  "ignores PaymentIntents without marketplace metadata",
  async () => {
    const prismaClient =
      createFakePrisma();

    const result =
      await finalizeMarketplacePaymentSucceeded({
        paymentIntent:
          createPaymentIntent({
            metadata: {},
          }),
        prismaClient:
          prismaClient.client,
      });

    assert.deepEqual(result, {
      handled: false,
      reason: "NOT_MARKETPLACE_PAYMENT",
    });

    assert.equal(
      prismaClient.calls.findUnique,
      0,
    );
  },
);

test(
  "finalizes a paid transaction, listing, and linked item",
  async () => {
    const transaction =
      createTransaction();

    const prismaClient =
      createFakePrisma({
        transaction,
      });

    const result =
      await finalizeMarketplacePaymentSucceeded({
        paymentIntent:
          createPaymentIntent(),
        prismaClient:
          prismaClient.client,
        processedAt:
          new Date(
            "2026-07-19T12:00:00.000Z",
          ),
      });

    assert.equal(result.handled, true);

    assert.equal(
      result.transactionStatus,
      "PAID",
    );

    assert.equal(
      result.transactionUpdated,
      true,
    );

    assert.equal(
      result.listingSold,
      true,
    );

    assert.equal(
      result.itemMarkedSold,
      true,
    );

    assert.equal(
      prismaClient.calls
        .transactionUpdate.data.status,
      "PAID",
    );

    assert.equal(
      prismaClient.calls
        .transactionUpdate.data.metadata
        .payment.status,
      "succeeded",
    );

    assert.equal(
      prismaClient.calls
        .listingUpdate.data.status,
      "SOLD",
    );

    assert.equal(
      prismaClient.calls
        .itemUpdate.data.status,
      "SOLD",
    );
  },
);

test(
  "keeps a partially available listing active after payment",
  async () => {
    const transaction =
      createTransaction({
        listing: {
          id: "listing-webhook-test",
          itemId: "item-webhook-test",
          status: "ACTIVE",
          quantity: 2,
        },
      });

    const prismaClient =
      createFakePrisma({
        transaction,
      });

    const result =
      await finalizeMarketplacePaymentSucceeded({
        paymentIntent:
          createPaymentIntent(),
        prismaClient:
          prismaClient.client,
      });

    assert.equal(result.handled, true);

    assert.equal(
      result.transactionStatus,
      "PAID",
    );

    assert.equal(
      result.listingSold,
      false,
    );

    assert.equal(
      result.itemMarkedSold,
      false,
    );

    assert.equal(
      prismaClient.calls.listingUpdate,
      null,
    );

    assert.equal(
      prismaClient.calls.itemUpdate,
      null,
    );
  },
);

test(
  "handles a duplicate successful webhook idempotently",
  async () => {
    const transaction =
      createTransaction({
        status: "PAID",
        listing: {
          id: "listing-webhook-test",
          itemId: "item-webhook-test",
          status: "SOLD",
          quantity: 0,
        },
      });

    const prismaClient =
      createFakePrisma({
        transaction,
      });

    const result =
      await finalizeMarketplacePaymentSucceeded({
        paymentIntent:
          createPaymentIntent(),
        prismaClient:
          prismaClient.client,
      });

    assert.equal(result.handled, true);
    assert.equal(result.idempotent, true);

    assert.equal(
      result.transactionUpdated,
      false,
    );

    assert.equal(
      prismaClient.calls
        .transactionUpdate,
      null,
    );

    assert.equal(
      prismaClient.calls
        .listingUpdate.data.status,
      "SOLD",
    );
  },
);

test(
  "rejects a mismatched PaymentIntent ID",
  async () => {
    const prismaClient =
      createFakePrisma();

    await expectWebhookError(
      finalizeMarketplacePaymentSucceeded({
        paymentIntent:
          createPaymentIntent({
            id: "pi_wrong_webhook",
          }),
        prismaClient:
          prismaClient.client,
      }),
      {
        statusCode: 409,
        code:
          "MARKETPLACE_PAYMENT_INTENT_MISMATCH",
        message: /does not match/i,
      },
    );

    assert.equal(
      prismaClient.calls
        .transactionUpdate,
      null,
    );
  },
);

test(
  "rejects a mismatched PaymentIntent amount",
  async () => {
    const prismaClient =
      createFakePrisma();

    await expectWebhookError(
      finalizeMarketplacePaymentSucceeded({
        paymentIntent:
          createPaymentIntent({
            amount: 5000,
            amount_received: 5000,
          }),
        prismaClient:
          prismaClient.client,
      }),
      {
        statusCode: 409,
        code:
          "MARKETPLACE_PAYMENT_AMOUNT_MISMATCH",
        message: /amount/i,
      },
    );
  },
);

test(
  "rejects a mismatched PaymentIntent currency",
  async () => {
    const prismaClient =
      createFakePrisma();

    await expectWebhookError(
      finalizeMarketplacePaymentSucceeded({
        paymentIntent:
          createPaymentIntent({
            currency: "cad",
          }),
        prismaClient:
          prismaClient.client,
      }),
      {
        statusCode: 409,
        code:
          "MARKETPLACE_PAYMENT_CURRENCY_MISMATCH",
        message: /currency/i,
      },
    );
  },
);

test(
  "records payment failure while retaining the reservation",
  async () => {
    const transaction =
      createTransaction();

    const prismaClient =
      createFakePrisma({
        transaction,
      });

    const result =
      await recordMarketplacePaymentFailed({
        paymentIntent:
          createPaymentIntent({
            status:
              "requires_payment_method",
            amount_received: 0,
            last_payment_error: {
              code: "card_declined",
              message:
                "The card was declined.",
            },
          }),
        prismaClient:
          prismaClient.client,
        processedAt:
          new Date(
            "2026-07-19T12:30:00.000Z",
          ),
      });

    assert.equal(result.handled, true);

    assert.equal(
      result.transactionStatus,
      "PAYMENT_PROCESSING",
    );

    assert.equal(
      result.reservationRetained,
      true,
    );

    assert.equal(
      prismaClient.calls
        .transactionUpdate.data.status,
      "PAYMENT_PROCESSING",
    );

    assert.equal(
      prismaClient.calls
        .transactionUpdate.data.metadata
        .payment.status,
      "payment_failed",
    );

    assert.equal(
      prismaClient.calls
        .transactionUpdate.data.metadata
        .payment.failureCode,
      "card_declined",
    );

    assert.equal(
      prismaClient.calls.listingUpdate,
      null,
    );

    assert.equal(
      prismaClient.calls.itemUpdate,
      null,
    );
  },
);

test(
  "ignores a late failure event after payment is already complete",
  async () => {
    const transaction =
      createTransaction({
        status: "PAID",
        listing: {
          id: "listing-webhook-test",
          itemId: "item-webhook-test",
          status: "SOLD",
          quantity: 0,
        },
      });

    const prismaClient =
      createFakePrisma({
        transaction,
      });

    const result =
      await recordMarketplacePaymentFailed({
        paymentIntent:
          createPaymentIntent({
            status:
              "requires_payment_method",
            amount_received: 0,
            last_payment_error: {
              code: "card_declined",
              message:
                "The card was declined.",
            },
          }),
        prismaClient:
          prismaClient.client,
      });

    assert.equal(result.handled, true);
    assert.equal(result.idempotent, true);

    assert.equal(
      result.transactionStatus,
      "PAID",
    );

    assert.equal(
      result.reservationRetained,
      true,
    );

    assert.equal(
      prismaClient.calls
        .transactionUpdate,
      null,
    );
  },
);
