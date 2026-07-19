import express from "express";

import {
  createMarketplacePurchaseReservation,
  getMarketplaceTransactionById,
  listMyMarketplacePurchases,
  listMyMarketplaceSales,
} from "../controllers/marketplaceTransactions.controller.js";

import {
  authRequired,
  requireRole,
} from "../middleware/auth.js";

const router = express.Router();

const TRANSACTION_ROLES = [
  "CONSUMER",
  "OWNER",
  "ADMIN",
  "SUPER_ADMIN",
];

router.use(authRequired);

router.post(
  "/reserve",
  requireRole(...TRANSACTION_ROLES),
  createMarketplacePurchaseReservation,
);

router.get(
  "/mine/purchases",
  requireRole(...TRANSACTION_ROLES),
  listMyMarketplacePurchases,
);

router.get(
  "/mine/sales",
  requireRole(...TRANSACTION_ROLES),
  listMyMarketplaceSales,
);

router.get(
  "/:id",
  requireRole(...TRANSACTION_ROLES),
  getMarketplaceTransactionById,
);

export default router;
