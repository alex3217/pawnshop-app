import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { authRequired, requireRole } from "../middleware/auth.js";
import { importInventoryCsv } from "../controllers/inventoryBulk.controller.js";
import { CSV_LIMITS, CSV_MIME_TYPES } from "../services/inventoryCsv.service.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: CSV_LIMITS.bytes,
  },
  fileFilter: (_req, file, callback) => callback(null, CSV_MIME_TYPES.has(String(file.mimetype || "").toLowerCase())),
});

const importRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

router.post(
  "/import",
  authRequired,
  requireRole("OWNER", "ADMIN"),
  importRateLimit,
  upload.single("file"),
  importInventoryCsv
);

export default router;
