// File: apps/api/backend/src/routes/auth.routes.js

import { Router } from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import {
  register,
  login,
  completeLoginMfa,
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
  requireMfaEnrollmentEligible,
} from "../controllers/mfaEnrollment.controller.js";
import { beginMfaStepUp, verifyMfaStepUp } from "../controllers/mfaStepUp.controller.js";
import { requireMfaStepUp } from "../middleware/mfaStepUp.js";

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
router.post("/mfa/challenge", asyncRoute(completeLoginMfa));
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
  requireRole("SUPER_ADMIN", "ADMIN", "OWNER", "CONSUMER"),
  asyncRoute(requireMfaEnrollmentEligible),
  asyncRoute(getMfaEnrollmentStatus),
);
router.post(
  "/mfa/enrollment",
  authRequired,
  requireRole("SUPER_ADMIN", "ADMIN", "OWNER", "CONSUMER"),
  asyncRoute(requireMfaEnrollmentEligible),
  enrollmentLimiter("mfaEnrollmentStart"),
  asyncRoute(beginMfaEnrollment),
);
router.post(
  "/mfa/enrollment/confirm",
  authRequired,
  requireRole("SUPER_ADMIN", "ADMIN", "OWNER", "CONSUMER"),
  asyncRoute(requireMfaEnrollmentEligible),
  enrollmentLimiter("mfaEnrollmentConfirm"),
  asyncRoute(confirmEnrollment),
);
router.post(
  "/mfa/step-up",
  authRequired,
  enrollmentLimiter("mfaStepUpCreate"),
  asyncRoute(beginMfaStepUp),
);
router.post(
  "/mfa/step-up/verify",
  authRequired,
  enrollmentLimiter("mfaStepUpVerify"),
  asyncRoute(verifyMfaStepUp),
);

/**
 * Super Admin only
 * POST /api/auth/super-admin/users
 */
router.post(
  "/super-admin/users",
  authRequired,
  requireRole("SUPER_ADMIN"),
  requireMfaStepUp("privilege.super-admin-user.create"),
  asyncRoute(createSuperAdminUser)
);

export const AUTH_ROUTE_MAP = Object.freeze({
  register: "POST /api/auth/register",
  login: "POST /api/auth/login",
  completeMfaLogin: "POST /api/auth/mfa/challenge",
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
  mfaStepUpCreate: "POST /api/auth/mfa/step-up",
  mfaStepUpVerify: "POST /api/auth/mfa/step-up/verify",
});

export default router;
