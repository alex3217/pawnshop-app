import { Router } from "express";
import multer from "multer";
import { authRequired } from "../middleware/auth.js";
import { requireOwnerAdminOrStaffPermission } from "../middleware/staffAccess.middleware.js";
import { loadUploadLimits } from "../config/uploads.js";
import { uploadImages } from "../services/uploads.service.js";

function uploadError(error, req, res, next) {
  if (!(error instanceof multer.MulterError)) return next(error);
  const status = error.code === "LIMIT_FILE_SIZE" || error.code === "LIMIT_FILE_COUNT" ? 413 : 400;
  return res.status(status).json({ success: false, error: "Upload request is invalid", requestId: req.requestId });
}

export function createUploadsRouter({ storage, limits = loadUploadLimits() }) {
  const router = Router();
  const multipart = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: limits.maxFileBytes, files: limits.maxFiles, fields: 8, parts: limits.maxFiles + 8 },
  });
  const authorize = [authRequired, requireOwnerAdminOrStaffPermission("inventory:write")];

  router.post("/", ...authorize, multipart.any(), uploadError, async (req, res, next) => {
    try {
      if (req.files?.length !== 1) {
        const error = new Error("Exactly one image is required");
        error.statusCode = 400;
        throw error;
      }
      const [file] = await uploadImages({ req, files: req.files, input: req.body, storage, limits });
      return res.status(201).json({ file });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/bulk", ...authorize, multipart.any(), uploadError, async (req, res, next) => {
    try {
      const files = await uploadImages({ req, files: req.files, input: req.body, storage, limits });
      return res.status(201).json({ files });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
