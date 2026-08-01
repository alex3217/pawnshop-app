import { Router } from "express";
import { authRequired } from "../middleware/auth.js";
import { requireOwnerAdminOrStaffPermission } from "../middleware/staffAccess.middleware.js";
import { getCustomerGrowth, getShopReferrals } from "../controllers/customerEngagement.controller.js";
const router = Router({ mergeParams: true });
router.get("/growth", authRequired, requireOwnerAdminOrStaffPermission("marketing:read"), getCustomerGrowth);
router.get("/referrals", authRequired, requireOwnerAdminOrStaffPermission("marketing:read"), getShopReferrals);
export default router;
