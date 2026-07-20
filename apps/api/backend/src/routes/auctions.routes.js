// File: apps/api/backend/src/routes/auctions.routes.js

import { Router } from "express";
import {
  authRequired,
  requireRole,
} from "../middleware/auth.js";
import {
  requireShopPermission,
  shopIdFromAuctionParam,
  shopIdFromBody,
} from "../middleware/shopAccess.js";
import {
  listAuctions,
  listMyAuctions,
  getAuction,
  createAuction,
  cancelAuction,
  endAuction,
  markAuctionReviewed,
  clearAuctionReviewed,
  markClosedAuctionsReviewed,
  setAutoBid,
} from "../controllers/auctions.controller.js";
import {
  placeBid,
} from "../controllers/bids.controller.js";

const router = Router();

const SHOP_AUCTION_ACCESS_ROLES = [
  "CONSUMER",
  "OWNER",
  "ADMIN",
  "SUPER_ADMIN",
];

const BULK_REVIEW_ROLES = [
  "OWNER",
  "ADMIN",
  "SUPER_ADMIN",
];

// Public discovery.
router.get("/", listAuctions);

// Owner and assigned-staff listing.
router.get(
  "/mine",
  authRequired,
  requireRole(...SHOP_AUCTION_ACCESS_ROLES),
  listMyAuctions,
);

// Bulk review remains owner/platform-admin only
// until it receives an explicit shop scope.
router.patch(
  "/reviewed/bulk",
  authRequired,
  requireRole(...BULK_REVIEW_ROLES),
  markClosedAuctionsReviewed,
);

router.patch(
  "/:id/reviewed",
  authRequired,
  requireRole(...SHOP_AUCTION_ACCESS_ROLES),
  requireShopPermission("auctions:write", {
    resolveShopId: shopIdFromAuctionParam("id"),
  }),
  markAuctionReviewed,
);

router.patch(
  "/:id/reviewed/clear",
  authRequired,
  requireRole(...SHOP_AUCTION_ACCESS_ROLES),
  requireShopPermission("auctions:write", {
    resolveShopId: shopIdFromAuctionParam("id"),
  }),
  clearAuctionReviewed,
);

router.get("/:id", getAuction);

// Buyer bidding remains separate from staff
// auction-management permissions.
router.post(
  "/:id/bids",
  authRequired,
  requireRole("CONSUMER", "ADMIN"),
  placeBid,
);

router.post(
  "/:id/auto-bid",
  authRequired,
  requireRole("CONSUMER", "ADMIN"),
  setAutoBid,
);

// Assigned-shop mutation controls.
router.post(
  "/",
  authRequired,
  requireRole(...SHOP_AUCTION_ACCESS_ROLES),
  requireShopPermission("auctions:write", {
    resolveShopId: shopIdFromBody("shopId"),
  }),
  createAuction,
);

router.post(
  "/:id/cancel",
  authRequired,
  requireRole(...SHOP_AUCTION_ACCESS_ROLES),
  requireShopPermission("auctions:write", {
    resolveShopId: shopIdFromAuctionParam("id"),
  }),
  cancelAuction,
);

router.post(
  "/:id/end",
  authRequired,
  requireRole(...SHOP_AUCTION_ACCESS_ROLES),
  requireShopPermission("auctions:write", {
    resolveShopId: shopIdFromAuctionParam("id"),
  }),
  endAuction,
);

export const AUCTION_ROUTE_PERMISSION_MAP =
  Object.freeze({
    mine: "auctions:read",
    create: "auctions:write",
    cancel: "auctions:write",
    end: "auctions:write",
    reviewed: "auctions:write",
    clearReviewed: "auctions:write",
  });

export default router;
