// File: apps/api/backend/src/routes/buyerPlans.routes.js

import { Router } from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import {
  listAvailableBuyerPlans,
  getMyBuyerSubscription,
  upsertMyBuyerSubscription,
  cancelMyBuyerSubscription,
  adminListBuyerSubscriptions,
} from "../controllers/buyerPlans.controller.js";

const router = Router();

const BUYER_ROLES = ["CONSUMER", "ADMIN"];
const ADMIN_ROLES = ["ADMIN"];
const ALLOWED_PLAN_CODES = new Set(["FREE", "PLUS", "PREMIUM", "ULTRA"]);
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
    error: message,
    ...(details ? { details } : {}),
  });
}

function normalizeBuyerPlanBody(req, res, next) {
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

  const rawPlanCode = body.planCode ?? body.plan ?? body.code ?? null;
  if (rawPlanCode !== null && rawPlanCode !== undefined && rawPlanCode !== "") {
    const normalizedPlanCode = String(rawPlanCode).trim().toUpperCase();

    if (!ALLOWED_PLAN_CODES.has(normalizedPlanCode)) {
      return badRequest(res, "Invalid buyer plan code.", {
        allowedPlanCodes: Array.from(ALLOWED_PLAN_CODES),
      });
    }

    body.planCode = normalizedPlanCode;
    if (body.plan == null) body.plan = normalizedPlanCode;
    if (body.code == null) body.code = normalizedPlanCode;
  }

  if (body.status !== undefined && body.status !== null && body.status !== "") {
    const normalizedStatus = String(body.status).trim().toUpperCase();

    if (!ALLOWED_SUBSCRIPTION_STATUSES.has(normalizedStatus)) {
      return badRequest(res, "Invalid buyer subscription status.", {
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
 * GET /api/buyer-plans
 *
 * Returns the platform's available buyer subscription plans.
 */
router.get("/buyer-plans", asyncRoute(listAvailableBuyerPlans));

/**
 * Buyer/Admin
 * GET /api/buyer-plans/mine
 *
 * Returns the authenticated buyer's current buyer subscription/plan state.
 */
router.get(
  "/buyer-plans/mine",
  authRequired,
  requireRole(...BUYER_ROLES),
  asyncRoute(getMyBuyerSubscription),
);

/**
 * Buyer/Admin
 * PUT /api/buyer-plans/mine
 *
 * Creates or updates the authenticated buyer's buyer subscription record.
 */
router.put(
  "/buyer-plans/mine",
  authRequired,
  requireRole(...BUYER_ROLES),
  normalizeBuyerPlanBody,
  asyncRoute(upsertMyBuyerSubscription),
);

/**
 * Buyer/Admin
 * PATCH /api/buyer-plans/mine
 *
 * Partial update alias for buyer subscription management.
 */
router.patch(
  "/buyer-plans/mine",
  authRequired,
  requireRole(...BUYER_ROLES),
  normalizeBuyerPlanBody,
  asyncRoute(upsertMyBuyerSubscription),
);

/**
 * Buyer/Admin
 * DELETE /api/buyer-plans/mine
 *
 * Cancels or deactivates the authenticated buyer's buyer subscription.
 */
router.delete(
  "/buyer-plans/mine",
  authRequired,
  requireRole(...BUYER_ROLES),
  asyncRoute(cancelMyBuyerSubscription),
);

/**
 * Admin
 * GET /api/buyer-plans/subscriptions
 *
 * Returns all buyer subscription records for admin oversight.
 */
router.get(
  "/buyer-plans/subscriptions",
  authRequired,
  requireRole(...ADMIN_ROLES),
  asyncRoute(adminListBuyerSubscriptions),
);

export const BUYER_PLAN_ROUTE_MAP = Object.freeze({
  listPlans: "GET /api/buyer-plans",
  mine: "GET /api/buyer-plans/mine",
  updatePut: "PUT /api/buyer-plans/mine",
  updatePatch: "PATCH /api/buyer-plans/mine",
  cancel: "DELETE /api/buyer-plans/mine",
  adminList: "GET /api/buyer-plans/subscriptions",
});

export default router;