import { Router } from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import { getBuyerMessagingProfile, unblockBuyerMessagingShop, updateBuyerMessagingProfile } from "../controllers/buyerMessagingProfile.controller.js";

const router = Router();
router.use(authRequired, requireRole("CONSUMER"));
router.get("/", getBuyerMessagingProfile);
router.patch("/", updateBuyerMessagingProfile);
router.delete("/blocked-shops/:shopId", unblockBuyerMessagingShop);
export default router;
