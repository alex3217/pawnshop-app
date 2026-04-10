import { Router } from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import {
  listItems,
  getItem,
  createItem,
  listMyItems,
  updateItem,
  deleteItem,
} from "../controllers/items.controller.js";

const router = Router();

// Public list
router.get("/", listItems);

// Owner/Admin special route must come before "/:id"
router.get("/mine", authRequired, requireRole("OWNER", "ADMIN"), listMyItems);

// Owner/Admin mutations
router.post("/", authRequired, requireRole("OWNER", "ADMIN"), createItem);
router.put("/:id", authRequired, requireRole("OWNER", "ADMIN"), updateItem);
router.delete("/:id", authRequired, requireRole("OWNER", "ADMIN"), deleteItem);

// Public single-item lookup
router.get("/:id", getItem);

export default router;
