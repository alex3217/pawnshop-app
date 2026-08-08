import crypto from "node:crypto";
import sharp from "sharp";
import { prisma } from "../lib/prisma.js";
import { canAccessShopWithStaffPermission } from "../middleware/staffAccess.middleware.js";

const SUPPORTED = Object.freeze({
  jpeg: { mimeType: "image/jpeg", extension: "jpg" },
  png: { mimeType: "image/png", extension: "png" },
  webp: { mimeType: "image/webp", extension: "webp" },
});
const ALLOWED_KINDS = new Set(["ITEM_IMAGE", "SHOP_LOGO", "SHOP_BANNER"]);

function httpError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function role(req) {
  return String(req?.user?.role || "").trim().toUpperCase();
}

function userId(req) {
  return String(req?.user?.sub || req?.user?.id || "").trim();
}

async function resolveTarget(req, input) {
  const kind = String(input.kind || "").trim().toUpperCase();
  if (!ALLOWED_KINDS.has(kind)) throw httpError("Unsupported upload kind", 400, "UPLOAD_KIND_UNSUPPORTED");

  let shop;
  let itemId = null;
  if (kind === "ITEM_IMAGE") {
    itemId = String(input.itemId || "").trim();
    if (!itemId) throw httpError("itemId is required", 400, "UPLOAD_ITEM_REQUIRED");
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: { id: true, isDeleted: true, shop: { select: { id: true, ownerId: true, isDeleted: true } } },
    });
    if (!item || item.isDeleted || !item.shop || item.shop.isDeleted) {
      throw httpError("Upload target was not found", 404, "UPLOAD_TARGET_NOT_FOUND");
    }
    shop = item.shop;
  } else {
    const shopId = String(input.shopId || "").trim();
    if (!shopId) throw httpError("shopId is required", 400, "UPLOAD_SHOP_REQUIRED");
    shop = await prisma.pawnShop.findUnique({
      where: { id: shopId },
      select: { id: true, ownerId: true, isDeleted: true },
    });
    if (!shop || shop.isDeleted) throw httpError("Upload target was not found", 404, "UPLOAD_TARGET_NOT_FOUND");
  }

  const requesterRole = role(req);
  const authorized =
    requesterRole === "ADMIN" ||
    requesterRole === "SUPER_ADMIN" ||
    (requesterRole === "OWNER" && shop.ownerId === userId(req)) ||
    canAccessShopWithStaffPermission(req, "inventory:write", shop.id);
  if (!authorized) throw httpError("Forbidden", 403, "UPLOAD_FORBIDDEN");

  return { kind, itemId, shopId: shop.id, ownerId: shop.ownerId };
}

function signatureMatches(buffer, format) {
  if (format === "jpeg") return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (format === "png") return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (format === "webp") return buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

export async function validateAndNormalizeImage(file, limits) {
  if (!file?.buffer?.length) throw httpError("Image file is empty", 400, "UPLOAD_EMPTY_FILE");
  if (file.buffer.length > limits.maxFileBytes) throw httpError("Image exceeds the file size limit", 413, "UPLOAD_FILE_TOO_LARGE");
  if (!new Set(Object.values(SUPPORTED).map((entry) => entry.mimeType)).has(file.mimetype)) {
    throw httpError("Unsupported image type", 415, "UPLOAD_TYPE_UNSUPPORTED");
  }

  let metadata;
  try {
    metadata = await sharp(file.buffer, { failOn: "error", limitInputPixels: limits.maxPixels }).metadata();
  } catch {
    throw httpError("Image is corrupt or unsupported", 400, "UPLOAD_IMAGE_INVALID");
  }
  const supported = SUPPORTED[metadata.format];
  if (!supported || supported.mimeType !== file.mimetype || !signatureMatches(file.buffer, metadata.format)) {
    throw httpError("Image content does not match its declared type", 415, "UPLOAD_SIGNATURE_MISMATCH");
  }
  if (!metadata.width || !metadata.height || metadata.width > limits.maxWidth || metadata.height > limits.maxHeight || metadata.width * metadata.height > limits.maxPixels) {
    throw httpError("Image dimensions exceed the allowed limits", 413, "UPLOAD_DIMENSIONS_TOO_LARGE");
  }

  let pipeline = sharp(file.buffer, { failOn: "error", limitInputPixels: limits.maxPixels }).rotate();
  if (metadata.format === "jpeg") pipeline = pipeline.jpeg({ quality: 88, mozjpeg: true });
  if (metadata.format === "png") pipeline = pipeline.png({ compressionLevel: 9 });
  if (metadata.format === "webp") pipeline = pipeline.webp({ quality: 88 });
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  if (data.length > limits.maxFileBytes) {
    throw httpError("Normalized image exceeds the file size limit", 413, "UPLOAD_FILE_TOO_LARGE");
  }
  return { body: data, mimeType: supported.mimeType, extension: supported.extension, width: info.width, height: info.height, size: data.length };
}

export async function uploadImages({ req, files, input, storage, limits }) {
  if (!Array.isArray(files) || files.length === 0) throw httpError("At least one image is required", 400, "UPLOAD_FILES_REQUIRED");
  if (files.length > limits.maxFiles) throw httpError("Too many images", 413, "UPLOAD_FILE_COUNT_EXCEEDED");
  const aggregate = files.reduce((total, file) => total + Number(file?.size || file?.buffer?.length || 0), 0);
  if (aggregate > limits.maxAggregateBytes) throw httpError("Upload request exceeds the aggregate size limit", 413, "UPLOAD_AGGREGATE_TOO_LARGE");

  const target = await resolveTarget(req, input);
  const created = [];
  try {
    for (const file of files) {
      const normalized = await validateAndNormalizeImage(file, limits);
      const id = crypto.randomUUID();
      const key = `uploads/${id}.${normalized.extension}`;
      const stored = await storage.put({
        key,
        body: normalized.body,
        contentType: normalized.mimeType,
      });
      created.push({ key, file: { id, url: stored.url, mimeType: normalized.mimeType, mimetype: normalized.mimeType, size: normalized.size, kind: target.kind, width: normalized.width, height: normalized.height } });
    }
    return created.map(({ file }) => file);
  } catch (error) {
    await Promise.allSettled(created.map(({ key }) => storage.delete({ key })));
    if (error?.statusCode && error.statusCode < 500) throw error;
    throw httpError("Image storage is temporarily unavailable", 502, "UPLOAD_STORAGE_UNAVAILABLE");
  }
}
