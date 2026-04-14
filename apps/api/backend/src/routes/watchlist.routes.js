import { Router } from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import {
  addToWatchlist,
  getMyWatchlist,
  removeFromWatchlist,
} from "../controllers/watchlist.controller.js";

const router = Router();

router.get("/mine", authRequired, requireRole("CONSUMER", "ADMIN"), getMyWatchlist);
router.post("/", authRequired, requireRole("CONSUMER", "ADMIN"), addToWatchlist);
router.delete("/:itemId", authRequired, requireRole("CONSUMER", "ADMIN"), removeFromWatchlist);

export default router;
