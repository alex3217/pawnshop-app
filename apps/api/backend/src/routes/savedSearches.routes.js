import { Router } from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import {
  addSavedSearch,
  getMySavedSearches,
  removeSavedSearch,
} from "../controllers/savedSearches.controller.js";

const router = Router();

router.get("/mine", authRequired, requireRole("CONSUMER", "ADMIN"), getMySavedSearches);
router.post("/", authRequired, requireRole("CONSUMER", "ADMIN"), addSavedSearch);
router.delete("/:id", authRequired, requireRole("CONSUMER", "ADMIN"), removeSavedSearch);

export default router;
