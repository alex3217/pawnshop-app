import { prisma } from "../lib/prisma.js";

const TEMPORARY_TTL_MS = 24 * 60 * 60 * 1000;

function safeReason(error) {
  return String(error?.name || "StorageError").slice(0, 80);
}

function log(logger, level, event, details = {}) {
  logger[level]?.("[upload-assets]", { event, ...details });
}

export async function recordUploadedAsset({ id, target, uploaderId, key, url, kind, prismaClient = prisma }) {
  return prismaClient.uploadAsset.create({
    data: {
      id,
      objectKey: key,
      deliveryUrl: url,
      kind,
      uploaderId,
      shopId: target.shopId,
      itemId: target.itemId || null,
      deleteAfter: new Date(Date.now() + TEMPORARY_TTL_MS),
    },
  });
}

export async function lockShopBrandingForUpdate(tx, shopId) {
  const rows = await tx.$queryRaw`
    SELECT "id", "logoUrl", "bannerUrl", "isDeleted"
    FROM "PawnShop"
    WHERE "id" = ${shopId}
    FOR UPDATE
  `;
  return rows?.[0] || null;
}

export async function lockItemImagesForUpdate(tx, itemId) {
  const rows = await tx.$queryRaw`
    SELECT "id", "pawnShopId", "images", "isDeleted"
    FROM "Item"
    WHERE "id" = ${itemId}
    FOR UPDATE
  `;
  return rows?.[0] || null;
}

async function lockUploadAssetByUrl(tx, deliveryUrl) {
  const rows = await tx.$queryRaw`
    SELECT "id", "objectKey", "deliveryUrl", "uploaderId", "shopId", "itemId", "status"
    FROM "UploadAsset"
    WHERE "deliveryUrl" = ${deliveryUrl}
    FOR UPDATE
  `;
  return rows?.[0] || null;
}

async function lockUploadAssetsByUrl(tx, urls) {
  const assets = [];
  for (const url of [...urls].sort()) {
    const asset = await lockUploadAssetByUrl(tx, url);
    if (asset) assets.push(asset);
  }
  return assets;
}

export async function deleteUploadAssetForActor({ assetId, actorId, shopId, storage, prismaClient = prisma, logger = console, requestId }) {
  const asset = await prismaClient.uploadAsset.findFirst({
    where: { id: assetId, uploaderId: actorId, ...(shopId ? { shopId } : {}), status: { in: ["TEMPORARY", "ATTACHED", "DELETE_PENDING"] } },
    select: { id: true, objectKey: true, status: true },
  });
  if (!asset) {
    const error = new Error("Upload asset not found");
    error.statusCode = 404;
    throw error;
  }
  if (asset.status === "ATTACHED") {
    const error = new Error("Attached images must be removed from their owning record");
    error.statusCode = 409;
    throw error;
  }
  if (asset.status !== "DELETE_PENDING") {
    await prismaClient.uploadAsset.updateMany({ where: { id: asset.id, status: "TEMPORARY" }, data: { status: "DELETE_PENDING", deleteAfter: new Date() } });
  }
  return deleteTrackedAssets({ assets: [asset], storage, prismaClient, logger, requestId });
}

export async function reconcileAssetUrls({ tx, shopId, itemId = null, uploaderId = null, previousUrls = [], nextUrls = [], requireManaged = false }) {
  const previous = new Set((previousUrls || []).filter(Boolean));
  const next = new Set((nextUrls || []).filter(Boolean));
  const added = [...next].filter((url) => !previous.has(url));
  const removed = [...previous].filter((url) => !next.has(url));

  if (added.length) {
    const assets = await lockUploadAssetsByUrl(tx, added);
    const byUrl = new Map(assets.map((asset) => [asset.deliveryUrl, asset]));
    for (const url of added) {
      const asset = byUrl.get(url);
      if (!asset) {
        if (requireManaged) {
          const error = new Error("Images must reference managed upload assets");
          error.statusCode = 400;
          throw error;
        }
        continue; // Existing externally hosted images remain supported by legacy owner flows.
      }
      if (asset.shopId !== shopId || (itemId && asset.itemId !== itemId) || (uploaderId && asset.uploaderId !== uploaderId) || !["TEMPORARY", "ATTACHED"].includes(asset.status)) {
        const error = new Error("Uploaded image does not belong to this resource");
        error.statusCode = 403;
        throw error;
      }
    }
    const attached = await tx.uploadAsset.updateMany({
      where: { deliveryUrl: { in: added }, shopId, ...(itemId ? { itemId } : {}), ...(uploaderId ? { uploaderId } : {}), status: { in: ["TEMPORARY", "ATTACHED"] } },
      data: { status: "ATTACHED", attachedAt: new Date(), deleteAfter: null, lastError: null },
    });
    if (attached.count !== assets.length) {
      const error = new Error("Uploaded image state changed before attachment");
      error.statusCode = 409;
      throw error;
    }
  }

  if (!removed.length) return [];
  const owned = (await lockUploadAssetsByUrl(tx, removed))
    .filter((asset) => asset && asset.shopId === shopId && (!itemId || asset.itemId === itemId) && ["TEMPORARY", "ATTACHED"].includes(asset.status))
    .map(({ id, objectKey }) => ({ id, objectKey }));
  if (owned.length) {
    await tx.uploadAsset.updateMany({
      where: { id: { in: owned.map(({ id }) => id) } },
      data: { status: "DELETE_PENDING", deleteAfter: new Date(), lastError: null },
    });
  }
  return owned;
}

export async function deleteTrackedAssets({ assets, storage, prismaClient = prisma, logger = console, requestId }) {
  const results = [];
  for (const asset of assets) {
    try {
      const current = await prismaClient.uploadAsset.findUnique({
        where: { id: asset.id },
        select: { id: true, objectKey: true, deliveryUrl: true, shopId: true, itemId: true, status: true },
      });
      if (!current || current.status !== "DELETE_PENDING") {
        results.push({ id: asset.id, deleted: false, skipped: true });
        continue;
      }

      const [brandingReference, itemReference] = await Promise.all([
        prismaClient.pawnShop.findFirst({
          where: {
            id: current.shopId,
            isDeleted: false,
            OR: [{ logoUrl: current.deliveryUrl }, { bannerUrl: current.deliveryUrl }],
          },
          select: { id: true },
        }),
        current.itemId
          ? prismaClient.item.findFirst({
              where: { id: current.itemId, isDeleted: false, images: { has: current.deliveryUrl } },
              select: { id: true },
            })
          : null,
      ]);
      if (brandingReference || itemReference) {
        await prismaClient.uploadAsset.updateMany({
          where: { id: current.id, status: "DELETE_PENDING" },
          data: { status: "ATTACHED", deleteAfter: null, lastError: null },
        });
        log(logger, "warn", "delete_skipped_referenced", { requestId, assetId: current.id });
        results.push({ id: current.id, deleted: false, skipped: true });
        continue;
      }

      await storage.delete({ key: current.objectKey });
      await prismaClient.uploadAsset.updateMany({
        where: { id: asset.id, status: "DELETE_PENDING" },
        data: { status: "DELETED", deletedAt: new Date(), lastError: null },
      });
      results.push({ id: asset.id, deleted: true });
    } catch (error) {
      await prismaClient.uploadAsset.updateMany({
        where: { id: asset.id, status: "DELETE_PENDING" },
        data: { lastError: safeReason(error) },
      }).catch(() => {});
      log(logger, "error", "delete_failed", { requestId, assetId: asset.id, reason: safeReason(error) });
      results.push({ id: asset.id, deleted: false });
    }
  }
  return results;
}

export async function rollbackTemporaryAssets({ urls, shopId, storage, prismaClient = prisma, logger = console, requestId }) {
  const assets = await prismaClient.uploadAsset.findMany({
    where: { deliveryUrl: { in: urls.filter(Boolean) }, shopId, status: "TEMPORARY" },
    select: { id: true, objectKey: true },
  });
  if (!assets.length) return [];
  await prismaClient.uploadAsset.updateMany({
    where: { id: { in: assets.map(({ id }) => id) }, status: "TEMPORARY" },
    data: { status: "DELETE_PENDING", deleteAfter: new Date() },
  });
  return deleteTrackedAssets({ assets, storage, prismaClient, logger, requestId });
}

export async function cleanupStaleUploadAssets({ storage, prismaClient = prisma, logger = console, now = new Date(), limit = 100 } = {}) {
  const candidates = await prismaClient.uploadAsset.findMany({
    where: {
      OR: [
        { status: "TEMPORARY", deleteAfter: { lte: now } },
        { status: "DELETE_PENDING", deleteAfter: { lte: now } },
      ],
    },
    orderBy: { deleteAfter: "asc" },
    take: limit,
    select: { id: true, objectKey: true, status: true },
  });
  const claimed = [];
  for (const candidate of candidates) {
    const result = await prismaClient.uploadAsset.updateMany({
      where: { id: candidate.id, status: candidate.status, deleteAfter: { lte: now } },
      data: { status: "DELETE_PENDING", deleteAfter: new Date(now.getTime() + 5 * 60 * 1000) },
    });
    if (result.count === 1) claimed.push(candidate);
  }
  const results = await deleteTrackedAssets({ assets: claimed, storage, prismaClient, logger });
  return {
    examined: candidates.length,
    deleted: results.filter(({ deleted }) => deleted).length,
    failed: results.filter(({ deleted, skipped }) => !deleted && !skipped).length,
  };
}
