// File: apps/api/backend/src/routes/shops.routes.js

import { Router } from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import {
  listShops,
  myShops,
  createShop,
  updateShop,
  getShopItems,
} from "../controllers/shops.controller.js";

const router = Router();

// Public
router.get("/", listShops);
router.get("/:id/items", getShopItems);

// Owner/Admin
router.get("/mine", authRequired, requireRole("OWNER", "ADMIN"), myShops);
router.post("/", authRequired, requireRole("OWNER", "ADMIN"), createShop);
router.put("/:id", authRequired, requireRole("OWNER", "ADMIN"), updateShop);

export default router;