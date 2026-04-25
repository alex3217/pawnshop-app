// File: apps/api/backend/src/controllers/auth.controller.js

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

const PUBLIC_ALLOWED_ROLES = new Set(["CONSUMER", "OWNER"]);
const PRIVILEGED_ALLOWED_ROLES = new Set([
  "CONSUMER",
  "OWNER",
  "ADMIN",
  "SUPER_ADMIN",
]);

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

function normalizeEmail(value = "") {
  return String(value).trim().toLowerCase();
}

function normalizeName(value = "") {
  return String(value).trim();
}

function normalizeRole(value = "", fallback = "CONSUMER") {
  const raw = String(value || fallback).trim().toUpperCase();
  return ROLE_ALIASES.get(raw) || raw || fallback;
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

function safeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: normalizeRole(user.role),
    isActive: Boolean(user.isActive),
    createdAt: user.createdAt ?? null,
    updatedAt: user.updatedAt ?? null,
  };
}

function issueToken(user) {
  const secret = getJwtSecret();

  if (!secret) {
    throw Object.assign(new Error("JWT secret is not configured"), {
      statusCode: 500,
    });
  }

  return jwt.sign(
    {
      sub: user.id,
      id: user.id,
      userId: user.id,
      role: normalizeRole(user.role),
      email: user.email,
    },
    secret,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

function resolvePublicRole(input) {
  const requested = normalizeRole(input, "CONSUMER");

  if (!PUBLIC_ALLOWED_ROLES.has(requested)) {
    return { ok: false, error: "Invalid role" };
  }

  return { ok: true, role: requested };
}

function resolvePrivilegedRole(input) {
  const requested = normalizeRole(input, "ADMIN");

  if (!PRIVILEGED_ALLOWED_ROLES.has(requested)) {
    return {
      ok: false,
      error: "Invalid privileged role",
      details: { allowedRoles: [...PRIVILEGED_ALLOWED_ROLES] },
    };
  }

  return { ok: true, role: requested };
}

function requireAuthenticatedUser(req) {
  const user = req?.user;

  if (!user || typeof user !== "object") {
    throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  }

  return user;
}

function requireSuperAdminUser(req) {
  const user = requireAuthenticatedUser(req);

  if (normalizeRole(user.role, "") !== "SUPER_ADMIN") {
    throw Object.assign(new Error("Super Admin access required"), {
      statusCode: 403,
    });
  }

  return user;
}

function validatePassword(password) {
  if (String(password || "").length < 6) {
    throw Object.assign(new Error("Password must be at least 6 characters"), {
      statusCode: 400,
    });
  }
}

async function ensureEmailAvailable(email) {
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    throw Object.assign(new Error("Email already registered"), {
      statusCode: 409,
    });
  }
}

function sendError(res, error, fallbackMessage) {
  const status =
    Number.isInteger(error?.statusCode) && error.statusCode >= 400
      ? error.statusCode
      : 500;

  return res.status(status).json({
    error: error?.message || fallbackMessage,
    ...(error?.details ? { details: error.details } : {}),
  });
}

export async function register(req, res) {
  try {
    const rawBody = req.body || {};
    const name = normalizeName(rawBody.name);
    const email = normalizeEmail(rawBody.email);
    const password = String(rawBody.password || "");

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Missing fields" });
    }

    validatePassword(password);

    const roleCheck = resolvePublicRole(rawBody.role);
    if (!roleCheck.ok) {
      return res.status(403).json({ error: roleCheck.error });
    }

    await ensureEmailAvailable(email);

    const hash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hash,
        role: roleCheck.role,
        isActive: true,
      },
    });

    return res.status(201).json({
      success: true,
      token: issueToken(user),
      user: safeUser(user),
    });
  } catch (error) {
    console.error("[auth.register] error", error);
    return sendError(res, error, "Registration failed");
  }
}

export async function login(req, res) {
  try {
    const rawBody = req.body || {};
    const email = normalizeEmail(rawBody.email);
    const password = String(rawBody.password || "");

    if (!email || !password) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || user.isActive === false) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    return res.json({
      success: true,
      token: issueToken(user),
      user: safeUser(user),
    });
  } catch (error) {
    console.error("[auth.login] error", error);
    return sendError(res, error, "Login failed");
  }
}

export async function me(req, res) {
  try {
    const authUser = requireAuthenticatedUser(req);

    const user = await prisma.user.findUnique({
      where: { id: String(authUser.sub || authUser.id || authUser.userId) },
    });

    if (!user || user.isActive === false) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    return res.json({
      success: true,
      user: safeUser(user),
    });
  } catch (error) {
    console.error("[auth.me] error", error);
    return sendError(res, error, "Failed to load user");
  }
}

export async function refresh(req, res) {
  try {
    const authUser = requireAuthenticatedUser(req);

    const user = await prisma.user.findUnique({
      where: { id: String(authUser.sub || authUser.id || authUser.userId) },
    });

    if (!user || user.isActive === false) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    return res.json({
      success: true,
      token: issueToken(user),
      user: safeUser(user),
    });
  } catch (error) {
    console.error("[auth.refresh] error", error);
    return sendError(res, error, "Token refresh failed");
  }
}

export async function createSuperAdminUser(req, res) {
  try {
    requireSuperAdminUser(req);

    const rawBody = req.body || {};
    const name = normalizeName(rawBody.name);
    const email = normalizeEmail(rawBody.email);
    const password = String(rawBody.password || "");

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Missing fields" });
    }

    validatePassword(password);

    const roleCheck = resolvePrivilegedRole(rawBody.role);
    if (!roleCheck.ok) {
      return res.status(400).json({
        error: roleCheck.error,
        ...(roleCheck.details ? { details: roleCheck.details } : {}),
      });
    }

    await ensureEmailAvailable(email);

    const hash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hash,
        role: roleCheck.role,
        isActive:
          typeof rawBody.isActive === "boolean" ? rawBody.isActive : true,
      },
    });

    return res.status(201).json({
      success: true,
      user: safeUser(user),
    });
  } catch (error) {
    console.error("[auth.createSuperAdminUser] error", error);
    return sendError(res, error, "Failed to create privileged user");
  }
}