// File: apps/api/backend/src/routes/settlements.routes.js

import { Router } from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import {
  listMySettlements,
  getSettlementById,
  getSettlementByAuctionId,
  listAllSettlementsForAdmin,
  createOrFinalizeSettlement,
} from "../controllers/settlements.controller.js";

const router = Router();

const BUYER_ROLES = ["CONSUMER", "OWNER", "ADMIN"];
const ADMIN_ROLES = ["ADMIN"];
const ID_MAX_LENGTH = 128;

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

function validateId(value, label) {
  if (typeof value !== "string") {
    return `${label} is required.`;
  }

  const trimmed = value.trim();

  if (!trimmed || trimmed.length > ID_MAX_LENGTH || trimmed.includes("/")) {
    return `Invalid ${label.toLowerCase()}.`;
  }

  return null;
}

function validateSettlementIdParam(req, res, next) {
  const error = validateId(req.params?.id, "Settlement id");
  if (error) return badRequest(res, error);

  req.params.id = req.params.id.trim();
  return next();
}

function validateAuctionIdParam(req, res, next) {
  const error = validateId(req.params?.auctionId, "Auction id");
  if (error) return badRequest(res, error);

  req.params.auctionId = req.params.auctionId.trim();
  return next();
}

function normalizeSettlementBody(req, res, next) {
  const incoming =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? req.body
      : null;

  if (!incoming) {
    return badRequest(res, "Request body must be a JSON object.");
  }

  const body = { ...incoming };

  if (body.auctionId !== undefined && body.auctionId !== null) {
    body.auctionId = String(body.auctionId).trim();
  }

  if (body.status !== undefined && body.status !== null) {
    body.status = String(body.status).trim().toUpperCase();
  }

  if (body.currency !== undefined && body.currency !== null) {
    body.currency = String(body.currency).trim().toUpperCase();
  }

  if (body.stripePaymentIntent !== undefined && body.stripePaymentIntent !== null) {
    body.stripePaymentIntent = String(body.stripePaymentIntent).trim();
  }

  if (
    body.finalAmountCents !== undefined &&
    body.finalAmountCents !== null &&
    !Number.isFinite(Number(body.finalAmountCents))
  ) {
    return badRequest(res, "finalAmountCents must be numeric.");
  }

  req.body = body;
  return next();
}

/**
 * Buyer/Admin
 * GET /api/settlements/mine
 *
 * Returns settlements visible to the authenticated buyer/admin.
 * This is the safest default route for the frontend MyWinsPage.
 */
router.get(
  "/mine",
  authRequired,
  requireRole(...BUYER_ROLES),
  asyncRoute(listMySettlements),
);

/**
 * Buyer/Admin
 * GET /api/settlements/:id
 *
 * Returns a single settlement by settlement id.
 */
router.get(
  "/:id",
  authRequired,
  requireRole(...BUYER_ROLES),
  validateSettlementIdParam,
  asyncRoute(getSettlementById),
);

/**
 * Buyer/Admin
 * GET /api/settlements/auction/:auctionId
 *
 * Returns a settlement using the related auction id.
 * Useful for auction-detail or wins-detail workflows.
 */
router.get(
  "/auction/:auctionId",
  authRequired,
  requireRole(...BUYER_ROLES),
  validateAuctionIdParam,
  asyncRoute(getSettlementByAuctionId),
);

/**
 * Admin
 * GET /api/settlements
 *
 * Returns all settlements for admin oversight/reporting.
 */
router.get(
  "/",
  authRequired,
  requireRole(...ADMIN_ROLES),
  asyncRoute(listAllSettlementsForAdmin),
);

/**
 * Admin
 * POST /api/settlements
 *
 * Creates or finalizes a settlement record.
 * Leave controller-level validation/business rules as the source of truth.
 */
router.post(
  "/",
  authRequired,
  requireRole(...ADMIN_ROLES),
  normalizeSettlementBody,
  asyncRoute(createOrFinalizeSettlement),
);

export const SETTLEMENT_ROUTE_MAP = Object.freeze({
  mine: "GET /api/settlements/mine",
  byId: "GET /api/settlements/:id",
  byAuctionId: "GET /api/settlements/auction/:auctionId",
  adminList: "GET /api/settlements",
  createOrFinalize: "POST /api/settlements",
});

export default router;