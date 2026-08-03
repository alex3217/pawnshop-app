import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { authRequired } from "../middleware/auth.js";
import { requireOwnerAdminOrStaffPermission } from "../middleware/staffAccess.middleware.js";
import {
  listItems,
  getItem,
  getItemPriceComparison,
  createItem,
  listMyItems,
  updateItem,
  deleteItem,
  scanItem,
  sellItem,
} from "../controllers/items.controller.js";
import { getItemComparables, getItemMarketplaceIntelligence, getItemPriceHistoryUnavailable, getItemSimilarListings } from "../controllers/marketplaceIntelligence.controller.js";

const router = Router();
const intelligenceRateLimit = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false });

// Public list
router.get("/", listItems);

// Owner/Admin special route must come before "/:id"
router.get("/mine", authRequired, requireOwnerAdminOrStaffPermission("inventory:read"), listMyItems);

// Owner/Admin scan + mutations
router.post("/scan", authRequired, requireOwnerAdminOrStaffPermission("inventory:write"), scanItem);
router.post("/:id/sell", authRequired, requireOwnerAdminOrStaffPermission("inventory:write"), sellItem);

// Owner/Admin mutations
router.post("/", authRequired, requireOwnerAdminOrStaffPermission("inventory:write"), createItem);
router.put("/:id", authRequired, requireOwnerAdminOrStaffPermission("inventory:write"), updateItem);
router.delete("/:id", authRequired, requireOwnerAdminOrStaffPermission("inventory:write"), deleteItem);

// Public item pricing intelligence and single-item lookup
router.get("/:id/price-comparison", getItemPriceComparison);
router.get("/:id/intelligence", intelligenceRateLimit, getItemMarketplaceIntelligence);
router.get("/:id/similar", intelligenceRateLimit, getItemSimilarListings);
router.get("/:id/comparables", intelligenceRateLimit, getItemComparables);
router.get("/:id/price-history", intelligenceRateLimit, getItemPriceHistoryUnavailable);
router.get("/:id", getItem);

export default router;
