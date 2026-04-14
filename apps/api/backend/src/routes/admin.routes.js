import { Router } from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import {
  listUsers, blockUser, unblockUser,
  adminListItems, softDeleteItem, restoreItem,
  adminListShops, softDeleteShop, restoreShop
} from "../controllers/admin.controller.js";

const router = Router();
router.use(authRequired, requireRole("ADMIN"));

router.get("/users", listUsers);
router.delete("/users/:id", blockUser);
router.patch("/users/:id/unblock", unblockUser);

router.get("/items", adminListItems);
router.delete("/items/:id", softDeleteItem);
router.patch("/items/:id/restore", restoreItem);

router.get("/shops", adminListShops);
router.delete("/shops/:id", softDeleteShop);
router.patch("/shops/:id/restore", restoreShop);

export default router;
