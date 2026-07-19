import assert from "node:assert/strict";
import test from "node:test";

import {
  cancelMarketplaceTransactionReservation,
  expireMarketplaceTransactionReservation,
} from "../src/services/marketplaceTransactionReservationRelease.service.js";

function createTransaction(overrides = {}) {
  return {
    id: "transaction-release-test",
    listingId: "listing-release-test",
    buyerUserId: "buyer-release-test",
    status: "PENDING",
    quantity: 2,
    paymentIntentId: null,
    fulfillmentStatus: "PAYMENT_PENDING",
    canceledAt: null,
    metadata: {
      source:
        "MARKETPLACE_PURCHASE_RESERVATION",
    },
    createdAt:
      new Date(
        "2026-07-19T10:00:00.000Z",
      ),
    updatedAt:
      new Date(
        "2026-07-19T10:05:00.000Z",
      ),
    listing: {
      id: "listing-release-test",
      status: "RESERVED",
      quantity: 0,
      expiresAt:
        new Date(
          "2026-07-20T10:00:00.000Z",
        ),
    },
    ...overrides,
  };
}

function createFakePrisma({
  transaction = createTransaction(),
  transactionUpdateCount = 1,
  listingUpdateCount = 1,
} = {}) {
  const calls = {
    findUnique: 0,
    databaseTransactions: 0,
    transactionUpdate: null,
    listingUpdate: null,
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
          count:
            transactionUpdateCount,
        };
      },
    },

    marketplaceListing: {
      async updateMany(parameters) {
        calls.listingUpdate =
          parameters;

        return {
          count:
            listingUpdateCount,
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

function createFakeStripe({
  status =
    "requires_payment_method",
  retrieveError = null,
  cancelError = null,
  transactionId =
    "transaction-release-test",
} = {}) {
  const calls = {
    retrieve: 0,
    cancel: 0,
    retrievedId: null,
    canceledId: null,
  };

  return {
    calls,

    paymentIntents: {
      async retrieve(paymentIntentId) {
        calls.retrieve += 1;
        calls.retrievedId =
          paymentIntentId;

        if (retrieveError) {
          throw retrieveError;
        }

        return {
          id: paymentIntentId,
          status,
          metadata: {
            marketplaceTransactionId:
              transactionId,
          },
        };
      },

      async cancel(paymentIntentId) {
        calls.cancel += 1;
        calls.canceledId =
          paymentIntentId;

        if (cancelError) {
          throw cancelError;
        }

        return {
          id: paymentIntentId,
          status: "canceled",
        };
      },
    },
  };
}

async function expectReleaseError(
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
  "buyer cancellation restores the exact reserved quantity",
  async () => {
    const transaction =
      createTransaction();

    const prismaClient =
      createFakePrisma({
        transaction,
      });

    const result =
      await cancelMarketplaceTransactionReservation({
        transactionId:
          transaction.id,
        actorUserId:
          transaction.buyerUserId,
        role: "CONSUMER",
        prismaClient:
          prismaClient.client,
        releasedAt:
          new Date(
            "2026-07-19T11:00:00.000Z",
          ),
      });

    assert.equal(result.handled, true);
    assert.equal(result.idempotent, false);

    assert.equal(
      result.transactionStatus,
      "CANCELED",
    );

    assert.equal(
      result.quantityRestored,
      2,
    );

    assert.equal(
      result.listingStatus,
      "ACTIVE",
    );

    assert.equal(
      prismaClient.calls
        .transactionUpdate.data.status,
      "CANCELED",
    );

    assert.equal(
      prismaClient.calls
        .transactionUpdate.data
        .fulfillmentStatus,
      "CANCELED",
    );

    assert.equal(
      prismaClient.calls
        .listingUpdate.data.quantity
        .increment,
      2,
    );

    assert.equal(
      prismaClient.calls
        .listingUpdate.data.status,
      "ACTIVE",
    );
  },
);

test(
  "cancellation verifies and cancels an attached PaymentIntent",
  async () => {
    const transaction =
      createTransaction({
        status:
          "PAYMENT_PROCESSING",
        paymentIntentId:
          "pi_release_test",
      });

    const prismaClient =
      createFakePrisma({
        transaction,
      });

    const stripeClient =
      createFakeStripe({
        transactionId:
          transaction.id,
      });

    const result =
      await cancelMarketplaceTransactionReservation({
        transactionId:
          transaction.id,
        actorUserId:
          transaction.buyerUserId,
        role: "CONSUMER",
        stripeClient,
        prismaClient:
          prismaClient.client,
      });

    assert.equal(
      stripeClient.calls.retrieve,
      1,
    );

    assert.equal(
      stripeClient.calls.cancel,
      1,
    );

    assert.equal(
      stripeClient.calls.canceledId,
      transaction.paymentIntentId,
    );

    assert.equal(
      result.paymentIntentCanceled,
      true,
    );

    assert.equal(
      prismaClient.calls
        .transactionUpdate.data.metadata
        .reservationRelease
        .paymentIntentStatus,
      "canceled",
    );
  },
);

test(
  "blocks a user who is not the transaction buyer",
  async () => {
    const transaction =
      createTransaction();

    const prismaClient =
      createFakePrisma({
        transaction,
      });

    await expectReleaseError(
      cancelMarketplaceTransactionReservation({
        transactionId:
          transaction.id,
        actorUserId:
          "outside-user",
        role: "CONSUMER",
        prismaClient:
          prismaClient.client,
      }),
      {
        statusCode: 403,
        code:
          "MARKETPLACE_RESERVATION_FORBIDDEN",
        message: /forbidden/i,
      },
    );

    assert.equal(
      prismaClient.calls
        .transactionUpdate,
      null,
    );

    assert.equal(
      prismaClient.calls
        .listingUpdate,
      null,
    );
  },
);

test(
  "blocks reservation release after payment completes",
  async () => {
    const transaction =
      createTransaction({
        status: "PAID",
      });

    const prismaClient =
      createFakePrisma({
        transaction,
      });

    await expectReleaseError(
      cancelMarketplaceTransactionReservation({
        transactionId:
          transaction.id,
        actorUserId:
          transaction.buyerUserId,
        role: "CONSUMER",
        prismaClient:
          prismaClient.client,
      }),
      {
        statusCode: 409,
        code:
          "MARKETPLACE_TRANSACTION_ALREADY_FINALIZED",
        message: /completed/i,
      },
    );

    assert.equal(
      prismaClient.calls
        .databaseTransactions,
      0,
    );
  },
);

test(
  "duplicate cancellation is idempotent and does not restore inventory twice",
  async () => {
    const transaction =
      createTransaction({
        status: "CANCELED",
        canceledAt:
          new Date(
            "2026-07-19T11:00:00.000Z",
          ),
        listing: {
          id: "listing-release-test",
          status: "ACTIVE",
          quantity: 2,
          expiresAt:
            new Date(
              "2026-07-20T10:00:00.000Z",
            ),
        },
      });

    const prismaClient =
      createFakePrisma({
        transaction,
      });

    const result =
      await cancelMarketplaceTransactionReservation({
        transactionId:
          transaction.id,
        actorUserId:
          transaction.buyerUserId,
        role: "CONSUMER",
        prismaClient:
          prismaClient.client,
      });

    assert.equal(result.handled, true);
    assert.equal(result.idempotent, true);

    assert.equal(
      result.quantityRestored,
      0,
    );

    assert.equal(
      prismaClient.calls
        .databaseTransactions,
      0,
    );

    assert.equal(
      prismaClient.calls
        .listingUpdate,
      null,
    );
  },
);

test(
  "system expiration blocks a reservation that is still recent",
  async () => {
    const transaction =
      createTransaction({
        updatedAt:
          new Date(
            "2026-07-19T10:30:00.000Z",
          ),
      });

    const prismaClient =
      createFakePrisma({
        transaction,
      });

    await expectReleaseError(
      expireMarketplaceTransactionReservation({
        transactionId:
          transaction.id,
        expiredBefore:
          new Date(
            "2026-07-19T10:00:00.000Z",
          ),
        prismaClient:
          prismaClient.client,
      }),
      {
        statusCode: 409,
        code:
          "MARKETPLACE_RESERVATION_NOT_EXPIRED",
        message: /has not expired/i,
      },
    );

    assert.equal(
      prismaClient.calls
        .databaseTransactions,
      0,
    );
  },
);

test(
  "system expiration restores inventory and expires an elapsed listing",
  async () => {
    const transaction =
      createTransaction({
        updatedAt:
          new Date(
            "2026-07-19T09:00:00.000Z",
          ),
        listing: {
          id: "listing-release-test",
          status: "RESERVED",
          quantity: 0,
          expiresAt:
            new Date(
              "2026-07-19T10:00:00.000Z",
            ),
        },
      });

    const prismaClient =
      createFakePrisma({
        transaction,
      });

    const result =
      await expireMarketplaceTransactionReservation({
        transactionId:
          transaction.id,
        expiredBefore:
          new Date(
            "2026-07-19T09:30:00.000Z",
          ),
        prismaClient:
          prismaClient.client,
        releasedAt:
          new Date(
            "2026-07-19T11:00:00.000Z",
          ),
      });

    assert.equal(
      result.transactionStatus,
      "CANCELED",
    );

    assert.equal(
      result.listingStatus,
      "EXPIRED",
    );

    assert.equal(
      result.quantityRestored,
      2,
    );

    assert.equal(
      prismaClient.calls
        .listingUpdate.data.status,
      "EXPIRED",
    );

    assert.equal(
      prismaClient.calls
        .transactionUpdate.data.metadata
        .reservationRelease
        .systemRelease,
      true,
    );

    assert.equal(
      prismaClient.calls
        .transactionUpdate.data.metadata
        .reservationRelease
        .releasedByUserId,
      null,
    );
  },
);

test(
  "successful Stripe payment prevents inventory release",
  async () => {
    const transaction =
      createTransaction({
        status:
          "PAYMENT_PROCESSING",
        paymentIntentId:
          "pi_succeeded_release_test",
      });

    const prismaClient =
      createFakePrisma({
        transaction,
      });

    const stripeClient =
      createFakeStripe({
        status: "succeeded",
        transactionId:
          transaction.id,
      });

    await expectReleaseError(
      cancelMarketplaceTransactionReservation({
        transactionId:
          transaction.id,
        actorUserId:
          transaction.buyerUserId,
        role: "CONSUMER",
        stripeClient,
        prismaClient:
          prismaClient.client,
      }),
      {
        statusCode: 409,
        code:
          "MARKETPLACE_PAYMENT_ALREADY_SUCCEEDED",
        message: /cannot be canceled/i,
      },
    );

    assert.equal(
      stripeClient.calls.cancel,
      0,
    );

    assert.equal(
      prismaClient.calls
        .listingUpdate,
      null,
    );
  },
);

test(
  "Stripe retrieval failure prevents uncertain inventory release",
  async () => {
    const transaction =
      createTransaction({
        status:
          "PAYMENT_PROCESSING",
        paymentIntentId:
          "pi_unavailable_release_test",
      });

    const prismaClient =
      createFakePrisma({
        transaction,
      });

    const retrieveError =
      new Error(
        "Stripe connection failed",
      );

    retrieveError.code =
      "api_connection_error";

    const stripeClient =
      createFakeStripe({
        retrieveError,
        transactionId:
          transaction.id,
      });

    await expectReleaseError(
      cancelMarketplaceTransactionReservation({
        transactionId:
          transaction.id,
        actorUserId:
          transaction.buyerUserId,
        role: "CONSUMER",
        stripeClient,
        prismaClient:
          prismaClient.client,
      }),
      {
        statusCode: 502,
        code:
          "api_connection_error",
        message: /unable to verify/i,
      },
    );

    assert.equal(
      stripeClient.calls.cancel,
      0,
    );

    assert.equal(
      prismaClient.calls
        .transactionUpdate,
      null,
    );

    assert.equal(
      prismaClient.calls
        .listingUpdate,
      null,
    );
  },
);
