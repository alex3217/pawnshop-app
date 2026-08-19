import { Router } from "express";
import multer from "multer";
import { authRequired, requireRole } from "../middleware/auth.js";
import { requireOwnerAdminOrStaffPermission } from "../middleware/staffAccess.middleware.js";
import { loadUploadLimits } from "../config/uploads.js";
import { uploadImages } from "../services/uploads.service.js";
import { createAggregateMemoryStorage } from "../middleware/aggregateMemoryStorage.js";
import { createUploadProtection } from "../middleware/uploadProtection.js";
import { deleteUploadAssetForActor } from "../services/uploadAssets.service.js";

function uploadError(error, req, res, next) {
  if (!(error instanceof multer.MulterError)) return next(error);
  const status = error.code === "LIMIT_FILE_SIZE" || error.code === "LIMIT_FILE_COUNT" ? 413 : 400;
  return res.status(status).json({ success: false, error: "Upload request is invalid", requestId: req.requestId });
}

function rejectOversizedMultipart(req, res, next) {
  const declaredBytes = Number(req.get("content-length") || 0);
  const maximumRequestBytes = req.uploadLimits.maxAggregateBytes + (256 * 1024);
  if (Number.isFinite(declaredBytes) && declaredBytes > maximumRequestBytes) {
    return res.status(413).json({ success: false, error: "Upload request exceeds the aggregate size limit", requestId: req.requestId });
  }
  return next();
}

export function createUploadsRouter({ storage, limits = loadUploadLimits(), protection, logger = console }) {
  const router = Router();
  const multipart = multer({
    storage: createAggregateMemoryStorage(limits.maxAggregateBytes),
    limits: { fileSize: limits.maxFileBytes, files: limits.maxFiles, fields: 8, fieldSize: 16 * 1024, parts: limits.maxFiles + 8 },
  });
  const authorize = [authRequired, requireOwnerAdminOrStaffPermission("inventory:write")];
  const uploadProtection = protection || createUploadProtection({ limits });
  const exposeLimits = (req, _res, next) => { req.uploadLimits = limits; next(); };
  const protectedUpload = [...authorize, uploadProtection.rateLimit, uploadProtection.concurrency, exposeLimits, rejectOversizedMultipart];
  const consumerUpload = [authRequired, requireRole("CONSUMER"), uploadProtection.rateLimit, uploadProtection.concurrency, exposeLimits, rejectOversizedMultipart];

  router.post("/marketplace-listings/:listingId", ...consumerUpload, multipart.any(), uploadError, async (req, res, next) => {
    try {
      const files = await uploadImages({
        req,
        files: req.files,
        input: { kind: "MARKETPLACE_LISTING_IMAGE", marketplaceListingId: String(req.params.listingId || "") },
        storage,
        limits,
        logger,
      });
      return res.status(201).json({ files });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/", ...protectedUpload, multipart.any(), uploadError, async (req, res, next) => {
    try {
      if (req.files?.length !== 1) {
        const error = new Error("Exactly one image is required");
        error.statusCode = 400;
        throw error;
      }
      const [file] = await uploadImages({ req, files: req.files, input: req.body, storage, limits, logger });
      return res.status(201).json({ file });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/bulk", ...protectedUpload, multipart.any(), uploadError, async (req, res, next) => {
    try {
      const files = await uploadImages({ req, files: req.files, input: req.body, storage, limits, logger });
      return res.status(201).json({ files });
    } catch (error) {
      return next(error);
    }
  });

  router.delete("/:id", ...authorize, async (req, res, next) => {
    try {
      await deleteUploadAssetForActor({
        assetId: String(req.params.id || ""),
        actorId: String(req.user?.sub || req.user?.id || ""),
        shopId: req.query.shopId ? String(req.query.shopId) : undefined,
        storage,
        logger,
        requestId: req.requestId,
      });
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
