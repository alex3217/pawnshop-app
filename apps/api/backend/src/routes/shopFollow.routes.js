import { Router } from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import { createShopFollow, deleteShopFollow, getShopFollowStatus, patchShopFollowPreferences } from "../controllers/shopFollow.controller.js";

const router = Router({ mergeParams: true });
const buyer = [authRequired, requireRole("CONSUMER")];
router.get("/", ...buyer, getShopFollowStatus);
router.post("/", ...buyer, createShopFollow);
router.delete("/", ...buyer, deleteShopFollow);
router.patch("/preferences", ...buyer, patchShopFollowPreferences);
export default router;
