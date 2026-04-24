// File: apps/api/backend/src/routes/staff.routes.js

import { Router } from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import {
  listMyStaff,
  listStaffByShop,
  createStaffMember,
  updateStaffMember,
  removeStaffMember,
} from "../controllers/staff.controller.js";

const router = Router();

const STAFF_ROLES = ["OWNER", "ADMIN"];
const STAFF_ID_MAX_LENGTH = 128;
const SHOP_ID_MAX_LENGTH = 128;

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

function validateGenericId(value, label, maxLength) {
  if (typeof value !== "string") {
    return `${label} is required.`;
  }

  const trimmed = value.trim();

  if (!trimmed || trimmed.length > maxLength || trimmed.includes("/")) {
    return `Invalid ${label.toLowerCase()}.`;
  }

  return null;
}

function validateStaffIdParam(req, res, next) {
  const error = validateGenericId(req.params?.id, "Staff id", STAFF_ID_MAX_LENGTH);
  if (error) return badRequest(res, error);

  req.params.id = req.params.id.trim();
  return next();
}

function validateShopIdParam(req, res, next) {
  const error = validateGenericId(
    req.params?.shopId,
    "Shop id",
    SHOP_ID_MAX_LENGTH,
  );
  if (error) return badRequest(res, error);

  req.params.shopId = req.params.shopId.trim();
  return next();
}

function normalizeStaffBody(req, res, next) {
  const incoming =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? req.body
      : null;

  if (!incoming) {
    return badRequest(res, "Request body must be a JSON object.");
  }

  const body = { ...incoming };

  if (body.name !== undefined && body.name !== null) {
    body.name = String(body.name).trim();
  }

  if (body.email !== undefined && body.email !== null) {
    body.email = String(body.email).trim().toLowerCase();
  }

  if (body.role !== undefined && body.role !== null) {
    body.role = String(body.role).trim().toUpperCase();
  }

  if (body.status !== undefined && body.status !== null) {
    body.status = String(body.status).trim().toUpperCase();
  }

  if (body.shopId !== undefined && body.shopId !== null) {
    body.shopId = String(body.shopId).trim();
  }

  req.body = body;
  return next();
}

/**
 * Owner/Admin
 * GET /api/staff/mine
 *
 * Returns all staff records visible to the current owner/admin.
 * This is the safest default route for the frontend OwnerStaffPage.
 */
router.get(
  "/mine",
  authRequired,
  requireRole(...STAFF_ROLES),
  asyncRoute(listMyStaff),
);

/**
 * Owner/Admin
 * GET /api/staff/shop/:shopId
 *
 * Returns staff assigned to a specific shop.
 */
router.get(
  "/shop/:shopId",
  authRequired,
  requireRole(...STAFF_ROLES),
  validateShopIdParam,
  asyncRoute(listStaffByShop),
);

/**
 * Owner/Admin
 * POST /api/staff
 *
 * Creates a new staff record for a shop owned by the authenticated owner/admin.
 */
router.post(
  "/",
  authRequired,
  requireRole(...STAFF_ROLES),
  normalizeStaffBody,
  asyncRoute(createStaffMember),
);

/**
 * Owner/Admin
 * PUT /api/staff/:id
 *
 * Full update of a staff record.
 */
router.put(
  "/:id",
  authRequired,
  requireRole(...STAFF_ROLES),
  validateStaffIdParam,
  normalizeStaffBody,
  asyncRoute(updateStaffMember),
);

/**
 * Owner/Admin
 * PATCH /api/staff/:id
 *
 * Partial update alias for staff record updates.
 */
router.patch(
  "/:id",
  authRequired,
  requireRole(...STAFF_ROLES),
  validateStaffIdParam,
  normalizeStaffBody,
  asyncRoute(updateStaffMember),
);

/**
 * Owner/Admin
 * DELETE /api/staff/:id
 *
 * Removes or deactivates a staff record, depending on controller behavior.
 */
router.delete(
  "/:id",
  authRequired,
  requireRole(...STAFF_ROLES),
  validateStaffIdParam,
  asyncRoute(removeStaffMember),
);

export const STAFF_ROUTE_MAP = Object.freeze({
  mine: "GET /api/staff/mine",
  byShop: "GET /api/staff/shop/:shopId",
  create: "POST /api/staff",
  updatePut: "PUT /api/staff/:id",
  updatePatch: "PATCH /api/staff/:id",
  remove: "DELETE /api/staff/:id",
});

export default router;