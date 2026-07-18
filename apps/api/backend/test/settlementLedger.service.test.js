import assert from "node:assert/strict";
import test from "node:test";

import {
  createSettlementCreditLedgerEntry,
} from "../src/services/payouts/settlementLedger.service.js";

function buildPrismaMock({ settlement, existingEntry = null } = {}) {
  const calls = {
    findUnique: [],
    upsert: [],
  };

  return {
    calls,

    settlement: {
      async findUnique(args) {
        calls.findUnique.push(args);
        return settlement;
      },
    },

    sellerBalanceLedger: {
      async upsert(args) {
        calls.upsert.push(args);

        return (
          existingEntry || {
            id: "ledger_1",
            ...args.create,
          }
        );
      },
    },
  };
}

test("creates an available auction settlement credit", async () => {
  const prismaClient = buildPrismaMock({
    settlement: {
      id: "settlement_1",
      auctionId: "auction_1",
      offerId: null,
      status: "CHARGED",
      sellerNetCents: 24_200,
      grossAmountCents: 27_500,
      platformFeeCents: 3_300,
      currency: "USD",
      stripePaymentIntent: "pi_123",
      chargedAt: new Date("2026-07-18T18:00:00.000Z"),
      auction: {
        id: "auction_1",
        shopId: "shop_1",
        shop: {
          id: "shop_1",
          ownerId: "seller_1",
        },
      },
      offer: null,
    },
  });

  const availableAt = new Date("2026-07-20T18:00:00.000Z");

  const result = await createSettlementCreditLedgerEntry({
    settlementId: "settlement_1",
    availableAt,
    prismaClient,
  });

  assert.equal(result.amountCents, 24_200);
  assert.equal(result.sellerUserId, "seller_1");
  assert.equal(result.shopId, "shop_1");

  assert.equal(prismaClient.calls.upsert.length, 1);

  const upsert = prismaClient.calls.upsert[0];

  assert.deepEqual(upsert.where, {
    settlementId_type: {
      settlementId: "settlement_1",
      type: "SETTLEMENT_CREDIT",
    },
  });

  assert.equal(upsert.create.status, "AVAILABLE");
  assert.equal(upsert.create.amountCents, 24_200);
  assert.equal(upsert.create.availableAt, availableAt);
  assert.equal(upsert.create.metadata.sourceType, "AUCTION");
});

test("creates an available offer settlement credit", async () => {
  const prismaClient = buildPrismaMock({
    settlement: {
      id: "settlement_2",
      auctionId: null,
      offerId: "offer_1",
      status: "CHARGED",
      sellerNetCents: 8_500,
      grossAmountCents: 10_000,
      platformFeeCents: 1_500,
      currency: "usd",
      stripePaymentIntent: "pi_offer",
      chargedAt: new Date("2026-07-18T19:00:00.000Z"),
      auction: null,
      offer: {
        id: "offer_1",
        ownerId: "seller_2",
        item: {
          id: "item_1",
          pawnShopId: "shop_2",
        },
      },
    },
  });

  const result = await createSettlementCreditLedgerEntry({
    settlementId: "settlement_2",
    prismaClient,
  });

  assert.equal(result.currency, "USD");
  assert.equal(result.sellerUserId, "seller_2");
  assert.equal(result.shopId, "shop_2");

  const upsert = prismaClient.calls.upsert[0];

  assert.equal(upsert.create.type, "SETTLEMENT_CREDIT");
  assert.equal(upsert.create.metadata.sourceType, "OFFER");
  assert.equal(upsert.create.metadata.sourceId, "offer_1");
});

test("uses an idempotent settlement and type upsert key", async () => {
  const existingEntry = {
    id: "ledger_existing",
    settlementId: "settlement_1",
    type: "SETTLEMENT_CREDIT",
    amountCents: 24_200,
  };

  const prismaClient = buildPrismaMock({
    existingEntry,
    settlement: {
      id: "settlement_1",
      auctionId: "auction_1",
      offerId: null,
      status: "CHARGED",
      sellerNetCents: 24_200,
      grossAmountCents: 27_500,
      platformFeeCents: 3_300,
      currency: "USD",
      stripePaymentIntent: "pi_123",
      chargedAt: new Date(),
      auction: {
        id: "auction_1",
        shopId: "shop_1",
        shop: {
          id: "shop_1",
          ownerId: "seller_1",
        },
      },
      offer: null,
    },
  });

  const first = await createSettlementCreditLedgerEntry({
    settlementId: "settlement_1",
    prismaClient,
  });

  const second = await createSettlementCreditLedgerEntry({
    settlementId: "settlement_1",
    prismaClient,
  });

  assert.equal(first.entry.id, "ledger_existing");
  assert.equal(second.entry.id, "ledger_existing");
  assert.equal(prismaClient.calls.upsert.length, 2);

  for (const call of prismaClient.calls.upsert) {
    assert.deepEqual(call.where, {
      settlementId_type: {
        settlementId: "settlement_1",
        type: "SETTLEMENT_CREDIT",
      },
    });
  }
});

test("rejects a settlement that is not charged", async () => {
  const prismaClient = buildPrismaMock({
    settlement: {
      id: "settlement_pending",
      status: "PENDING",
      sellerNetCents: 1_000,
      auction: null,
      offer: null,
    },
  });

  await assert.rejects(
    createSettlementCreditLedgerEntry({
      settlementId: "settlement_pending",
      prismaClient,
    }),
    /must be CHARGED/,
  );

  assert.equal(prismaClient.calls.upsert.length, 0);
});

test("rejects a settlement without seller proceeds", async () => {
  const prismaClient = buildPrismaMock({
    settlement: {
      id: "settlement_missing_revenue",
      auctionId: "auction_1",
      status: "CHARGED",
      sellerNetCents: null,
      auction: {
        id: "auction_1",
        shopId: "shop_1",
        shop: {
          id: "shop_1",
          ownerId: "seller_1",
        },
      },
      offer: null,
    },
  });

  await assert.rejects(
    createSettlementCreditLedgerEntry({
      settlementId: "settlement_missing_revenue",
      prismaClient,
    }),
    /sellerNetCents must be a positive integer/,
  );
});

test("rejects an unsupported settlement source", async () => {
  const prismaClient = buildPrismaMock({
    settlement: {
      id: "settlement_unknown",
      status: "CHARGED",
      sellerNetCents: 1_000,
      auction: null,
      offer: null,
    },
  });

  await assert.rejects(
    createSettlementCreditLedgerEntry({
      settlementId: "settlement_unknown",
      prismaClient,
    }),
    /not connected to a supported auction or offer/,
  );
});
