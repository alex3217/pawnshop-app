import express from "express";
import multer from "multer";
import { authRequired, requireRole } from "../middleware/auth.js";
import { MAX_PRODUCT_IMAGE_BYTES, MAX_PRODUCT_MEDIA_PAYLOAD_BYTES, persistProductImage, productMediaStorageStatus, readLocalProductImage, validateProductImageFile } from "../services/productMediaStorage.service.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PRODUCT_IMAGE_BYTES, files: 30, fieldSize: MAX_PRODUCT_MEDIA_PAYLOAD_BYTES } });
const allowed = [authRequired, requireRole("CONSUMER", "OWNER", "ADMIN", "SUPER_ADMIN")];

export function sendError(res, error) {
  if (error instanceof multer.MulterError) {
    const responses = {
      LIMIT_FILE_SIZE: [413, "Each product image must be 8 MB or smaller."],
      LIMIT_FILE_COUNT: [413, "A maximum of 30 product images may be uploaded at once."],
      LIMIT_FIELD_VALUE: [413, "The multipart upload exceeds the allowed request limits."],
      LIMIT_FIELD_COUNT: [413, "The multipart upload exceeds the allowed request limits."],
      LIMIT_PART_COUNT: [413, "The multipart upload exceeds the allowed request limits."],
      LIMIT_UNEXPECTED_FILE: [400, "The multipart upload contains an unexpected file field."],
    };
    const [status, message] = responses[error.code] || [400, "The multipart upload is invalid."];
    return res.status(status).json({ success: false, error: message, code: error.code });
  }

  if (Number.isInteger(error?.statusCode)) {
    return res.status(error.statusCode).json({ success: false, error: error.message, ...(error?.code ? { code: error.code } : {}), ...(error?.details ? { details: error.details } : {}) });
  }

  return res.status(500).json({ success: false, error: "Product image upload failed." });
}

export function parseProductImages(req, res, next) {
  upload.any()(req, res, (error) => error ? sendError(res, error) : next());
}

router.get("/media/:key", async (req, res) => {
  try { const file = await readLocalProductImage(req.params.key); if (!file) return res.status(404).json({ success: false, error: "Image not found" }); const extension = req.params.key.split(".").pop(); res.type(extension === "jpg" ? "jpeg" : extension); res.set("Cache-Control", "public, max-age=31536000, immutable"); return res.send(file); } catch (error) { return sendError(res, error); }
});

router.get("/storage-status", ...allowed, (_req, res) => res.json({ success: true, ...productMediaStorageStatus() }));

router.post("/", ...allowed, parseProductImages, async (req, res) => {
  try { const file = req.files?.[0]; validateProductImageFile(file); const stored = await persistProductImage(file); return res.status(201).json({ success: true, file: stored }); } catch (error) { return sendError(res, error); }
});

router.post("/bulk", ...allowed, parseProductImages, async (req, res) => {
  try { const files = req.files || []; if (!files.length) throw Object.assign(new Error("Choose one or more images to upload."), { statusCode: 400, code: "PRODUCT_IMAGE_REQUIRED" }); const total = files.reduce((sum, file) => sum + file.size, 0); if (total > MAX_PRODUCT_MEDIA_PAYLOAD_BYTES) throw Object.assign(new Error("The total image upload must be 60 MB or smaller."), { statusCode: 413, code: "PRODUCT_MEDIA_PAYLOAD_TOO_LARGE" }); files.forEach(validateProductImageFile); const stored = []; for (const file of files) stored.push(await persistProductImage(file)); return res.status(201).json({ success: true, files: stored }); } catch (error) { return sendError(res, error); }
});

export default router;
