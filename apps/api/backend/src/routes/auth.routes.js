// File: apps/api/backend/src/routes/auth.routes.js

import { Router } from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import {
  register,
  login,
  myShopAccess,
  me,
  refresh,
  createSuperAdminUser,
  resendVerification,
  verifyEmail,
  forgotPassword,
  resetPassword,
} from "../controllers/auth.controller.js";
import {
  beginMfaEnrollment,
  confirmEnrollment,
  getMfaEnrollmentStatus,
} from "../controllers/mfaEnrollment.controller.js";

const router = Router();

function asyncRoute(handler) {
  return function wrappedRoute(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/**
 * Public
 * POST /api/auth/register
 */
router.post("/register", asyncRoute(register));

/**
 * Public
 * POST /api/auth/login
 */
router.post("/login", asyncRoute(login));
router.post("/resend-verification", asyncRoute(resendVerification));
router.post("/verify-email", asyncRoute(verifyEmail));
router.post("/forgot-password", asyncRoute(forgotPassword));
router.post("/reset-password", asyncRoute(resetPassword));

/**
 * Authenticated
 * GET /api/auth/me
 */
router.get(
  "/shop-access",
  authRequired,
  asyncRoute(myShopAccess),
);

router.get("/me", authRequired, asyncRoute(me));

/**
 * Authenticated
 * POST /api/auth/refresh
 */
router.post("/refresh", authRequired, asyncRoute(refresh));

function enrollmentLimiter(name) {
  return function applyEnrollmentLimiter(req, res, next) {
    const limiter = req.app.locals.authRateLimiters?.[name];
    if (typeof limiter !== "function") {
      return res.status(503).json({
        success: false,
        error: "Authentication protection is temporarily unavailable",
        requestId: req.requestId,
      });
    }
    return limiter(req, res, next);
  };
}

router.get(
  "/mfa/status",
  authRequired,
  requireRole("SUPER_ADMIN"),
  asyncRoute(getMfaEnrollmentStatus),
);
router.post(
  "/mfa/enrollment",
  authRequired,
  requireRole("SUPER_ADMIN"),
  enrollmentLimiter("mfaEnrollmentStart"),
  asyncRoute(beginMfaEnrollment),
);
router.post(
  "/mfa/enrollment/confirm",
  authRequired,
  requireRole("SUPER_ADMIN"),
  enrollmentLimiter("mfaEnrollmentConfirm"),
  asyncRoute(confirmEnrollment),
);

/**
 * Super Admin only
 * POST /api/auth/super-admin/users
 */
router.post(
  "/super-admin/users",
  authRequired,
  requireRole("SUPER_ADMIN"),
  asyncRoute(createSuperAdminUser)
);

export const AUTH_ROUTE_MAP = Object.freeze({
  register: "POST /api/auth/register",
  login: "POST /api/auth/login",
  resendVerification: "POST /api/auth/resend-verification",
  verifyEmail: "POST /api/auth/verify-email",
  forgotPassword: "POST /api/auth/forgot-password",
  resetPassword: "POST /api/auth/reset-password",
  shopAccess: "GET /api/auth/shop-access",
  me: "GET /api/auth/me",
  refresh: "POST /api/auth/refresh",
  createSuperAdminUser: "POST /api/auth/super-admin/users",
  mfaStatus: "GET /api/auth/mfa/status",
  mfaEnrollmentStart: "POST /api/auth/mfa/enrollment",
  mfaEnrollmentConfirm: "POST /api/auth/mfa/enrollment/confirm",
});

export default router;
