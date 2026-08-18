import { Router } from "express";
import multer from "multer";
import { authRequired, requireRole } from "../middleware/auth.js";
import { importInventoryCsv } from "../controllers/inventoryBulk.controller.js";
import { INVENTORY_IMPORT_LIMITS } from "../config/inventoryImport.js";
import { createUploadProtection, RedisRateLimitStore } from "../middleware/uploadProtection.js";

const router = Router();
const distributedStore = process.env.REDIS_URL
  ? new RedisRateLimitStore({ url: process.env.REDIS_URL, namespace: "inventory-import:rate" })
  : undefined;
const protection = createUploadProtection({
  limits: INVENTORY_IMPORT_LIMITS,
  store: distributedStore,
  requireDistributed: process.env.NODE_ENV === "production",
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: INVENTORY_IMPORT_LIMITS.maxFileBytes,
    files: 1,
    fields: 3,
    fieldNameSize: 64,
    fieldSize: 1_024,
  },
  fileFilter(req, file, callback) {
    const type = String(file.mimetype || "").toLowerCase();
    const name = String(file.originalname || "").toLowerCase();
    if ((type === "text/csv" || type === "application/csv" || type === "application/vnd.ms-excel") && name.endsWith(".csv")) {
      return callback(null, true);
    }
    const error = new Error("Only CSV files are accepted");
    error.statusCode = 415;
    return callback(error);
  },
});

router.post(
  "/import",
  authRequired,
  requireRole("OWNER", "ADMIN", "SUPER_ADMIN"),
  protection.rateLimit,
  protection.concurrency,
  upload.single("file"),
  importInventoryCsv
);

export default router;
