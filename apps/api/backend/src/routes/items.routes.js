import { Router } from "express";
import { authRequired } from "../middleware/auth.js";
import { requireOwnerAdminOrStaffPermission } from "../middleware/staffAccess.middleware.js";
import {
  listItems,
  getItem,
  getItemPriceComparison,
  createItem,
  listMyItems,
  getMyItem,
  updateItem,
  deleteItem,
  restoreItem,
  scanItem,
  sellItem,
} from "../controllers/items.controller.js";
import { listOwnerInventoryAdminHistory } from "../controllers/inventorySupport.controller.js";

const router = Router();

// Public list
router.get("/", listItems);

// Owner/Admin special route must come before "/:id"
router.get("/mine", authRequired, requireOwnerAdminOrStaffPermission("inventory:read"), listMyItems);
router.get("/mine/:id", authRequired, requireOwnerAdminOrStaffPermission("inventory:read"), getMyItem);
router.get("/mine/:id/admin-history", authRequired, requireOwnerAdminOrStaffPermission("inventory:read"), listOwnerInventoryAdminHistory);

// Owner/Admin scan + mutations
router.post("/scan", authRequired, requireOwnerAdminOrStaffPermission("inventory:write"), scanItem);
router.post("/:id/sell", authRequired, requireOwnerAdminOrStaffPermission("inventory:write"), sellItem);

// Owner/Admin mutations
router.post("/", authRequired, requireOwnerAdminOrStaffPermission("inventory:write"), createItem);
router.put("/:id", authRequired, requireOwnerAdminOrStaffPermission("inventory:write"), updateItem);
router.delete("/:id", authRequired, requireOwnerAdminOrStaffPermission("inventory:write"), deleteItem);
router.patch("/:id/restore", authRequired, requireOwnerAdminOrStaffPermission("inventory:write"), restoreItem);

// Public item pricing intelligence and single-item lookup
router.get("/:id/price-comparison", getItemPriceComparison);
router.get("/:id", getItem);

export default router;
