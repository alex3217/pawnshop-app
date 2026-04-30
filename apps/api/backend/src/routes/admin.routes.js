// File: apps/api/backend/src/routes/admin.routes.js

import { Router } from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import {
  listUsers,
  blockUser,
  unblockUser,
  adminListItems,
  softDeleteItem,
  restoreItem,
  adminListShops,
  softDeleteShop,
  restoreShop,
  adminListSubscriptions,
} from "../controllers/admin.controller.js";

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

function validateIdParam(paramName, label) {
  return function validate(req, res, next) {
    const raw = req.params?.[paramName];

    if (typeof raw !== "string") {
      return badRequest(res, `${label} is required.`);
    }

    const id = raw.trim();

    if (!id || id.length > 128 || id.includes("/")) {
      return badRequest(res, `Invalid ${label.toLowerCase()}.`);
    }

    req.params[paramName] = id;
    return next();
  };
}

router.use(authRequired, requireRole("ADMIN", "SUPER_ADMIN"));

router.get("/users", asyncRoute(listUsers));
router.delete(
  "/users/:id",
  validateIdParam("id", "User id"),
  asyncRoute(blockUser),
);
router.patch(
  "/users/:id/unblock",
  validateIdParam("id", "User id"),
  asyncRoute(unblockUser),
);

router.get("/items", asyncRoute(adminListItems));
router.delete(
  "/items/:id",
  validateIdParam("id", "Item id"),
  asyncRoute(softDeleteItem),
);
router.patch(
  "/items/:id/restore",
  validateIdParam("id", "Item id"),
  asyncRoute(restoreItem),
);

router.get("/shops", asyncRoute(adminListShops));
router.delete(
  "/shops/:id",
  validateIdParam("id", "Shop id"),
  asyncRoute(softDeleteShop),
);
router.patch(
  "/shops/:id/restore",
  validateIdParam("id", "Shop id"),
  asyncRoute(restoreShop),
);

/**
 * GET /api/admin/subscriptions
 *
 * Returns shop + owner + subscription summary for admin oversight.
 */
router.get("/subscriptions", asyncRoute(adminListSubscriptions));

export const ADMIN_ROUTE_MAP = Object.freeze({
  users: "GET /api/admin/users",
  blockUser: "DELETE /api/admin/users/:id",
  unblockUser: "PATCH /api/admin/users/:id/unblock",
  items: "GET /api/admin/items",
  deleteItem: "DELETE /api/admin/items/:id",
  restoreItem: "PATCH /api/admin/items/:id/restore",
  shops: "GET /api/admin/shops",
  deleteShop: "DELETE /api/admin/shops/:id",
  restoreShop: "PATCH /api/admin/shops/:id/restore",
  subscriptions: "GET /api/admin/subscriptions",
});

export default router;