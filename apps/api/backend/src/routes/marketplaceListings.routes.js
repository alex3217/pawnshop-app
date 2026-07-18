import express from "express";

import {
  cancelMarketplaceListing,
  createMarketplaceListing,
  getMarketplaceListing,
  listMarketplaceListings,
  listMyMarketplaceListings,
  pauseMarketplaceListing,
  publishMarketplaceListing,
  updateMarketplaceListing,
} from "../controllers/marketplaceListings.controller.js";

import {
  authRequired,
  requireRole,
} from "../middleware/auth.js";

const router = express.Router();

const MARKETPLACE_SELLER_ROLES = [
  "CONSUMER",
  "OWNER",
  "ADMIN",
  "SUPER_ADMIN",
];

router.get("/", listMarketplaceListings);

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

router.get("/:id", getMarketplaceListing);

export default router;
