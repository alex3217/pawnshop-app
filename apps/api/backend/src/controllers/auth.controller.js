// File: src/controllers/auth.controller.js

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";

const PUBLIC_ALLOWED_ROLES = new Set(["CONSUMER", "OWNER"]);

function normalizeEmail(value = "") {
  return String(value).trim().toLowerCase();
}

function normalizeName(value = "") {
  return String(value).trim();
}

function safeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

function issueToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

function resolvePublicRole(input) {
  const requested = String(input || "CONSUMER").trim().toUpperCase();

  if (requested === "ADMIN") {
    return { ok: false, error: "Invalid role" };
  }

  if (!PUBLIC_ALLOWED_ROLES.has(requested)) {
    return { ok: false, error: "Invalid role" };
  }

  return { ok: true, role: requested };
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

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const roleCheck = resolvePublicRole(rawBody.role);
    if (!roleCheck.ok) {
      return res.status(403).json({ error: roleCheck.error });
    }

    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const hash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hash,
        role: roleCheck.role,
      },
    });

    const token = issueToken(user);

    return res.status(201).json({
      token,
      user: safeUser(user),
    });
  } catch (error) {
    console.error("[auth.register] error", error);
    return res.status(500).json({ error: "Registration failed" });
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

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (user.isActive === false) {
      return res.status(403).json({ error: "Account blocked" });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = issueToken(user);

    return res.json({
      token,
      user: safeUser(user),
    });
  } catch (error) {
    console.error("[auth.login] error", error);
    return res.status(500).json({ error: "Login failed" });
  }
}