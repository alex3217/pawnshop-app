// File: apps/api/backend/src/routes/superAdmin.routes.js

import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import {
  auditSuperAdminMutation as persistedSuperAdminAuditMutation,
  listSuperAdminAuditLogs,
} from "../services/superAdminAudit.service.js";
import { authRequired, requireRole } from "../middleware/auth.js";
import {
  getSuperAdminOverview,
  getSuperAdminSystemHealth,
  listSuperAdminUsers,
  updateSuperAdminUser,
  listSuperAdminShops,
  listSuperAdminIntegrations,
  archiveSuperAdminIntegration,
  createSuperAdminShop,
  reassignSuperAdminShopOwner,
  updateSuperAdminShop,
  getSuperAdminSellerPlans,
  getSuperAdminBuyerPlans,
  listSuperAdminBuyerSubscriptions,
  updateSuperAdminBuyerSubscription,
  listSuperAdminSettlements,
  updateSuperAdminSettlement,
  getSuperAdminRevenueSummary,
  getSuperAdminPlatformSettings,
  updateSuperAdminPlatformSettings,
} from "../controllers/superAdmin.controller.js";

const router = Router();

function getActorEmail(req) {
  return req?.user?.email || req?.user?.username || null;
}

function buildGovernanceAuditActions(req) {
  const path = String(req?.route?.path || req?.path || "");
  const body = req?.body || {};
  const actions = [];

  if (path.includes("/users/:id")) {
    if (Object.prototype.hasOwnProperty.call(body, "role")) {
      actions.push({
        action: "UPDATE_USER_ROLE",
        targetType: "USER",
        targetId: req.params?.id,
        metadata: {
          newRole: body.role,
        },
      });
    }

    if (Object.prototype.hasOwnProperty.call(body, "isActive")) {
      actions.push({
        action: body.isActive === false ? "DEACTIVATE_USER" : "ACTIVATE_USER",
        targetType: "USER",
        targetId: req.params?.id,
        metadata: {
          isActive: body.isActive,
        },
      });
    }
  }

  if (path.includes("/shops/:id")) {
    if (Object.prototype.hasOwnProperty.call(body, "subscriptionPlan")) {
      actions.push({
        action: "UPDATE_SHOP_PLAN",
        targetType: "SHOP",
        targetId: req.params?.id,
        metadata: {
          subscriptionPlan: body.subscriptionPlan,
        },
      });
    }

    if (Object.prototype.hasOwnProperty.call(body, "subscriptionStatus")) {
      actions.push({
        action: "UPDATE_SHOP_STATUS",
        targetType: "SHOP",
        targetId: req.params?.id,
        metadata: {
          subscriptionStatus: body.subscriptionStatus,
        },
      });
    }

    if (Object.prototype.hasOwnProperty.call(body, "isDeleted")) {
      actions.push({
        action: body.isDeleted === true ? "DISABLE_SHOP" : "RESTORE_SHOP",
        targetType: "SHOP",
        targetId: req.params?.id,
        metadata: {
          isDeleted: body.isDeleted,
        },
      });
    }
  }

  return actions.filter((entry) => entry.targetId);
}

function auditSuperAdminGovernanceMutation(req, res, next) {
  const actions = buildGovernanceAuditActions(req);

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
            actorEmail: getActorEmail(req),
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
      console.warn("[super-admin:audit] Failed to write mutation audit log", {
        error: error?.message || error,
      });
    });
  });

  next();
}



const SUPER_ADMIN_ROLES = ["SUPER_ADMIN"];
const ID_MAX_LENGTH = 128;
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const SUPER_ADMIN_ROUTE_MAP = Object.freeze({
  root: "GET /api/super-admin",
  health: "GET /api/super-admin/health",
  overview: "GET /api/super-admin/overview",
  users: "GET /api/super-admin/users",
  updateUser: "PATCH /api/super-admin/users/:id",
  shops: "GET /api/super-admin/shops",
  updateShop: "PATCH /api/super-admin/shops/:id",
  sellerPlans: "GET /api/super-admin/plans/seller",
  buyerPlans: "GET /api/super-admin/plans/buyer",
  buyerSubscriptions: "GET /api/super-admin/buyer-subscriptions",
  updateBuyerSubscription: "PATCH /api/super-admin/buyer-subscriptions/:id",
  settlements: "GET /api/super-admin/settlements",
  updateSettlement: "PATCH /api/super-admin/settlements/:id",
  revenue: "GET /api/super-admin/revenue",
  platformSettings: "GET /api/super-admin/platform-settings",
  updatePlatformSettings: "PATCH /api/super-admin/platform-settings",
});

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

function normalizeRole(value) {
  return String(value || "").trim().toUpperCase();
}

function setNoStore(_req, res, next) {
  res.setHeader("Cache-Control", "no-store");
  next();
}

function requireJsonContentType(req, res, next) {
  if (!MUTATING_METHODS.has(req.method)) return next();

  if (req.method === "DELETE") return next();

  const contentType = String(req.headers["content-type"] || "").toLowerCase();

  if (!contentType.includes("application/json")) {
    return badRequest(res, "Content-Type must be application/json.");
  }

  return next();
}

function validateIdParam(paramName, label) {
  return function validate(req, res, next) {
    const raw = req.params?.[paramName];

    if (typeof raw !== "string") {
      return badRequest(res, `${label} is required.`);
    }

    const id = raw.trim();

    if (!id || id.length > ID_MAX_LENGTH || id.includes("/")) {
      return badRequest(res, `Invalid ${label.toLowerCase()}.`);
    }

    req.params[paramName] = id;
    return next();
  };
}

function validateJsonObjectBody(req, res, next) {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return badRequest(res, "Request body must be a JSON object.");
  }

  return next();
}

function attachSuperAdminContext(req, res, next) {
  const user = req.user;

  if (!user) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized",
    });
  }

  if (normalizeRole(user.role) !== "SUPER_ADMIN") {
    return res.status(403).json({
      success: false,
      error: "Super Admin access required",
    });
  }

  req.superAdmin = {
    id: String(user.sub || user.id || user.userId || "").trim(),
    email: String(user.email || "").trim().toLowerCase(),
    role: normalizeRole(user.role),
  };

  return next();
}

function auditSuperAdminMutation(req, res, next) {
  if (!MUTATING_METHODS.has(req.method)) return next();

  const startedAt = Date.now();

  res.on("finish", () => {
    console.info("[super-admin:audit]", {
      requestId: req.requestId || null,
      actorId: req.superAdmin?.id || null,
      actorEmail: req.superAdmin?.email || null,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      params: req.params || {},
    });
  });

  return next();
}

router.use(setNoStore);
router.use(authRequired, requireRole(...SUPER_ADMIN_ROLES));
router.use(attachSuperAdminContext);
router.use(requireJsonContentType);
router.use(persistedSuperAdminAuditMutation);

router.get(
  "/",
  asyncRoute(async (req, res) => {
    return res.json({
      success: true,
      area: "super-admin",
      actor: req.superAdmin,
      routes: SUPER_ADMIN_ROUTE_MAP,
    });
  })
);

router.get(
  "/health",
  asyncRoute(async (req, res) => {
    return res.json({
      success: true,
      ok: true,
      area: "super-admin",
      actorRole: req.superAdmin?.role || null,
      ts: new Date().toISOString(),
    });
  })
);

router.get("/audit", asyncRoute(listSuperAdminAuditLogs));
router.get("/overview", asyncRoute(getSuperAdminOverview));
router.get("/system", asyncRoute(getSuperAdminSystemHealth));
router.get("/users", asyncRoute(listSuperAdminUsers));

router.patch(
  "/users/:id", auditSuperAdminGovernanceMutation,
  validateIdParam("id", "User id"),
  validateJsonObjectBody,
  asyncRoute(updateSuperAdminUser)
);

router.post("/shops", asyncRoute(createSuperAdminShop));
router.patch("/shops/:id/owner", asyncRoute(reassignSuperAdminShopOwner));
router.get("/integrations", asyncRoute(listSuperAdminIntegrations));
router.patch("/integrations/:id/archive", asyncRoute(archiveSuperAdminIntegration));

router.get("/shops", asyncRoute(listSuperAdminShops));

router.patch(
  "/shops/:id", auditSuperAdminGovernanceMutation,
  validateIdParam("id", "Shop id"),
  validateJsonObjectBody,
  asyncRoute(updateSuperAdminShop)
);

router.get("/plans/seller", asyncRoute(getSuperAdminSellerPlans));
router.get("/plans/buyer", asyncRoute(getSuperAdminBuyerPlans));

router.get(
  "/buyer-subscriptions",
  asyncRoute(listSuperAdminBuyerSubscriptions)
);

router.patch(
  "/buyer-subscriptions/:id",
  validateIdParam("id", "Buyer subscription id"),
  validateJsonObjectBody,
  asyncRoute(updateSuperAdminBuyerSubscription)
);

router.get("/settlements", asyncRoute(listSuperAdminSettlements));

router.patch(
  "/settlements/:id",
  validateIdParam("id", "Settlement id"),
  validateJsonObjectBody,
  asyncRoute(updateSuperAdminSettlement)
);

router.get("/revenue", asyncRoute(getSuperAdminRevenueSummary));

router.get("/platform-settings", asyncRoute(getSuperAdminPlatformSettings));

router.patch(
  "/platform-settings",
  validateJsonObjectBody,
  asyncRoute(updateSuperAdminPlatformSettings)
);

export default router;