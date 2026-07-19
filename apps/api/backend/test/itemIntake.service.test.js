import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeScanCode,
  recordItemIntakeScan,
} from "../src/services/itemIntake.service.js";

function createFakePrisma(priorIntake = null) {
  const calls = {
    findFirst: null,
    create: null,
  };

  return {
    calls,
    client: {
      itemIntake: {
        async findFirst(args) {
          calls.findFirst = args;
          return priorIntake;
        },

        async create(args) {
          calls.create = args;

          return {
            id: "intake-created-1",
            createdAt:
              new Date("2026-07-17T20:00:00Z"),
            ...args.data,
          };
        },
      },
    },
  };
}

test("analyzeScanCode identifies a UPC", () => {
  const result = analyzeScanCode(
    "012345678905",
  );

  assert.equal(result.codeType, "UPC");
  assert.equal(
    result.normalizedCode,
    "012345678905",
  );
  assert.equal(result.fieldName, "upc");
});

test("analyzeScanCode handles SKU prefixes", () => {
  const result = analyzeScanCode(
    "sku: abc-123",
  );

  assert.equal(result.codeType, "SKU");
  assert.equal(
    result.normalizedCode,
    "ABC-123",
  );
  assert.equal(result.fieldName, "sku");
});

test("recordItemIntakeScan creates a clear intake", async () => {
  const fake = createFakePrisma();

  const result = await recordItemIntakeScan({
    prismaClient: fake.client,
    shopId: "shop-1",
    capturedByUserId: "owner-1",
    code: "012345678905",
    input: {
      source: "CAMERA",
      destination: "SHOP_INVENTORY",
    },
  });

  assert.equal(
    result.intake.status,
    "SCANNED",
  );

  assert.equal(
    result.intake.duplicateStatus,
    "CLEAR",
  );

  assert.equal(
    fake.calls.create.data.upc,
    "012345678905",
  );

  assert.equal(
    fake.calls.create.data.capturedByUserId,
    "owner-1",
  );
});

test("recordItemIntakeScan scopes customer duplicates without a shop", async () => {
  const fake =
    createFakePrisma();

  const result =
    await recordItemIntakeScan({
      prismaClient:
        fake.client,

      shopId:
        null,

      capturedByUserId:
        "buyer-1",

      code:
        "012345678905",

      input: {
        customerId:
          "buyer-1",

        source:
          "CAMERA",

        destination:
          "CUSTOMER_MARKETPLACE",
      },
    });

  assert.equal(
    fake.calls.findFirst.where.shopId,
    null,
  );

  assert.equal(
    fake.calls.findFirst.where.customerId,
    "buyer-1",
  );

  assert.equal(
    fake.calls.create.data.shopId,
    null,
  );

  assert.equal(
    fake.calls.create.data.customerId,
    "buyer-1",
  );

  assert.equal(
    fake.calls.create.data.metadata.workflow,
    "customer-item-scan-v1",
  );

  assert.equal(
    fake.calls.create.data.metadata.duplicateScope,
    "CUSTOMER",
  );

  assert.equal(
    result.intake.status,
    "SCANNED",
  );
});

test("recordItemIntakeScan rejects an unscoped scan", async () => {
  const fake =
    createFakePrisma();

  await assert.rejects(
    () =>
      recordItemIntakeScan({
        prismaClient:
          fake.client,

        shopId:
          null,

        capturedByUserId:
          "unknown-user",

        code:
          "UNSCOPED-100",
      }),

    /shop or customer scan scope is required/i,
  );
});

test("recordItemIntakeScan flags prior intake duplicates", async () => {
  const fake = createFakePrisma({
    id: "intake-existing-1",
    status: "SCANNED",
    normalizedCode: "ABC-123",
    linkedItemId: null,
    createdAt:
      new Date("2026-07-16T20:00:00Z"),
  });

  const result = await recordItemIntakeScan({
    prismaClient: fake.client,
    shopId: "shop-1",
    capturedByUserId: "owner-1",
    code: "SKU: ABC-123",
  });

  assert.equal(
    result.intake.status,
    "NEEDS_REVIEW",
  );

  assert.equal(
    result.intake.duplicateStatus,
    "MATCH_FOUND",
  );

  assert.equal(
    result.duplicateMatches[0].id,
    "intake-existing-1",
  );
});

test("recordItemIntakeScan links existing inventory", async () => {
  const fake = createFakePrisma();

  const result = await recordItemIntakeScan({
    prismaClient: fake.client,
    shopId: "shop-1",
    capturedByUserId: "owner-1",
    code: "BARCODE-999",
    existingItem: {
      id: "item-existing-1",
      title: "Existing Drill",
      description: "Cordless drill",
      price: "75",
      category: "Tools",
      condition: "Good",
      status: "AVAILABLE",
    },
  });

  assert.equal(
    result.intake.linkedItemId,
    "item-existing-1",
  );

  assert.equal(
    result.intake.duplicateStatus,
    "MATCH_FOUND",
  );

  assert.equal(
    result.intake.status,
    "NEEDS_REVIEW",
  );
});
