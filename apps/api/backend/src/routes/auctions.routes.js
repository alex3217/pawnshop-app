// File: apps/api/backend/src/routes/auctions.routes.js

import { Router } from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import {
  listAuctions,
  getAuction,
  createAuction,
  cancelAuction,
  endAuction,
} from "../controllers/auctions.controller.js";
import { placeBid } from "../controllers/bids.controller.js";

const router = Router();

// Public
router.get("/", listAuctions);
router.get("/:id", getAuction);

// Consumer/Admin
router.post("/:id/bids", authRequired, requireRole("CONSUMER", "ADMIN"), placeBid);
router.post("/:id/auto-bid", authRequired, requireRole("CONSUMER", "ADMIN"), setAutoBid);

// Owner/Admin
router.post("/", authRequired, requireRole("OWNER", "ADMIN"), createAuction);
router.post("/:id/cancel", authRequired, requireRole("OWNER", "ADMIN"), cancelAuction);
router.post("/:id/end", authRequired, requireRole("OWNER", "ADMIN"), endAuction);

export default router;