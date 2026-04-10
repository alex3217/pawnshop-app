// File: apps/api/backend/src/routes/sellerPlans.routes.js

import { Router } from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import {
  adminSetShopPlan,
  getShopEntitlements,
  listAvailableSellerPlans,
} from "../controllers/sellerPlans.controller.js";

const router = Router();

const ALLOWED_PLAN_CODES = new Set(["FREE", "PRO", "PREMIUM", "ULTRA"]);
const ALLOWED_SUBSCRIPTION_STATUSES = new Set([
  "UNKNOWN",
  "ACTIVE",
  "TRIALING",
  "PAST_DUE",
  "INCOMPLETE",
  "INCOMPLETE_EXPIRED",
  "CANCELED",
  "CANCELLED",
  "PAUSED",
]);

function asyncRoute(handler) {
  return function wrappedRoute(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function badRequest(res, message, details = undefined) {
  return res.status(400).json({
    success: false,
    message,
    ...(details ? { details } : {}),
  });
}

function validateShopIdParam(req, res, next) {
  const rawId = req.params?.id;

  if (typeof rawId !== "string") {
    return badRequest(res, "Shop id is required.");
  }

  const id = rawId.trim();

  // Accept UUID/CUID/slug-like ids, but reject obviously broken values.
  if (!id || id.length > 128 || id.includes("/")) {
    return badRequest(res, "Invalid shop id.");
  }

  req.params.id = id;
  return next();
}

function normalizeSellerPlanPatchBody(req, res, next) {
  const incoming =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? req.body
      : null;

  if (!incoming) {
    return badRequest(res, "Request body must be a JSON object.");
  }

  const body = { ...incoming };
  const keys = Object.keys(body);

  if (keys.length === 0) {
    return badRequest(res, "Request body cannot be empty.");
  }

  // Accept common aliases from older/newer clients.
  const rawPlanCode = body.planCode ?? body.plan ?? body.code ?? null;
  if (rawPlanCode !== null && rawPlanCode !== undefined && rawPlanCode !== "") {
    const normalizedPlanCode = String(rawPlanCode).trim().toUpperCase();

    if (!ALLOWED_PLAN_CODES.has(normalizedPlanCode)) {
      return badRequest(res, "Invalid seller plan code.", {
        allowedPlanCodes: Array.from(ALLOWED_PLAN_CODES),
      });
    }

    body.planCode = normalizedPlanCode;

    // Preserve compatibility with controllers/services that may still read these keys.
    if (body.plan == null) body.plan = normalizedPlanCode;
    if (body.code == null) body.code = normalizedPlanCode;
  }

  if (body.status !== undefined && body.status !== null && body.status !== "") {
    const normalizedStatus = String(body.status).trim().toUpperCase();

    if (!ALLOWED_SUBSCRIPTION_STATUSES.has(normalizedStatus)) {
      return badRequest(res, "Invalid subscription status.", {
        allowedStatuses: Array.from(ALLOWED_SUBSCRIPTION_STATUSES),
      });
    }

    body.status = normalizedStatus === "CANCELLED" ? "CANCELED" : normalizedStatus;
  }

  if (
    body.cancelAtPeriodEnd !== undefined &&
    typeof body.cancelAtPeriodEnd !== "boolean"
  ) {
    return badRequest(res, "cancelAtPeriodEnd must be a boolean.");
  }

  if (
    body.currentPeriodEnd !== undefined &&
    body.currentPeriodEnd !== null &&
    body.currentPeriodEnd !== ""
  ) {
    const parsed = new Date(body.currentPeriodEnd);

    if (Number.isNaN(parsed.getTime())) {
      return badRequest(res, "currentPeriodEnd must be a valid date/time value.");
    }

    body.currentPeriodEnd = parsed.toISOString();
  }

  if (
    body.stripeCustomerId !== undefined &&
    body.stripeCustomerId !== null &&
    typeof body.stripeCustomerId !== "string"
  ) {
    return badRequest(res, "stripeCustomerId must be a string or null.");
  }

  if (
    body.stripeSubscriptionId !== undefined &&
    body.stripeSubscriptionId !== null &&
    typeof body.stripeSubscriptionId !== "string"
  ) {
    return badRequest(res, "stripeSubscriptionId must be a string or null.");
  }

  req.body = body;
  return next();
}

/**
 * Public
 * GET /api/seller-plans
 *
 * Returns the platform's available seller subscription plans
 * in display order, including FREE / PRO / PREMIUM / ULTRA.
 */
router.get("/seller-plans", asyncRoute(listAvailableSellerPlans));

/**
 * Owner/Admin
 * GET /api/shops/:id/entitlements
 *
 * Returns the effective plan, limits, features, billing, and usage
 * for a specific shop.
 *
 * Access:
 * - OWNER: their own shop only
 * - ADMIN: any shop
 *
 * Final authorization should still be enforced in the controller/service layer.
 */
router.get(
  "/shops/:id/entitlements",
  authRequired,
  requireRole("OWNER", "ADMIN"),
  validateShopIdParam,
  asyncRoute(getShopEntitlements)
);

/**
 * Owner/Admin
 * PATCH /api/shops/:id/subscription
 *
 * Manual plan assignment/update endpoint used by the owner subscription page.
 * This supports FREE / PRO / PREMIUM / ULTRA flows until Stripe checkout
 * and webhook automation fully own the subscription lifecycle.
 *
 * Access:
 * - OWNER: their own shop only
 * - ADMIN: any shop
 *
 * Final authorization and plan validation should still be enforced
 * in the controller/service layer.
 */
router.patch(
  "/shops/:id/subscription",
  authRequired,
  requireRole("OWNER", "ADMIN"),
  validateShopIdParam,
  normalizeSellerPlanPatchBody,
  asyncRoute(adminSetShopPlan)
);

export default router;