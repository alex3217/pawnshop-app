import express from "express";

import {
  cancelMarketplaceReservation,
  createMarketplacePaymentIntent,
  createMarketplacePurchaseReservation,
  getMarketplaceTransactionById,
  listMyMarketplacePurchases,
  listMyMarketplaceSales,
  updateMarketplaceFulfillment,
  receiveCustomerSellItem,
  startCustomerSellInspection,
  acceptCustomerSellOriginalPrice,
  proposeCustomerSellRevisedPrice,
  acceptCustomerSellRevisedPrice,
  refuseCustomerSellRevisedPrice,
  rejectCustomerSellItem,
  returnCustomerSellItem,
  recordCustomerSellOfflinePayment,
  acknowledgeCompletedCustomerSell,
} from "../controllers/marketplaceTransactions.controller.js";

import {
  authRequired,
  requireRole,
} from "../middleware/auth.js";
import { requireMfaStepUpForRoles } from "../middleware/mfaStepUp.js";

const router = express.Router();

const TRANSACTION_ROLES = [
  "CONSUMER",
  "OWNER",
  "ADMIN",
  "SUPER_ADMIN",
];
const administrativeStepUp = (scope) => requireMfaStepUpForRoles(scope, "ADMIN", "SUPER_ADMIN");

router.use(authRequired);

router.post(
  "/reserve",
  requireRole(...TRANSACTION_ROLES),
  createMarketplacePurchaseReservation,
);

router.post(
  "/:id/payment-intent",
  requireRole(...TRANSACTION_ROLES),
  administrativeStepUp("financial.marketplace.payment-intent"),
  createMarketplacePaymentIntent,
);

router.post(
  "/:id/cancel-reservation",
  requireRole(...TRANSACTION_ROLES),
  administrativeStepUp("financial.marketplace.reservation.cancel"),
  cancelMarketplaceReservation,
);

router.patch(
  "/:id/fulfillment",
  requireRole(...TRANSACTION_ROLES),
  administrativeStepUp("financial.marketplace.fulfillment"),
  updateMarketplaceFulfillment,
);

router.post("/:id/customer-sell/item-received", requireRole(...TRANSACTION_ROLES), administrativeStepUp("financial.marketplace.item-received"), receiveCustomerSellItem);
router.post("/:id/customer-sell/inspection-started", requireRole(...TRANSACTION_ROLES), administrativeStepUp("financial.marketplace.inspection.start"), startCustomerSellInspection);
router.post("/:id/customer-sell/inspection/accept-original", requireRole(...TRANSACTION_ROLES), administrativeStepUp("financial.marketplace.inspection.accept-original"), acceptCustomerSellOriginalPrice);
router.post("/:id/customer-sell/inspection/propose-revised", requireRole(...TRANSACTION_ROLES), administrativeStepUp("financial.marketplace.price.revise"), proposeCustomerSellRevisedPrice);
router.post("/:id/customer-sell/revised-price/accept", requireRole(...TRANSACTION_ROLES), administrativeStepUp("financial.marketplace.price.accept"), acceptCustomerSellRevisedPrice);
router.post("/:id/customer-sell/revised-price/refuse", requireRole(...TRANSACTION_ROLES), administrativeStepUp("financial.marketplace.price.refuse"), refuseCustomerSellRevisedPrice);
router.post("/:id/customer-sell/reject", requireRole(...TRANSACTION_ROLES), administrativeStepUp("financial.marketplace.item.reject"), rejectCustomerSellItem);
router.post("/:id/customer-sell/returned", requireRole(...TRANSACTION_ROLES), administrativeStepUp("financial.marketplace.item.return"), returnCustomerSellItem);
router.post("/:id/customer-sell/offline-payment", requireRole(...TRANSACTION_ROLES), administrativeStepUp("financial.marketplace.offline-payment"), recordCustomerSellOfflinePayment);
router.post("/:id/customer-sell/acknowledge", requireRole(...TRANSACTION_ROLES), acknowledgeCompletedCustomerSell);

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
