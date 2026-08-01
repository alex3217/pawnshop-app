import { Router } from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import { listMyFollowedShops } from "../controllers/shopFollow.controller.js";
const router = Router();
router.get("/", authRequired, requireRole("CONSUMER"), listMyFollowedShops);
export default router;
