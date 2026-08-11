import { Router } from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import { createListingAssistantSuggestion } from "../services/aiListingAssistant.service.js";
import { assertCanUseAiListingAssistantForShop } from "../services/sellerPlan.service.js";
import { assertShopPermission } from "../services/shopAccess.service.js";

const router = Router();

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

async function enforceListingAssistantEntitlement(req, _res, next) {
  const shopId = String(req.body?.pawnShopId || "").trim();
  if (!shopId) {
    const error = new Error("Shop id is required for the AI listing assistant.");
    error.statusCode = 400;
    error.code = "SHOP_ID_REQUIRED";
    throw error;
  }

  const role = String(req.user?.role || "").toUpperCase();
  if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
    await assertShopPermission({
      user: req.user,
      shopId,
      permission: "inventory:write",
    });
    await assertCanUseAiListingAssistantForShop(shopId);
  }

  next();
}

router.post(
  "/listing-assistant",
  authRequired,
  requireRole("OWNER", "ADMIN", "SUPER_ADMIN"),
  asyncRoute(enforceListingAssistantEntitlement),
  asyncRoute(createListingAssistantSuggestion)
);

export default router;
