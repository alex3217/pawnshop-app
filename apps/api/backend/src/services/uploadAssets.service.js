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

export async function reconcileAssetUrls({ tx, shopId, itemId = null, previousUrls = [], nextUrls = [] }) {
  const previous = new Set(previousUrls.filter(Boolean));
  const next = new Set(nextUrls.filter(Boolean));
  const added = [...next].filter((url) => !previous.has(url));
  const removed = [...previous].filter((url) => !next.has(url));

  if (added.length) {
    const assets = await tx.uploadAsset.findMany({ where: { deliveryUrl: { in: added } } });
    const byUrl = new Map(assets.map((asset) => [asset.deliveryUrl, asset]));
    for (const url of added) {
      const asset = byUrl.get(url);
      if (!asset) continue; // Existing externally hosted images remain supported.
      if (asset.shopId !== shopId || (itemId && asset.itemId !== itemId) || !["TEMPORARY", "ATTACHED"].includes(asset.status)) {
        const error = new Error("Uploaded image does not belong to this resource");
        error.statusCode = 403;
        throw error;
      }
    }
    await tx.uploadAsset.updateMany({
      where: { deliveryUrl: { in: added }, shopId, ...(itemId ? { itemId } : {}), status: { in: ["TEMPORARY", "ATTACHED"] } },
      data: { status: "ATTACHED", attachedAt: new Date(), deleteAfter: null, lastError: null },
    });
  }

  if (!removed.length) return [];
  const owned = await tx.uploadAsset.findMany({
    where: { deliveryUrl: { in: removed }, shopId, ...(itemId ? { itemId } : {}), status: { in: ["TEMPORARY", "ATTACHED"] } },
    select: { id: true, objectKey: true },
  });
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
      await storage.delete({ key: asset.objectKey });
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
    failed: results.filter(({ deleted }) => !deleted).length,
  };
}
