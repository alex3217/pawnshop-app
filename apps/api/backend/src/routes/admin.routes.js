// File: apps/api/backend/src/routes/admin.routes.js

import { Router } from "express";
import { prisma } from "../lib/prisma.js";
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

function getAdminAuditActorEmail(req) {
  return req?.user?.email || req?.user?.username || null;
}

function buildAdminInventoryAuditActions(req) {
  const path = String(req?.route?.path || req?.path || "");
  const method = String(req?.method || "").toUpperCase();
  const actions = [];

  if (path.includes("/items/:id") && method === "DELETE") {
    actions.push({
      action: "MODERATE_ITEM_REMOVE",
      targetType: "ITEM",
      targetId: req.params?.id,
      metadata: {
        moderationType: "soft_delete",
      },
    });
  }

  if (path.includes("/items/:id/restore") && method === "PATCH") {
    actions.push({
      action: "MODERATE_ITEM_RESTORE",
      targetType: "ITEM",
      targetId: req.params?.id,
      metadata: {
        moderationType: "restore",
      },
    });
  }

  return actions.filter((entry) => entry.targetId);
}

function auditAdminInventoryModeration(req, res, next) {
  const actions = buildAdminInventoryAuditActions(req);

  if (!actions.length) {
    next();
    return;
  }

  res.on("finish", () => {
    const statusCode = Number(res.statusCode || 0);
    const success = statusCode >= 200 && statusCode < 400;

    void Promise.all(
      actions.map((entry) =>
        prisma.superAdminAuditLog.create({
          data: {
            actorId: req?.user?.sub ?? null,
            actorEmail: getAdminAuditActorEmail(req),
            actorRole: req?.user?.role ?? null,
            action: entry.action,
            method: req?.method ?? "UNKNOWN",
            path: req?.originalUrl ?? req?.url ?? "",
            routeKey: req?.route?.path ? String(req.route.path) : null,
            targetType: entry.targetType,
            targetId: entry.targetId,
            statusCode,
            success,
            requestId: req?.id ?? req?.requestId ?? null,
            ipAddress: req?.ip ?? null,
            userAgent: typeof req?.get === "function" ? req.get("user-agent") : null,
            metadata: entry.metadata || {},
          },
        }),
      ),
    ).catch((error) => {
      console.warn("[admin:inventory-audit] Failed to write inventory moderation audit log", {
        error: error?.message || error,
      });
    });
  });

  next();
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
  "/items/:id", auditAdminInventoryModeration,
  validateIdParam("id", "Item id"),
  asyncRoute(softDeleteItem),
);
router.patch(
  "/items/:id/restore", auditAdminInventoryModeration,
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