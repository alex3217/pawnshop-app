// File: apps/api/backend/src/middleware/auth.js

import jwt from "jsonwebtoken";

const ROLE_ALIASES = new Map([
  ["USER", "CONSUMER"],
  ["BUYER", "CONSUMER"],
  ["CUSTOMER", "CONSUMER"],
  ["SHOP_OWNER", "OWNER"],
  ["SELLER", "OWNER"],
  ["SUPERADMIN", "SUPER_ADMIN"],
  ["SUPER-ADMIN", "SUPER_ADMIN"],
  ["SUPER ADMIN", "SUPER_ADMIN"],
]);

function normalizeRole(value) {
  const raw = String(value || "").trim().toUpperCase();
  return ROLE_ALIASES.get(raw) || raw;
}

function getJwtSecret() {
  return (
    process.env.JWT_SECRET ||
    process.env.ACCESS_TOKEN_SECRET ||
    process.env.JWT_ACCESS_SECRET ||
    process.env.AUTH_SECRET ||
    ""
  ).trim();
}

function getBearerToken(headerValue) {
  const header = String(headerValue || "").trim();

  if (!header) return null;

  if (header.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    return token || null;
  }

  return null;
}

function getTokenFromRequest(req) {
  return (
    getBearerToken(req.headers.authorization) ||
    getBearerToken(req.headers.Authorization) ||
    String(req.cookies?.token || "").trim() ||
    String(req.cookies?.accessToken || "").trim() ||
    String(req.cookies?.access_token || "").trim() ||
    null
  );
}

function buildAuthError(message, status = 401) {
  return { error: message, status };
}

function normalizeUserPayload(payload) {
  const id =
    payload?.sub ||
    payload?.id ||
    payload?.userId ||
    payload?.user_id ||
    payload?.uid ||
    "";

  const role =
    payload?.role ||
    payload?.userRole ||
    payload?.user_role ||
    payload?.type ||
    "";

  return {
    ...payload,
    id: String(id || "").trim(),
    sub: String(id || "").trim(),
    userId: String(id || "").trim(),
    email: String(payload?.email || "").trim().toLowerCase(),
    role: normalizeRole(role),
  };
}

export function authRequired(req, res, next) {
  const token = getTokenFromRequest(req);

  if (!token) {
    const err = buildAuthError("Unauthorized", 401);
    return res.status(err.status).json({ error: err.error });
  }

  const secret = getJwtSecret();

  if (!secret) {
    return res.status(500).json({ error: "JWT secret is not configured" });
  }

  try {
    const payload = jwt.verify(token, secret);
    const user = normalizeUserPayload(payload);

    if (!user.sub || !user.role) {
      return res.status(401).json({ error: "Invalid token payload" });
    }

    req.user = user;
    req.auth = {
      token,
      payload,
      user,
    };

    return next();
  } catch (_error) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

export function optionalAuth(req, _res, next) {
  const token = getTokenFromRequest(req);
  const secret = getJwtSecret();

  if (!token || !secret) {
    req.user = null;
    req.auth = null;
    return next();
  }

  try {
    const payload = jwt.verify(token, secret);
    const user = normalizeUserPayload(payload);

    req.user = user.sub && user.role ? user : null;
    req.auth = req.user
      ? {
          token,
          payload,
          user,
        }
      : null;
  } catch {
    req.user = null;
    req.auth = null;
  }

  return next();
}

export function hasRole(user, ...roles) {
  if (!user) return false;

  const actualRole = normalizeRole(user.role);
  const allowedRoles = roles.flat().map(normalizeRole).filter(Boolean);

  if (!actualRole || allowedRoles.length === 0) return false;

  return allowedRoles.includes(actualRole);
}

export function isAdminRole(role) {
  const normalized = normalizeRole(role);
  return normalized === "ADMIN" || normalized === "SUPER_ADMIN";
}

export function isSuperAdminRole(role) {
  return normalizeRole(role) === "SUPER_ADMIN";
}

export function requireRole(...roles) {
  const allowedRoles = roles.flat().map(normalizeRole).filter(Boolean);

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (allowedRoles.length === 0) {
      return res.status(500).json({ error: "No roles configured for route" });
    }

    if (!hasRole(req.user, ...allowedRoles)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    return next();
  };
}

export function requireAnyRole(...roles) {
  return requireRole(...roles);
}

export function requireAdminOrSuperAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!isAdminRole(req.user.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  return next();
}

export function requireSuperAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!isSuperAdminRole(req.user.role)) {
    return res.status(403).json({ error: "Super Admin access required" });
  }

  return next();
}

export const requireAuth = authRequired;
export const authenticate = authRequired;
export const protect = authRequired;

export default {
  authRequired,
  requireAuth,
  authenticate,
  protect,
  optionalAuth,
  hasRole,
  requireRole,
  requireAnyRole,
  requireAdminOrSuperAdmin,
  requireSuperAdmin,
  isAdminRole,
  isSuperAdminRole,
};