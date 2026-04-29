// File: apps/api/backend/src/routes/shops.routes.js

import { Router } from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import {
  listShops,
  myShops,
  createShop,
  updateShop,
  getShopItems,
  getShopById,
} from "../controllers/shops.controller.js";

const router = Router();

// Public
router.get("/", listShops);

// Owner/Admin read routes must be before /:id.
router.get("/mine", authRequired, requireRole("OWNER", "ADMIN"), myShops);

// Public detail routes
router.get("/:id/items", getShopItems);
router.get("/:id", getShopById);

// Owner/Admin
router.post("/", authRequired, requireRole("OWNER", "ADMIN"), createShop);
router.put("/:id", authRequired, requireRole("OWNER", "ADMIN"), updateShop);

export default router;