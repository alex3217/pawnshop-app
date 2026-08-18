// File: apps/api/backend/src/routes/admin.routes.js

import { Router } from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import {
  listUsers,
  blockUser,
  unblockUser,
  adminListItems,
  createAdminItem,
  softDeleteItem,
  restoreItem,
  adminListShops,
  softDeleteShop,
  restoreShop,
  adminListSubscriptions,
  updateAdminItem,
  updateAdminShop,
  createAdminShop,
  updateAdminUser,
  createAdminUser,
  listOwnerApplications,
  getOwnerApplication,
  getOwnerApplicationReviewHistory,
  updateOwnerApplicationStatus,
} from "../controllers/admin.controller.js";
import { requireMfaStepUp, requireMfaStepUpWhenRequired } from "../middleware/mfaStepUp.js";

const router = Router();
const requireOwnerAccessProof = requireMfaStepUpWhenRequired("privilege.owner-access.review");

function requireOwnerAccessTransitionStepUp(req, res, next) {
  return new Set(["APPROVED", "SUSPENDED"]).has(String(req.body?.status || "").trim().toUpperCase())
    ? requireOwnerAccessProof(req, res, next)
    : next();
}

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
router.post("/users", requireMfaStepUp("privilege.admin-user.create"), asyncRoute(createAdminUser));
router.patch(
  "/users/:id",
  validateIdParam("id", "User id"),
  requireMfaStepUp("privilege.admin-user.update"),
  asyncRoute(updateAdminUser),
);
router.delete(
  "/users/:id",
  validateIdParam("id", "User id"),
  requireMfaStepUp("privilege.admin-user.block"),
  asyncRoute(blockUser),
);
router.patch(
  "/users/:id/unblock",
  validateIdParam("id", "User id"),
  requireMfaStepUp("privilege.admin-user.unblock"),
  asyncRoute(unblockUser),
);

// OWNER APPLICATION REVIEW ROUTES V1
router.get(
  "/owner-applications",
  asyncRoute(listOwnerApplications),
);
router.get(
  "/owner-applications/:id",
  validateIdParam("id", "Owner application id"),
  asyncRoute(getOwnerApplication),
);
router.get(
  "/owner-applications/:id/history",
  validateIdParam("id", "Owner application id"),
  asyncRoute(getOwnerApplicationReviewHistory),
);
router.patch(
  "/owner-applications/:id/status",
  validateIdParam("id", "Owner application id"),
  requireOwnerAccessTransitionStepUp,
  asyncRoute(updateOwnerApplicationStatus),
);

router.get("/items", asyncRoute(adminListItems));
router.post("/items", asyncRoute(createAdminItem));
router.patch(
  "/items/:id",
  validateIdParam("id", "Item id"),
  asyncRoute(updateAdminItem),
);
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
router.post("/shops", asyncRoute(createAdminShop));
router.patch(
  "/shops/:id",
  validateIdParam("id", "Shop id"),
  asyncRoute(updateAdminShop),
);
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
  createUser: "POST /api/admin/users",
  updateUser: "PATCH /api/admin/users/:id",
  blockUser: "DELETE /api/admin/users/:id",
  unblockUser: "PATCH /api/admin/users/:id/unblock",
  ownerApplications: "GET /api/admin/owner-applications",
  ownerApplication: "GET /api/admin/owner-applications/:id",
  ownerApplicationReviewHistory:
    "GET /api/admin/owner-applications/:id/history",
  updateOwnerApplicationStatus:
    "PATCH /api/admin/owner-applications/:id/status",
  items: "GET /api/admin/items",
  createItem: "POST /api/admin/items",
  updateItem: "PATCH /api/admin/items/:id",
  deleteItem: "DELETE /api/admin/items/:id",
  restoreItem: "PATCH /api/admin/items/:id/restore",
  shops: "GET /api/admin/shops",
  createShop: "POST /api/admin/shops",
  updateShop: "PATCH /api/admin/shops/:id",
  deleteShop: "DELETE /api/admin/shops/:id",
  restoreShop: "PATCH /api/admin/shops/:id/restore",
  subscriptions: "GET /api/admin/subscriptions",
});

export default router;
