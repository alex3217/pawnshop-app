import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanupStaleUploadAssets,
  deleteUploadAssetForActor,
  deleteTrackedAssets,
  lockItemImagesForUpdate,
  lockShopBrandingForUpdate,
  reconcileAssetUrls,
  rollbackTemporaryAssets,
} from "../src/services/uploadAssets.service.js";

function asset(overrides = {}) {
  return { id: "asset-1", objectKey: "uploads/random.png", deliveryUrl: "https://assets.invalid/uploads/random.png", uploaderId: "user-1", shopId: "shop-1", itemId: "item-1", status: "TEMPORARY", deleteAfter: new Date(0), ...overrides };
}

test("reconciliation attaches owned assets and denies cross-shop attachment", async () => {
  let row = asset();
  const tx = {
    $queryRaw: async () => [row],
    uploadAsset: {
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

test("strict reconciliation rejects arbitrary unmanaged URLs", async () => {
  await assert.rejects(
    reconcileAssetUrls({ tx: { $queryRaw: async () => [] }, shopId: "shop-1", itemId: "item-1", nextUrls: ["https://unmanaged.invalid/image.png"], requireManaged: true }),
    (error) => error.statusCode === 400 && /managed upload assets/.test(error.message),
  );
});

test("replacement marks only the owning shop object for post-commit deletion", async () => {
  const owned = asset({ status: "ATTACHED" });
  const tx = {
    $queryRaw: async (_strings, url) => url === owned.deliveryUrl ? [owned] : [],
    uploadAsset: {
      updateMany: async ({ where }) => ({ count: where.id?.in?.includes(owned.id) ? 1 : 0 }),
    },
  };
  const removed = await reconcileAssetUrls({ tx, shopId: "shop-1", itemId: "item-1", previousUrls: [owned.deliveryUrl], nextUrls: [] });
  assert.deepEqual(removed.map(({ id, objectKey }) => ({ id, objectKey })), [{ id: owned.id, objectKey: owned.objectKey }]);
  const crossShop = await reconcileAssetUrls({ tx, shopId: "shop-2", itemId: "item-1", previousUrls: [owned.deliveryUrl], nextUrls: [] });
  assert.deepEqual(crossShop, []);
});

test("attachment fails closed if the locked asset cannot be transitioned", async () => {
  const row = asset();
  await assert.rejects(
    reconcileAssetUrls({
      tx: {
        $queryRaw: async () => [row],
        uploadAsset: { updateMany: async () => ({ count: 0 }) },
      },
      shopId: row.shopId,
      itemId: row.itemId,
      nextUrls: [row.deliveryUrl],
    }),
    (error) => error.statusCode === 409,
  );
});

test("database attachment failure rollback deletes newly abandoned temporary objects", async () => {
  const row = asset();
  let status = row.status;
  const deleted = [];
  const prismaClient = {
    uploadAsset: {
      findMany: async () => [{ id: row.id, objectKey: row.objectKey }],
      findUnique: async () => ({ ...row, status }),
      updateMany: async ({ data }) => { status = data.status || status; return { count: 1 }; },
    },
    pawnShop: { findFirst: async () => null },
    item: { findFirst: async () => null },
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
      findUnique: async () => row,
      updateMany: async ({ where, data }) => {
        if (where.status && row.status !== where.status) return { count: 0 };
        row = { ...row, ...data };
        return { count: 1 };
      },
    },
    pawnShop: { findFirst: async () => null },
    item: { findFirst: async () => null },
  };
  const first = await cleanupStaleUploadAssets({ prismaClient, now: new Date(1), storage: { delete: async () => { providerCalls += 1; } } });
  const second = await cleanupStaleUploadAssets({ prismaClient, now: new Date(1), storage: { delete: async () => { providerCalls += 1; } } });
  assert.deepEqual(first, { examined: 1, deleted: 1, failed: 0 });
  assert.deepEqual(second, { examined: 0, deleted: 0, failed: 0 });
  assert.equal(providerCalls, 1);
});

test("branding replacements reconcile from serialized transaction-time state", async () => {
  const shop = { id: "shop-1", logoUrl: "old-logo", bannerUrl: "old-banner", isDeleted: false };
  const removed = [];
  let tail = Promise.resolve();
  const prismaClient = {
    $transaction(callback) {
      const run = tail.then(() => callback({
        $queryRaw: async (strings, url) => strings.join("").includes('FROM "PawnShop"')
          ? [{ ...shop }]
          : [asset({ id: url, deliveryUrl: url, objectKey: url, itemId: null, status: "ATTACHED" })],
        pawnShop: { update: async ({ data }) => Object.assign(shop, data) },
        uploadAsset: {
          updateMany: async ({ where }) => ({ count: where.deliveryUrl?.in?.length || where.id?.in?.length || 0 }),
        },
      }));
      tail = run.catch(() => {});
      return run;
    },
  };
  const replace = (data) => prismaClient.$transaction(async (tx) => {
    const previous = await lockShopBrandingForUpdate(tx, shop.id);
    const next = await tx.pawnShop.update({ data });
    removed.push(...await reconcileAssetUrls({
      tx,
      shopId: shop.id,
      previousUrls: [previous.logoUrl, previous.bannerUrl],
      nextUrls: [next.logoUrl, next.bannerUrl],
    }));
  });

  await Promise.all([replace({ logoUrl: "logo-a" }), replace({ logoUrl: "logo-b" })]);
  await Promise.all([replace({ logoUrl: "logo-c" }), replace({ bannerUrl: "banner-c" })]);
  assert.deepEqual({ logoUrl: shop.logoUrl, bannerUrl: shop.bannerUrl }, { logoUrl: "logo-c", bannerUrl: "banner-c" });
  assert.equal(removed.some(({ objectKey }) => objectKey === "logo-c" || objectKey === "banner-c"), false);
});

test("item replacements use the locked current images and preserve the winning object", async () => {
  const itemRow = { id: "item-1", pawnShopId: "shop-1", images: ["old"], isDeleted: false };
  let tail = Promise.resolve();
  const removed = [];
  const replace = (images) => {
    const run = tail.then(async () => {
      const tx = {
        $queryRaw: async (strings, url) => strings.join("").includes('FROM "Item"')
          ? [{ ...itemRow, images: [...itemRow.images] }]
          : [asset({ id: url, deliveryUrl: url, objectKey: url, status: "ATTACHED" })],
        uploadAsset: {
          updateMany: async ({ where }) => ({ count: where.deliveryUrl?.in?.length || where.id?.in?.length || 0 }),
        },
      };
      const previous = await lockItemImagesForUpdate(tx, itemRow.id);
      itemRow.images = images;
      removed.push(...await reconcileAssetUrls({ tx, shopId: itemRow.pawnShopId, itemId: itemRow.id, previousUrls: previous.images, nextUrls: itemRow.images }));
    });
    tail = run.catch(() => {});
    return run;
  };
  await Promise.all([replace(["image-a"]), replace(["image-b"])]);
  assert.deepEqual(itemRow.images, ["image-b"]);
  assert.equal(removed.some(({ objectKey }) => objectKey === "image-b"), false);
});

test("post-commit deletion rechecks references and never deletes a reattached object", async () => {
  let status = "DELETE_PENDING";
  let providerCalls = 0;
  const row = asset({ status });
  const result = await deleteTrackedAssets({
    assets: [row],
    storage: { delete: async () => { providerCalls += 1; } },
    logger: { warn() {}, error() {} },
    prismaClient: {
      uploadAsset: {
        findUnique: async () => ({ ...row, status }),
        updateMany: async ({ data }) => { status = data.status; return { count: 1 }; },
      },
      pawnShop: { findFirst: async () => null },
      item: { findFirst: async () => ({ id: row.itemId }) },
    },
  });
  assert.equal(providerCalls, 0);
  assert.equal(status, "ATTACHED");
  assert.deepEqual(result, [{ id: row.id, deleted: false, skipped: true }]);
});
