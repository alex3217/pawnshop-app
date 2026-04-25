// File: apps/api/backend/src/routes/locations.routes.js

import { Router } from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import {
  listShops,
  myShops,
  createShop,
  updateShop,
  getShopItems,
} from "../controllers/shops.controller.js";

const router = Router();

const LOCATION_ROLES = ["OWNER", "ADMIN"];
const LOCATION_ID_MAX_LENGTH = 128;

/**
 * Why this route file is an alias layer over shops:
 * - In the current backend, a "location" is a PawnShop/store location.
 * - shops.controller.js already contains the hardened Prisma logic for reads/writes.
 * - Reusing that controller prevents business-logic drift between /shops and /locations.
 * - This gives the frontend a stable "locations" vocabulary without duplicating logic.
 */

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

function validateLocationIdParam(req, res, next) {
  const rawId = req.params?.id;

  if (typeof rawId !== "string") {
    return badRequest(res, "Location id is required.");
  }

  const id = rawId.trim();

  // Accept UUID/CUID/slug-like ids, reject obviously malformed values.
  if (!id || id.length > LOCATION_ID_MAX_LENGTH || id.includes("/")) {
    return badRequest(res, "Invalid location id.");
  }

  req.params.id = id;
  return next();
}

/**
 * Public
 * GET /api/locations
 *
 * Returns public-facing locations.
 * Alias of GET /api/shops.
 */
router.get("/", asyncRoute(listShops));

/**
 * Owner/Admin
 * GET /api/locations/mine
 *
 * Returns locations for the authenticated owner/admin.
 * Alias of GET /api/shops/mine.
 */
router.get(
  "/mine",
  authRequired,
  requireRole(...LOCATION_ROLES),
  asyncRoute(myShops),
);

/**
 * Public
 * GET /api/locations/:id/items
 *
 * Returns inventory for a single location.
 * Alias of GET /api/shops/:id/items.
 */
router.get(
  "/:id/items",
  validateLocationIdParam,
  asyncRoute(getShopItems),
);

/**
 * Owner/Admin
 * POST /api/locations
 *
 * Creates a new location/shop for the authenticated owner/admin.
 * Alias of POST /api/shops.
 */
router.post(
  "/",
  authRequired,
  requireRole(...LOCATION_ROLES),
  asyncRoute(createShop),
);

/**
 * Owner/Admin
 * PUT /api/locations/:id
 *
 * Full update of an owned location/shop.
 * Alias of PUT /api/shops/:id.
 */
router.put(
  "/:id",
  authRequired,
  requireRole(...LOCATION_ROLES),
  validateLocationIdParam,
  asyncRoute(updateShop),
);

/**
 * Owner/Admin
 * PATCH /api/locations/:id
 *
 * Partial update alias for clients that prefer PATCH semantics.
 * Reuses the same controller as PUT for now.
 */
router.patch(
  "/:id",
  authRequired,
  requireRole(...LOCATION_ROLES),
  validateLocationIdParam,
  asyncRoute(updateShop),
);

/**
 * Reserved route notes:
 * We intentionally do not add GET /:id here yet because shops.controller.js
 * currently exposes list/mine/items/create/update but not a dedicated single-shop
 * detail controller. Keeping this route absent is safer than inventing behavior.
 */
export const LOCATION_ROUTE_MAP = Object.freeze({
  list: "GET /api/locations",
  mine: "GET /api/locations/mine",
  items: "GET /api/locations/:id/items",
  create: "POST /api/locations",
  updatePut: "PUT /api/locations/:id",
  updatePatch: "PATCH /api/locations/:id",
});

export default router;