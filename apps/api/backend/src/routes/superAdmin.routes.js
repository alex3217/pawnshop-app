// File: apps/api/backend/src/routes/superAdmin.routes.js

import { Router } from "express";
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
  restoreSuperAdminIntegration,
  createSuperAdminShop,
  reassignSuperAdminShopOwner,
  updateSuperAdminShop,
  getSuperAdminSellerPlans,
  previewSuperAdminSellerPlanImpact,
  validateSuperAdminSellerPlanStripeReferences,
  updateSuperAdminSellerPlan,
  getSuperAdminBuyerPlans,
  listSuperAdminBuyerSubscriptions,
  updateSuperAdminBuyerSubscription,
  applySuperAdminBuyerSubscriptionLifecycle,
  listSuperAdminSettlements,
  updateSuperAdminSettlement,
  getSuperAdminRevenueSummary,
  getSuperAdminPlatformSettings,
  updateSuperAdminPlatformSettings,
  listPlatformConfigurations,
  createPlatformConfiguration,
  updatePlatformConfiguration,
  listSuperAdminPricingRules,
  createSuperAdminPricingRule,
  updateSuperAdminPricingRule,
} from "../controllers/superAdmin.controller.js";
import {
  createBetaInvite,
  getBetaInvite,
  listBetaInvites,
  revokeBetaInvite,
} from "../controllers/betaInvites.controller.js";
import {
  archiveGrowthLead,
  convertGrowthLead,
  createGrowthActivity,
  createGrowthContact,
  createGrowthLead,
  getGrowthLead,
  getGrowthSummary,
  listGrowthActivities,
  listGrowthLeads,
  suppressGrowthLead,
  updateGrowthContact,
  updateGrowthLead,
} from "../controllers/growthCenter.controller.js";
import {
  startInventorySupport,
  endInventorySupport,
  listSupportInventory,
  createSupportInventory,
  updateSupportInventory,
  changeListingState,
  listInventoryHistory,
  listInventoryLocations,
  createInventoryLocation,
} from "../controllers/inventorySupport.controller.js";

const router = Router();

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
  startShopSupport: "POST /api/super-admin/shops/:shopId/support-sessions",
  updateShop: "PATCH /api/super-admin/shops/:id",
  sellerPlans: "GET /api/super-admin/plans/seller",
  validateSellerPlanStripe: "POST /api/super-admin/plans/seller/:code/validate-stripe",
  buyerPlans: "GET /api/super-admin/plans/buyer",
  buyerSubscriptions: "GET /api/super-admin/buyer-subscriptions",
  updateBuyerSubscription: "PATCH /api/super-admin/buyer-subscriptions/:id",
  buyerSubscriptionLifecycle: "POST /api/super-admin/buyer-subscriptions/:id/lifecycle",
  settlements: "GET /api/super-admin/settlements",
  updateSettlement: "PATCH /api/super-admin/settlements/:id",
  revenue: "GET /api/super-admin/revenue",
  integrations: "GET /api/super-admin/integrations",
  archiveIntegration: "PATCH /api/super-admin/integrations/:id/archive",
  restoreIntegration: "PATCH /api/super-admin/integrations/:id/restore",
  platformSettings: "GET /api/super-admin/platform-settings",
  updatePlatformSettings: "PATCH /api/super-admin/platform-settings",
  growthSummary: "GET /api/super-admin/growth/leads/summary",
  growthLeads: "GET /api/super-admin/growth/leads",
  growthLead: "GET /api/super-admin/growth/leads/:leadId",
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
router.post("/beta-invites", asyncRoute(createBetaInvite));
router.get("/beta-invites", asyncRoute(listBetaInvites));
router.get("/beta-invites/:id", asyncRoute(getBetaInvite));
router.post("/beta-invites/:id/revoke", asyncRoute(revokeBetaInvite));

router.patch(
  "/users/:id",
  validateIdParam("id", "User id"),
  validateJsonObjectBody,
  asyncRoute(updateSuperAdminUser)
);

router.post("/shops", asyncRoute(createSuperAdminShop));
router.patch("/shops/:id/owner", asyncRoute(reassignSuperAdminShopOwner));
router.get("/integrations", asyncRoute(listSuperAdminIntegrations));
router.patch("/integrations/:id/archive", asyncRoute(archiveSuperAdminIntegration));
router.patch("/integrations/:id/restore", asyncRoute(restoreSuperAdminIntegration));

router.get("/shops", asyncRoute(listSuperAdminShops));

router.post("/shops/:shopId/support-sessions", validateIdParam("shopId", "Shop id"), validateJsonObjectBody, asyncRoute(startInventorySupport));
router.post("/shops/:shopId/support-sessions/end", validateIdParam("shopId", "Shop id"), validateJsonObjectBody, asyncRoute(endInventorySupport));
router.get("/shops/:shopId/inventory", validateIdParam("shopId", "Shop id"), asyncRoute(listSupportInventory));
router.post("/shops/:shopId/inventory", validateIdParam("shopId", "Shop id"), validateJsonObjectBody, asyncRoute(createSupportInventory));
router.patch("/shops/:shopId/inventory/:itemId", validateIdParam("shopId", "Shop id"), validateIdParam("itemId", "Item id"), validateJsonObjectBody, asyncRoute(updateSupportInventory));
router.post("/shops/:shopId/inventory/:itemId/listing", validateIdParam("shopId", "Shop id"), validateIdParam("itemId", "Item id"), validateJsonObjectBody, asyncRoute(changeListingState));
router.get("/shops/:shopId/inventory/history", validateIdParam("shopId", "Shop id"), asyncRoute(listInventoryHistory));
router.get("/shops/:shopId/inventory/:itemId/history", validateIdParam("shopId", "Shop id"), validateIdParam("itemId", "Item id"), asyncRoute(listInventoryHistory));
router.get("/shops/:shopId/inventory-locations", validateIdParam("shopId", "Shop id"), asyncRoute(listInventoryLocations));
router.post("/shops/:shopId/inventory-locations", validateIdParam("shopId", "Shop id"), validateJsonObjectBody, asyncRoute(createInventoryLocation));

router.patch(
  "/shops/:id",
  validateIdParam("id", "Shop id"),
  validateJsonObjectBody,
  asyncRoute(updateSuperAdminShop)
);

router.get("/plans/seller", asyncRoute(getSuperAdminSellerPlans));
router.post("/plans/seller/:code/impact", validateJsonObjectBody, asyncRoute(previewSuperAdminSellerPlanImpact));
router.post("/plans/seller/:code/validate-stripe", validateJsonObjectBody, asyncRoute(validateSuperAdminSellerPlanStripeReferences));
router.patch("/plans/seller/:code", validateJsonObjectBody, asyncRoute(updateSuperAdminSellerPlan));
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

router.post(
  "/buyer-subscriptions/:id/lifecycle",
  validateIdParam("id", "Buyer subscription id"),
  validateJsonObjectBody,
  asyncRoute(
    applySuperAdminBuyerSubscriptionLifecycle,
  ),
);

router.get("/settlements", asyncRoute(listSuperAdminSettlements));

router.patch(
  "/settlements/:id",
  validateIdParam("id", "Settlement id"),
  validateJsonObjectBody,
  asyncRoute(updateSuperAdminSettlement)
);

router.get("/revenue", asyncRoute(getSuperAdminRevenueSummary));

router.get("/growth/leads/summary", asyncRoute(getGrowthSummary));
router.get("/growth/leads", asyncRoute(listGrowthLeads));
router.post(
  "/growth/leads",
  validateJsonObjectBody,
  asyncRoute(createGrowthLead),
);
router.get(
  "/growth/leads/:leadId",
  validateIdParam("leadId", "Lead id"),
  asyncRoute(getGrowthLead),
);
router.patch(
  "/growth/leads/:leadId",
  validateIdParam("leadId", "Lead id"),
  validateJsonObjectBody,
  asyncRoute(updateGrowthLead),
);
router.delete(
  "/growth/leads/:leadId",
  validateIdParam("leadId", "Lead id"),
  asyncRoute(archiveGrowthLead),
);
router.post(
  "/growth/leads/:leadId/contacts",
  validateIdParam("leadId", "Lead id"),
  validateJsonObjectBody,
  asyncRoute(createGrowthContact),
);
router.patch(
  "/growth/leads/:leadId/contacts/:contactId",
  validateIdParam("leadId", "Lead id"),
  validateIdParam("contactId", "Contact id"),
  validateJsonObjectBody,
  asyncRoute(updateGrowthContact),
);
router.post(
  "/growth/leads/:leadId/activities",
  validateIdParam("leadId", "Lead id"),
  validateJsonObjectBody,
  asyncRoute(createGrowthActivity),
);
router.get(
  "/growth/leads/:leadId/activities",
  validateIdParam("leadId", "Lead id"),
  asyncRoute(listGrowthActivities),
);
router.post(
  "/growth/leads/:leadId/suppress",
  validateIdParam("leadId", "Lead id"),
  validateJsonObjectBody,
  asyncRoute(suppressGrowthLead),
);
router.post(
  "/growth/leads/:leadId/convert",
  validateIdParam("leadId", "Lead id"),
  validateJsonObjectBody,
  asyncRoute(convertGrowthLead),
);


router.get("/pricing-rules", asyncRoute(listSuperAdminPricingRules));

router.post(
  "/pricing-rules",
  validateJsonObjectBody,
  asyncRoute(createSuperAdminPricingRule)
);

router.patch(
  "/pricing-rules/:id",
  validateIdParam("id", "Pricing rule id"),
  validateJsonObjectBody,
  asyncRoute(updateSuperAdminPricingRule)
);

router.get("/platform-settings", asyncRoute(getSuperAdminPlatformSettings));

router.patch(
  "/platform-settings",
  validateJsonObjectBody,
  asyncRoute(updateSuperAdminPlatformSettings)
);

router.get(
  "/platform-settings/configurations/:area",
  asyncRoute(listPlatformConfigurations),
);
router.post(
  "/platform-settings/configurations/:area",
  validateJsonObjectBody,
  asyncRoute(createPlatformConfiguration),
);
router.patch(
  "/platform-settings/configurations/:area/:id",
  validateIdParam("id", "Configuration id"),
  validateJsonObjectBody,
  asyncRoute(updatePlatformConfiguration),
);

export default router;
