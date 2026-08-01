import { Router } from "express";
import { authRequired } from "../middleware/auth.js";
import { requireOwnerAdminOrStaffPermission } from "../middleware/staffAccess.middleware.js";
import { downloadShopMarketingAsset, listShopMarketingAssetTemplates } from "../controllers/marketingAssets.controller.js";

const router = Router({ mergeParams: true });
const read = [authRequired, requireOwnerAdminOrStaffPermission("marketing:read")];
router.get("/templates", ...read, listShopMarketingAssetTemplates);
router.get("/:templateType.pdf", ...read, downloadShopMarketingAsset);
export default router;
