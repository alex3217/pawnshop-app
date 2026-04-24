// File: apps/api/backend/src/routes/bids.routes.js

import { Router } from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import { myBids, placeBid } from "../controllers/bids.controller.js";

const router = Router();

function asyncRoute(handler) {
  return function wrappedRoute(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function badRequest(res, message, details = undefined) {
  return res.status(400).json({
    success: false,
    error: message,
    ...(details ? { details } : {}),
  });
}

function validateAuctionIdParam(req, res, next) {
  const raw = req.params?.id;

  if (typeof raw !== "string") {
    return badRequest(res, "Auction id is required.");
  }

  const id = raw.trim();

  if (!id || id.length > 128 || id.includes("/")) {
    return badRequest(res, "Invalid auction id.");
  }

  req.params.id = id;
  return next();
}

/**
 * Buyer/Admin
 * GET /api/bids/mine
 *
 * Returns the authenticated buyer's bids.
 */
router.get(
  "/mine",
  authRequired,
  requireRole("CONSUMER", "ADMIN"),
  asyncRoute(myBids),
);

/**
 * Buyer/Admin
 * POST /api/bids/:id
 *
 * Places a bid on auction :id.
 */
router.post(
  "/:id",
  authRequired,
  requireRole("CONSUMER", "ADMIN"),
  validateAuctionIdParam,
  asyncRoute(placeBid),
);

export const BID_ROUTE_MAP = Object.freeze({
  mine: "GET /api/bids/mine",
  placeBid: "POST /api/bids/:id",
});

export default router;