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
} from "../controllers/shopFinance.controller.js";

const router = Router();
const FINANCE_ROLES = ["OWNER", "ADMIN", "SUPER_ADMIN"];

// Public
router.get("/", listShops);

// Owner/Admin read routes must be before /:id.
router.get("/mine", authRequired, requireRole("OWNER", "ADMIN"), myShops);

// Owner/Admin finance routes must be before /:id.
router.get(
  "/:id/finance/balance",
  authRequired,
  requireRole(...FINANCE_ROLES),
  getShopFinanceBalance,
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
