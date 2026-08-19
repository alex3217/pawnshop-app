import express from "express";

import {
  cancelMarketplaceListing,
  createMarketplaceListing,
  getMarketplaceListing,
  listMarketplaceListings,
  listMyMarketplaceListings,
  listReceivedMarketplaceListings,
  searchMarketplaceCustomerDestinations,
  searchMarketplaceShopDestinations,
  pauseMarketplaceListing,
  publishMarketplaceListing,
  updateMarketplaceListing,
} from "../controllers/marketplaceListings.controller.js";

import {
  authRequired,
  optionalAuth,
  requireRole,
} from "../middleware/auth.js";
import { marketplaceDestinationSearchRateLimit } from "../middleware/marketplaceDestinationSearchRateLimit.js";

const router = express.Router();

const MARKETPLACE_SELLER_ROLES = [
  "CONSUMER",
  "OWNER",
  "ADMIN",
  "SUPER_ADMIN",
];

router.get("/", listMarketplaceListings);

router.get("/destinations/customers", authRequired, requireRole("CONSUMER", "ADMIN", "SUPER_ADMIN"), marketplaceDestinationSearchRateLimit, searchMarketplaceCustomerDestinations);
router.get("/destinations/shops", authRequired, requireRole("CONSUMER", "ADMIN", "SUPER_ADMIN"), marketplaceDestinationSearchRateLimit, searchMarketplaceShopDestinations);
router.get("/received", authRequired, listReceivedMarketplaceListings);

router.get(
  "/mine",
  authRequired,
  requireRole(...MARKETPLACE_SELLER_ROLES),
  listMyMarketplaceListings,
);

router.post(
  "/",
  authRequired,
  requireRole(...MARKETPLACE_SELLER_ROLES),
  createMarketplaceListing,
);

router.patch(
  "/:id",
  authRequired,
  requireRole(...MARKETPLACE_SELLER_ROLES),
  updateMarketplaceListing,
);

router.post(
  "/:id/publish",
  authRequired,
  requireRole(...MARKETPLACE_SELLER_ROLES),
  publishMarketplaceListing,
);

router.post(
  "/:id/pause",
  authRequired,
  requireRole(...MARKETPLACE_SELLER_ROLES),
  pauseMarketplaceListing,
);

router.post(
  "/:id/cancel",
  authRequired,
  requireRole(...MARKETPLACE_SELLER_ROLES),
  cancelMarketplaceListing,
);

router.get("/:id", optionalAuth, getMarketplaceListing);

export default router;
