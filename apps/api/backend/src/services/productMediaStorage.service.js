import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const PRODUCT_IMAGE_MIME_TYPES = Object.freeze(new Set(["image/jpeg", "image/png", "image/webp"]));
export const MAX_PRODUCT_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_PRODUCT_MEDIA_PAYLOAD_BYTES = 60 * 1024 * 1024;

const EXTENSIONS = Object.freeze({ "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" });

export function validateProductImageFile(file) {
  if (!file || !Buffer.isBuffer(file.buffer)) throw Object.assign(new Error("Choose an image file to upload."), { statusCode: 400, code: "PRODUCT_IMAGE_REQUIRED" });
  if (!PRODUCT_IMAGE_MIME_TYPES.has(file.mimetype)) throw Object.assign(new Error("Unsupported image type. Use JPEG, PNG, or WebP. HEIC/HEIF conversion is not available."), { statusCode: 415, code: "UNSUPPORTED_PRODUCT_IMAGE_TYPE", details: { filename: file.originalname || "image", mimeType: file.mimetype || null } });
  if (file.size > MAX_PRODUCT_IMAGE_BYTES) throw Object.assign(new Error("Each product image must be 8 MB or smaller."), { statusCode: 413, code: "PRODUCT_IMAGE_TOO_LARGE", details: { filename: file.originalname || "image", used: file.size, limit: MAX_PRODUCT_IMAGE_BYTES } });
  const bytes = file.buffer;
  const signatureMatches = file.mimetype === "image/jpeg" ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff : file.mimetype === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) : bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (!signatureMatches) throw Object.assign(new Error("The uploaded file contents do not match a supported image type."), { statusCode: 415, code: "INVALID_PRODUCT_IMAGE_CONTENT", details: { filename: file.originalname || "image", mimeType: file.mimetype } });
  return file;
}

function localDirectory() {
  return path.resolve(process.env.PRODUCT_MEDIA_LOCAL_DIRECTORY || "uploads/product-media");
}

export function productMediaStorageStatus() {
  const provider = String(process.env.PRODUCT_MEDIA_STORAGE_PROVIDER || "local-development").trim().toLowerCase();
  return { provider, productionSafe: provider !== "local-development", deploymentBlocker: provider === "local-development" };
}

export async function persistProductImage(file) {
  validateProductImageFile(file);
  const status = productMediaStorageStatus();
  if (status.provider !== "local-development") throw Object.assign(new Error("Configured product media storage provider is not implemented."), { statusCode: 503, code: "PRODUCT_MEDIA_STORAGE_UNAVAILABLE" });
  if (process.env.NODE_ENV === "production") throw Object.assign(new Error("Production product media storage is not configured."), { statusCode: 503, code: "PRODUCT_MEDIA_STORAGE_UNAVAILABLE" });
  const key = `${crypto.randomUUID()}${EXTENSIONS[file.mimetype]}`;
  await fs.mkdir(localDirectory(), { recursive: true });
  await fs.writeFile(path.join(localDirectory(), key), file.buffer, { flag: "wx" });
  return { key, url: `/api/uploads/media/${encodeURIComponent(key)}`, mimeType: file.mimetype, size: file.size, kind: "ITEM_IMAGE", storageProvider: status.provider };
}

export async function readLocalProductImage(key) {
  const safeKey = path.basename(String(key || ""));
  if (!safeKey || safeKey !== key) return null;
  try { return await fs.readFile(path.join(localDirectory(), safeKey)); } catch (error) { if (error?.code === "ENOENT") return null; throw error; }
}
