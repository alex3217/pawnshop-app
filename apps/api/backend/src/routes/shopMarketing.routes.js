import { Router } from "express";
import { authRequired } from "../middleware/auth.js";
import { requireOwnerAdminOrStaffPermission } from "../middleware/staffAccess.middleware.js";
import {
  createShopMarketingCampaign,
  deleteShopMarketingCampaign,
  getCampaignQrPng,
  getCampaignQrSvg,
  listShopMarketingCampaigns,
  updateShopMarketingCampaign,
} from "../controllers/shopMarketing.controller.js";

const router = Router({ mergeParams: true });
const read = [authRequired, requireOwnerAdminOrStaffPermission("marketing:read")];
const write = [authRequired, requireOwnerAdminOrStaffPermission("marketing:write")];

router.get("/", ...read, listShopMarketingCampaigns);
router.post("/", ...write, createShopMarketingCampaign);
router.patch("/:campaignId", ...write, updateShopMarketingCampaign);
router.delete("/:campaignId", ...write, deleteShopMarketingCampaign);
router.get("/:campaignId/qr.svg", ...read, getCampaignQrSvg);
router.get("/:campaignId/qr.png", ...read, getCampaignQrPng);

export default router;
