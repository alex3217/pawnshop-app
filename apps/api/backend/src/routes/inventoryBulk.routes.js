import { Router } from "express";
import multer from "multer";
import { authRequired, requireRole } from "../middleware/auth.js";
import { importInventoryCsv } from "../controllers/inventoryBulk.controller.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
  },
});

router.post(
  "/import",
  authRequired,
  requireRole("OWNER", "ADMIN"),
  upload.single("file"),
  importInventoryCsv
);

export default router;
