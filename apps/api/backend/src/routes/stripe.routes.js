// File: apps/api/backend/src/routes/stripe.routes.js

import { Router } from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import {
  getStripeConfig,
  createSubscriptionCheckoutSession,
  createSettlementPaymentIntent,
} from "../controllers/stripe.controller.js";

const router = Router();

const ALLOWED_PLAN_CODES = new Set(["FREE", "PRO", "PREMIUM", "ULTRA"]);
const ALLOWED_BILLING_INTERVALS = new Set(["MONTH", "YEAR"]);
const ALLOWED_CURRENCIES = new Set(["USD"]);

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

function validateObjectBody(req, res, next) {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return badRequest(res, "Request body must be a JSON object.");
  }
  return next();
}

function validateIdParam(paramName = "id") {
  return function validateParam(req, res, next) {
    const raw = req.params?.[paramName];

    if (typeof raw !== "string") {
      return badRequest(res, `${paramName} is required.`);
    }

    const value = raw.trim();

    if (!value || value.length > 128 || value.includes("/")) {
      return badRequest(res, `Invalid ${paramName}.`);
    }

    req.params[paramName] = value;
    return next();
  };
}

function normalizeSubscriptionCheckoutBody(req, res, next) {
  const body = { ...req.body };

  const rawPlanCode = body.planCode ?? body.plan ?? body.code ?? null;
  if (rawPlanCode !== null && rawPlanCode !== undefined && rawPlanCode !== "") {
    const normalizedPlanCode = String(rawPlanCode).trim().toUpperCase();

    if (!ALLOWED_PLAN_CODES.has(normalizedPlanCode)) {
      return badRequest(res, "Invalid plan code.", {
        allowedPlanCodes: Array.from(ALLOWED_PLAN_CODES),
      });
    }

    body.planCode = normalizedPlanCode;
    if (body.plan == null) body.plan = normalizedPlanCode;
    if (body.code == null) body.code = normalizedPlanCode;
  }

  const rawInterval =
    body.billingInterval ??
    body.interval ??
    body.billingCycle ??
    body.frequency ??
    null;

  if (rawInterval !== null && rawInterval !== undefined && rawInterval !== "") {
    const normalizedInterval =
      String(rawInterval).trim().toUpperCase() === "YEARLY"
        ? "YEAR"
        : String(rawInterval).trim().toUpperCase() === "ANNUAL"
          ? "YEAR"
          : String(rawInterval).trim().toUpperCase() === "MONTHLY"
            ? "MONTH"
            : String(rawInterval).trim().toUpperCase();

    if (!ALLOWED_BILLING_INTERVALS.has(normalizedInterval)) {
      return badRequest(res, "Invalid billing interval.", {
        allowedBillingIntervals: Array.from(ALLOWED_BILLING_INTERVALS),
      });
    }

    body.billingInterval = normalizedInterval;
    if (body.interval == null) body.interval = normalizedInterval;
  }

  if (body.shopId !== undefined && body.shopId !== null) {
    if (typeof body.shopId !== "string" || !body.shopId.trim()) {
      return badRequest(res, "shopId must be a non-empty string.");
    }
    body.shopId = body.shopId.trim();
  }

  for (const key of ["successUrl", "cancelUrl", "returnUrl"]) {
    if (body[key] !== undefined && body[key] !== null) {
      if (typeof body[key] !== "string" || !body[key].trim()) {
        return badRequest(res, `${key} must be a non-empty string when provided.`);
      }
      body[key] = body[key].trim();
    }
  }

  if (body.metadata !== undefined) {
    if (
      !body.metadata ||
      typeof body.metadata !== "object" ||
      Array.isArray(body.metadata)
    ) {
      return badRequest(res, "metadata must be an object when provided.");
    }
  }

  req.body = body;
  return next();
}

function normalizeSettlementPaymentIntentBody(req, res, next) {
  const body = { ...req.body };

  if (body.currency !== undefined && body.currency !== null && body.currency !== "") {
    const normalizedCurrency = String(body.currency).trim().toUpperCase();

    if (!ALLOWED_CURRENCIES.has(normalizedCurrency)) {
      return badRequest(res, "Invalid currency.", {
        allowedCurrencies: Array.from(ALLOWED_CURRENCIES),
      });
    }

    body.currency = normalizedCurrency;
  }

  if (body.amountCents !== undefined && body.amountCents !== null) {
    const amountCents = Number(body.amountCents);
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return badRequest(res, "amountCents must be a positive integer.");
    }
    body.amountCents = amountCents;
  }

  if (body.amount !== undefined && body.amount !== null) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return badRequest(res, "amount must be a positive number.");
    }
    body.amount = amount;
  }

  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== "string") {
      return badRequest(res, "description must be a string.");
    }
    body.description = body.description.trim();
  }

  if (body.metadata !== undefined) {
    if (
      !body.metadata ||
      typeof body.metadata !== "object" ||
      Array.isArray(body.metadata)
    ) {
      return badRequest(res, "metadata must be an object when provided.");
    }
  }

  req.body = body;
  return next();
}

/**
 * Authenticated
 * GET /api/stripe/config
 *
 * Returns publishable-key-safe config needed by the frontend.
 */
router.get("/config", authRequired, asyncRoute(getStripeConfig));

/**
 * Owner/Admin
 * POST /api/stripe/checkout/subscription
 *
 * Creates a Stripe Checkout Session for seller subscription upgrades.
 * Controller/service layer still owns shop ownership checks, plan pricing,
 * and final Stripe validation.
 */
router.post(
  "/checkout/subscription",
  authRequired,
  requireRole("OWNER", "ADMIN"),
  validateObjectBody,
  normalizeSubscriptionCheckoutBody,
  asyncRoute(createSubscriptionCheckoutSession)
);

/**
 * Consumer/Admin
 * POST /api/stripe/payment-intents/settlements/:id
 *
 * Creates a payment intent for a settlement/payout-related purchase flow.
 * Controller/service layer still owns final authorization, amount resolution,
 * and settlement state validation.
 */
router.post(
  "/payment-intents/settlements/:id",
  authRequired,
  requireRole("CONSUMER", "ADMIN"),
  validateIdParam("id"),
  validateObjectBody,
  normalizeSettlementPaymentIntentBody,
  asyncRoute(createSettlementPaymentIntent)
);

export default router;