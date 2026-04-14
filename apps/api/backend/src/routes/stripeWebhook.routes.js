// File: apps/api/backend/src/routes/stripeWebhook.routes.js

import { Router, raw } from "express";
import { handleStripeWebhook } from "../controllers/stripe.controller.js";

const router = Router();

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

function requireStripeSignature(req, res, next) {
  const signature = req.get("stripe-signature");

  if (!signature || typeof signature !== "string" || !signature.trim()) {
    return badRequest(
      res,
      "Missing Stripe signature header.",
      { header: "stripe-signature" }
    );
  }

  return next();
}

function ensureRawBody(req, res, next) {
  if (!Buffer.isBuffer(req.body)) {
    return badRequest(
      res,
      "Stripe webhook requires the raw request body.",
      {
        hint: "Mount this route before any JSON body parser that would consume the webhook payload.",
      }
    );
  }

  return next();
}

/**
 * Public
 * POST /api/stripe/webhook
 *
 * Stripe requires the exact raw request body for signature verification.
 * This route must be mounted before any global express.json() middleware
 * that would parse and mutate the body.
 */
router.post(
  "/",
  raw({
    type: (req) => {
      const contentType = req.headers["content-type"] || "";
      return typeof contentType === "string"
        ? contentType.toLowerCase().startsWith("application/json")
        : false;
    },
    limit: process.env.STRIPE_WEBHOOK_BODY_LIMIT || "2mb",
  }),
  requireStripeSignature,
  ensureRawBody,
  asyncRoute(handleStripeWebhook)
);

export default router;