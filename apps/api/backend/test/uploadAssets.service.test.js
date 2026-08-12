import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanupStaleUploadAssets,
  deleteUploadAssetForActor,
  reconcileAssetUrls,
  rollbackTemporaryAssets,
} from "../src/services/uploadAssets.service.js";

function asset(overrides = {}) {
  return { id: "asset-1", objectKey: "uploads/random.png", deliveryUrl: "https://assets.invalid/uploads/random.png", uploaderId: "user-1", shopId: "shop-1", itemId: "item-1", status: "TEMPORARY", deleteAfter: new Date(0), ...overrides };
}

test("reconciliation attaches owned assets and denies cross-shop attachment", async () => {
  let row = asset();
  const tx = {
    uploadAsset: {
      findMany: async () => [row],
      updateMany: async ({ data }) => { row = { ...row, ...data }; return { count: 1 }; },
    },
  };
  await reconcileAssetUrls({ tx, shopId: "shop-1", itemId: "item-1", nextUrls: [row.deliveryUrl] });
  assert.equal(row.status, "ATTACHED");
  row = asset({ shopId: "shop-2" });
  await assert.rejects(
    reconcileAssetUrls({ tx, shopId: "shop-1", itemId: "item-1", nextUrls: [row.deliveryUrl] }),
    (error) => error.statusCode === 403,
  );
});

test("replacement marks only the owning shop object for post-commit deletion", async () => {
  const owned = asset({ status: "ATTACHED" });
  const tx = {
    uploadAsset: {
      findMany: async ({ where }) => where.shopId === owned.shopId ? [owned] : [],
      updateMany: async () => ({ count: 1 }),
    },
  };
  const removed = await reconcileAssetUrls({ tx, shopId: "shop-1", itemId: "item-1", previousUrls: [owned.deliveryUrl], nextUrls: [] });
  assert.deepEqual(removed.map(({ id, objectKey }) => ({ id, objectKey })), [{ id: owned.id, objectKey: owned.objectKey }]);
  const crossShop = await reconcileAssetUrls({ tx, shopId: "shop-2", itemId: "item-1", previousUrls: [owned.deliveryUrl], nextUrls: [] });
  assert.deepEqual(crossShop, []);
});

test("database attachment failure rollback deletes newly abandoned temporary objects", async () => {
  const row = asset();
  let status = row.status;
  const deleted = [];
  const prismaClient = {
    uploadAsset: {
      findMany: async () => [{ id: row.id, objectKey: row.objectKey }],
      updateMany: async ({ data }) => { status = data.status || status; return { count: 1 }; },
    },
  };
  const result = await rollbackTemporaryAssets({
    urls: [row.deliveryUrl], shopId: row.shopId, prismaClient,
    storage: { delete: async ({ key }) => deleted.push(key) },
  });
  assert.equal(status, "DELETED");
  assert.deepEqual(deleted, [row.objectKey]);
  assert.equal(result[0].deleted, true);
});

test("cross-user deletion is denied and attached objects require owning-record removal", async () => {
  const prismaClient = { uploadAsset: { findFirst: async ({ where }) => where.uploaderId === "user-1" ? asset({ status: "ATTACHED" }) : null } };
  await assert.rejects(deleteUploadAssetForActor({ assetId: "asset-1", actorId: "user-2", storage: {}, prismaClient }), (error) => error.statusCode === 404);
  await assert.rejects(deleteUploadAssetForActor({ assetId: "asset-1", actorId: "user-1", storage: {}, prismaClient }), (error) => error.statusCode === 409);
});

test("orphan cleanup is idempotent and provider failures stay retryable", async () => {
  let row = asset();
  let providerCalls = 0;
  const prismaClient = {
    uploadAsset: {
      findMany: async () => row.status === "DELETED" ? [] : [{ id: row.id, objectKey: row.objectKey, status: row.status }],
      updateMany: async ({ where, data }) => {
        if (where.status && row.status !== where.status) return { count: 0 };
        row = { ...row, ...data };
        return { count: 1 };
      },
    },
  };
  const first = await cleanupStaleUploadAssets({ prismaClient, now: new Date(1), storage: { delete: async () => { providerCalls += 1; } } });
  const second = await cleanupStaleUploadAssets({ prismaClient, now: new Date(1), storage: { delete: async () => { providerCalls += 1; } } });
  assert.deepEqual(first, { examined: 1, deleted: 1, failed: 0 });
  assert.deepEqual(second, { examined: 0, deleted: 0, failed: 0 });
  assert.equal(providerCalls, 1);
});
