import { Router } from "express";
import { authRequired } from "../middleware/auth.js";
import { requireOwnerAdminOrStaffPermission } from "../middleware/staffAccess.middleware.js";
import {
  listItems,
  getItem,
  createItem,
  listMyItems,
  updateItem,
  deleteItem,
  scanItem,
  sellItem,
} from "../controllers/items.controller.js";

const router = Router();

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

// Public single-item lookup
router.get("/:id", getItem);

export default router;
