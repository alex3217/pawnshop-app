// File: apps/api/backend/src/routes/shops.routes.js

import { Router } from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import {
  listShops,
  myShops,
  createShop,
  updateShop,
  completeShopOnboarding,
  getShopItems,
  getShopById,
} from "../controllers/shops.controller.js";
import {
  getShopFinanceBalance,
  getShopFinanceLedger,
  getShopFinancePayouts,
  requestShopFinancePayout,
  cancelShopFinancePayout,
  processShopFinancePayout,
} from "../controllers/shopFinance.controller.js";
import {
  createShopFinanceConnectAccount,
  createShopFinanceConnectOnboardingLink,
  getShopFinanceConnectStatus,
} from "../controllers/shopFinanceConnect.controller.js";
import shopMarketingRoutes from "./shopMarketing.routes.js";
import { getShopBusinessGrowth, getShopPlanUsage } from "../controllers/businessGrowth.controller.js";
import { requireShopPermission, shopIdFromParam } from "../middleware/shopAccess.js";

const router = Router();
const FINANCE_ROLES = ["OWNER", "ADMIN", "SUPER_ADMIN"];

// Public
router.get("/", listShops);

// Owner/Admin read routes must be before /:id.
router.get("/mine", authRequired, requireRole("OWNER", "ADMIN"), myShops);
router.use("/:shopId/marketing/campaigns", shopMarketingRoutes);
router.get("/:shopId/business-growth", authRequired, requireShopPermission("growth:read", { resolveShopId: shopIdFromParam("shopId") }), getShopBusinessGrowth);
router.get("/:shopId/plan-usage", authRequired, requireShopPermission("growth:read", { resolveShopId: shopIdFromParam("shopId") }), getShopPlanUsage);

// Owner/Admin finance routes must be before /:id.
router.get(
  "/:id/finance/balance",
  authRequired,
  requireRole(...FINANCE_ROLES),
  getShopFinanceBalance,
);

router.post(
  "/:id/finance/payouts",
  authRequired,
  requireRole(...FINANCE_ROLES),
  requestShopFinancePayout,
);

router.post(
  "/:id/finance/payouts/:payoutId/cancel",
  authRequired,
  requireRole(...FINANCE_ROLES),
  cancelShopFinancePayout,
);

router.post(
  "/:id/finance/payouts/:payoutId/process",
  authRequired,
  requireRole("ADMIN", "SUPER_ADMIN"),
  processShopFinancePayout,
);

router.get(
  "/:id/finance/ledger",
  authRequired,
  requireRole(...FINANCE_ROLES),
  getShopFinanceLedger,
);

router.get(
  "/:id/finance/payouts",
  authRequired,
  requireRole(...FINANCE_ROLES),
  getShopFinancePayouts,
);

router.get(
  "/:id/finance/connect/status",
  authRequired,
  requireRole(...FINANCE_ROLES),
  getShopFinanceConnectStatus,
);

router.post(
  "/:id/finance/connect/account",
  authRequired,
  requireRole(...FINANCE_ROLES),
  createShopFinanceConnectAccount,
);

router.post(
  "/:id/finance/connect/onboarding-link",
  authRequired,
  requireRole(...FINANCE_ROLES),
  createShopFinanceConnectOnboardingLink,
);

router.put(
  "/:id/onboarding/complete",
  authRequired,
  requireRole("OWNER", "ADMIN"),
  completeShopOnboarding,
);

// Public detail routes
router.get("/:id/items", getShopItems);
router.get("/:id", getShopById);

// Owner/Admin
router.post("/", authRequired, requireRole("OWNER", "ADMIN"), createShop);
router.put("/:id", authRequired, requireRole("OWNER", "ADMIN"), updateShop);

export default router;
