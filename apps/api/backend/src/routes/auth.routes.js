// File: apps/api/backend/src/routes/auth.routes.js

import { Router } from "express";
import { authRequired, requireRole } from "../middleware/auth.js";
import {
  register,
  login,
  me,
  refresh,
  createSuperAdminUser,
} from "../controllers/auth.controller.js";

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

/**
 * Authenticated
 * GET /api/auth/me
 */
router.get("/me", authRequired, asyncRoute(me));

/**
 * Authenticated
 * POST /api/auth/refresh
 */
router.post("/refresh", authRequired, asyncRoute(refresh));

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
  me: "GET /api/auth/me",
  refresh: "POST /api/auth/refresh",
  createSuperAdminUser: "POST /api/auth/super-admin/users",
});

export default router;