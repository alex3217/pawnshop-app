import assert from "node:assert/strict";
import test from "node:test";

import {
  getMarketplaceReservationSchedulerConfig,
  runMarketplaceReservationSchedulerTick,
  startMarketplaceReservationScheduler,
  stopMarketplaceReservationScheduler,
} from "../src/services/marketplaceTransactionReservationScheduler.service.js";

const ENV_KEYS = [
  "MARKETPLACE_RESERVATION_SCHEDULER_ENABLED",
  "MARKETPLACE_RESERVATION_SCHEDULER_INTERVAL_MS",
  "MARKETPLACE_RESERVATION_SCHEDULER_BATCH_SIZE",
  "MARKETPLACE_RESERVATION_TTL_MINUTES",
];

function saveEnvironment() {
  return Object.fromEntries(
    ENV_KEYS.map((key) => [
      key,
      process.env[key],
    ]),
  );
}

function restoreEnvironment(snapshot) {
  for (const key of ENV_KEYS) {
    if (snapshot[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] =
        snapshot[key];
    }
  }
}

function createTransaction(
  id,
  overrides = {},
) {
  return {
    id,
    listingId: `listing-${id}`,
    buyerUserId: `buyer-${id}`,
    status: "PENDING",
    quantity: 2,
    paymentIntentId: null,
    fulfillmentStatus:
      "PAYMENT_PENDING",
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
        "2026-07-19T11:00:00.000Z",
      ),
    listing: {
      id: `listing-${id}`,
      status: "RESERVED",
      quantity: 0,
      expiresAt:
        new Date(
          "2026-07-20T12:00:00.000Z",
        ),
    },
    ...overrides,
  };
}

function createFakePrisma({
  candidateIds = [],
  transactions = {},
  findUniqueErrors = {},
} = {}) {
  const calls = {
    findMany: null,
    findUniqueIds: [],
    databaseTransactions: 0,
    transactionUpdates: [],
    listingUpdates: [],
  };

  const client = {
    marketplaceTransaction: {
      async findMany(parameters) {
        calls.findMany =
          parameters;

        return candidateIds.map(
          (id) => ({
            id,
          }),
        );
      },

      async findUnique({
        where,
      }) {
        calls.findUniqueIds.push(
          where.id,
        );

        if (
          findUniqueErrors[
            where.id
          ]
        ) {
          throw findUniqueErrors[
            where.id
          ];
        }

        return (
          transactions[
            where.id
          ] || null
        );
      },

      async updateMany(parameters) {
        calls.transactionUpdates.push(
          parameters,
        );

        return {
          count: 1,
        };
      },
    },

    marketplaceListing: {
      async updateMany(parameters) {
        calls.listingUpdates.push(
          parameters,
        );

        return {
          count: 1,
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

const quietLogger = {
  log() {},
  error() {},
};

test(
  "reads scheduler configuration and caps the batch size",
  () => {
    const previous =
      saveEnvironment();

    try {
      process.env
        .MARKETPLACE_RESERVATION_SCHEDULER_INTERVAL_MS =
        "2500";

      process.env
        .MARKETPLACE_RESERVATION_SCHEDULER_BATCH_SIZE =
        "999";

      process.env
        .MARKETPLACE_RESERVATION_TTL_MINUTES =
        "45";

      const config =
        getMarketplaceReservationSchedulerConfig();

      assert.equal(
        config.intervalMs,
        2500,
      );

      assert.equal(
        config.batchSize,
        100,
      );

      assert.equal(
        config.reservationTtlMinutes,
        45,
      );
    } finally {
      restoreEnvironment(
        previous,
      );
    }
  },
);

test(
  "returns an empty summary when no stale reservations exist",
  async () => {
    const previous =
      saveEnvironment();

    try {
      process.env
        .MARKETPLACE_RESERVATION_TTL_MINUTES =
        "30";

      const prismaClient =
        createFakePrisma();

      const result =
        await runMarketplaceReservationSchedulerTick({
          now:
            new Date(
              "2026-07-19T12:00:00.000Z",
            ),
          prismaClient:
            prismaClient.client,
          logger:
            quietLogger,
        });

      assert.equal(
        result.scanned,
        0,
      );

      assert.equal(
        result.released,
        0,
      );

      assert.equal(
        result.unchanged,
        0,
      );

      assert.equal(
        result.failed,
        0,
      );

      assert.equal(
        result.cutoff,
        "2026-07-19T11:30:00.000Z",
      );

      assert.deepEqual(
        prismaClient.calls
          .findMany.where.status.in,
        [
          "PENDING",
          "PAYMENT_PROCESSING",
        ],
      );
    } finally {
      restoreEnvironment(
        previous,
      );
    }
  },
);

test(
  "releases a stale reservation and restores exact inventory",
  async () => {
    const previous =
      saveEnvironment();

    try {
      process.env
        .MARKETPLACE_RESERVATION_TTL_MINUTES =
        "30";

      const transaction =
        createTransaction(
          "scheduler-release",
        );

      const prismaClient =
        createFakePrisma({
          candidateIds: [
            transaction.id,
          ],
          transactions: {
            [transaction.id]:
              transaction,
          },
        });

      const result =
        await runMarketplaceReservationSchedulerTick({
          now:
            new Date(
              "2026-07-19T12:00:00.000Z",
            ),
          prismaClient:
            prismaClient.client,
          logger:
            quietLogger,
        });

      assert.equal(
        result.scanned,
        1,
      );

      assert.equal(
        result.released,
        1,
      );

      assert.equal(
        result.unchanged,
        0,
      );

      assert.equal(
        result.failed,
        0,
      );

      assert.equal(
        prismaClient.calls
          .transactionUpdates[0]
          .data.status,
        "CANCELED",
      );

      assert.equal(
        prismaClient.calls
          .listingUpdates[0]
          .data.quantity.increment,
        2,
      );

      assert.equal(
        prismaClient.calls
          .listingUpdates[0]
          .data.status,
        "ACTIVE",
      );
    } finally {
      restoreEnvironment(
        previous,
      );
    }
  },
);

test(
  "counts an already-canceled reservation as unchanged",
  async () => {
    const previous =
      saveEnvironment();

    try {
      process.env
        .MARKETPLACE_RESERVATION_TTL_MINUTES =
        "30";

      const transaction =
        createTransaction(
          "scheduler-idempotent",
          {
            status: "CANCELED",
            canceledAt:
              new Date(
                "2026-07-19T11:15:00.000Z",
              ),
            listing: {
              id:
                "listing-scheduler-idempotent",
              status: "ACTIVE",
              quantity: 2,
              expiresAt:
                new Date(
                  "2026-07-20T12:00:00.000Z",
                ),
            },
          },
        );

      const prismaClient =
        createFakePrisma({
          candidateIds: [
            transaction.id,
          ],
          transactions: {
            [transaction.id]:
              transaction,
          },
        });

      const result =
        await runMarketplaceReservationSchedulerTick({
          now:
            new Date(
              "2026-07-19T12:00:00.000Z",
            ),
          prismaClient:
            prismaClient.client,
          logger:
            quietLogger,
        });

      assert.equal(
        result.scanned,
        1,
      );

      assert.equal(
        result.released,
        0,
      );

      assert.equal(
        result.unchanged,
        1,
      );

      assert.equal(
        prismaClient.calls
          .listingUpdates.length,
        0,
      );
    } finally {
      restoreEnvironment(
        previous,
      );
    }
  },
);

test(
  "treats a transaction removed during the tick as unchanged",
  async () => {
    const previous =
      saveEnvironment();

    try {
      process.env
        .MARKETPLACE_RESERVATION_TTL_MINUTES =
        "30";

      const prismaClient =
        createFakePrisma({
          candidateIds: [
            "scheduler-missing",
          ],
        });

      const result =
        await runMarketplaceReservationSchedulerTick({
          now:
            new Date(
              "2026-07-19T12:00:00.000Z",
            ),
          prismaClient:
            prismaClient.client,
          logger:
            quietLogger,
        });

      assert.equal(
        result.scanned,
        1,
      );

      assert.equal(
        result.released,
        0,
      );

      assert.equal(
        result.unchanged,
        1,
      );

      assert.equal(
        result.failed,
        0,
      );
    } finally {
      restoreEnvironment(
        previous,
      );
    }
  },
);

test(
  "records an unexpected candidate failure and continues processing",
  async () => {
    const previous =
      saveEnvironment();

    try {
      process.env
        .MARKETPLACE_RESERVATION_TTL_MINUTES =
        "30";

      const successful =
        createTransaction(
          "scheduler-good",
        );

      const prismaClient =
        createFakePrisma({
          candidateIds: [
            "scheduler-failed",
            successful.id,
          ],
          transactions: {
            [successful.id]:
              successful,
          },
          findUniqueErrors: {
            "scheduler-failed":
              new Error(
                "Database read failed",
              ),
          },
        });

      const result =
        await runMarketplaceReservationSchedulerTick({
          now:
            new Date(
              "2026-07-19T12:00:00.000Z",
            ),
          prismaClient:
            prismaClient.client,
          logger:
            quietLogger,
        });

      assert.equal(
        result.scanned,
        2,
      );

      assert.equal(
        result.released,
        1,
      );

      assert.equal(
        result.failed,
        1,
      );

      assert.equal(
        prismaClient.calls
          .listingUpdates.length,
        1,
      );
    } finally {
      restoreEnvironment(
        previous,
      );
    }
  },
);

test(
  "an invalid date releases the tick lock for the next run",
  async () => {
    const prismaClient =
      createFakePrisma();

    await assert.rejects(
      runMarketplaceReservationSchedulerTick({
        now:
          "not-a-valid-date",
        prismaClient:
          prismaClient.client,
        logger:
          quietLogger,
      }),
      /date is invalid/i,
    );

    const nextResult =
      await runMarketplaceReservationSchedulerTick({
        now:
          new Date(
            "2026-07-19T12:00:00.000Z",
          ),
        prismaClient:
          prismaClient.client,
        logger:
          quietLogger,
      });

    assert.equal(
      nextResult.skipped,
      false,
    );
  },
);

test(
  "disabled scheduler startup does not create a timer or query the database",
  () => {
    const previous =
      saveEnvironment();

    const prismaClient =
      createFakePrisma();

    try {
      process.env
        .MARKETPLACE_RESERVATION_SCHEDULER_ENABLED =
        "false";

      const timer =
        startMarketplaceReservationScheduler({
          prismaClient:
            prismaClient.client,
          logger:
            quietLogger,
        });

      assert.equal(
        timer,
        null,
      );

      assert.equal(
        prismaClient.calls
          .findMany,
        null,
      );
    } finally {
      stopMarketplaceReservationScheduler({
        logger:
          quietLogger,
      });

      restoreEnvironment(
        previous,
      );
    }
  },
);
