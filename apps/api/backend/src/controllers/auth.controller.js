// File: apps/api/backend/src/controllers/auth.controller.js

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { validatePassword } from "../services/passwordPolicy.service.js";
import {
  ACCOUNT_ACTION_PURPOSE,
  digestAccountActionToken,
  replaceActiveAccountActionToken,
} from "../services/accountActionToken.service.js";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../services/transactionalEmail.service.js";
import {
  getMyShopAccess,
} from "../services/shopAccess.service.js";
import {
  isInviteEnforcementEnabled,
  redeemInviteInTransaction,
} from "../services/betaInvite.service.js";

const PUBLIC_ALLOWED_ROLES = new Set(["CONSUMER", "OWNER"]);

const CURRENT_TERMS_VERSION = "2026-07-28";
const CURRENT_PRIVACY_VERSION = "2026-07-28";
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

function resolveLegalConsent(input) {
  const consent =
    input && typeof input === "object"
      ? input
      : {};

  if (consent.accepted !== true) {
    throw Object.assign(
      new Error(
        "You must accept the Terms of Service and Privacy Policy.",
      ),
      {
        statusCode: 400,
        code: "LEGAL_CONSENT_REQUIRED",
      },
    );
  }

  const termsVersion = String(
    consent.termsVersion || "",
  ).trim();

  const privacyVersion = String(
    consent.privacyVersion || "",
  ).trim();

  if (
    termsVersion !== CURRENT_TERMS_VERSION ||
    privacyVersion !== CURRENT_PRIVACY_VERSION
  ) {
    throw Object.assign(
      new Error(
        "The legal policies have changed. Review and accept the current versions.",
      ),
      {
        statusCode: 400,
        code: "LEGAL_POLICY_VERSION_MISMATCH",
        details: {
          termsVersion: CURRENT_TERMS_VERSION,
          privacyVersion: CURRENT_PRIVACY_VERSION,
        },
      },
    );
  }

  return {
    termsVersion,
    privacyVersion,
  };
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

function safeOwnerApplication(application) {
  if (!application) {
    return null;
  }

  return {
    id: application.id,
    status: application.status,
    submittedAt: application.submittedAt ?? null,
    reviewedAt: application.reviewedAt ?? null,
    decisionReason: application.decisionReason ?? null,
    statusChangedAt: application.statusChangedAt ?? null,
  };
}

function safeUser(user) {
  const role = normalizeRole(user.role);

  const result = {
    id: user.id,
    name: user.name,
    email: user.email,
    role,
    isActive: Boolean(user.isActive),
    emailVerifiedAt: user.emailVerifiedAt ?? null,
    createdAt: user.createdAt ?? null,
    updatedAt: user.updatedAt ?? null,
  };

  if (
    role === "OWNER" &&
    Object.prototype.hasOwnProperty.call(
      user,
      "ownerApplication",
    )
  ) {
    result.ownerApplication =
      safeOwnerApplication(user.ownerApplication);
  }

  return result;
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
      authVersion: user.authVersion,
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

async function ensureEmailAvailable(email) {
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    throw Object.assign(new Error("Unable to create account with those details"), {
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
    ...(error?.code ? { code: error.code } : {}),
    ...(error?.details ? { details: error.details } : {}),
  });
}

export async function register(req, res) {
  try {
    const rawBody = req.body || {};
    const name = normalizeName(rawBody.name);
    const email = normalizeEmail(rawBody.email);
    const password = String(rawBody.password || "");
    const inviteToken = String(
      rawBody.inviteToken || rawBody.inviteCode || "",
    ).trim();

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Missing fields" });
    }

    validatePassword(password, { email });

    const roleCheck = resolvePublicRole(rawBody.role);
    if (!roleCheck.ok) {
      return res.status(403).json({ error: roleCheck.error });
    }

    const legalConsent = resolveLegalConsent(
      rawBody.legalConsent,
    );

    const inviteEnforced = isInviteEnforcementEnabled();
    if (inviteEnforced && !inviteToken) {
      throw Object.assign(new Error("An invitation is required"), {
        statusCode: 403,
        code: "INVITE_REQUIRED",
      });
    }

    await ensureEmailAvailable(email);

    const hash = await bcrypt.hash(password, 12);

    const { user, rawToken } = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name,
          email,
          password: hash,
          role: roleCheck.role,
          isActive: true,
          emailVerifiedAt: null,
        },
      });

      if (inviteEnforced) {
        await redeemInviteInTransaction(tx, {
          token: inviteToken,
          user: createdUser,
          role: roleCheck.role,
        });
      }

      if (roleCheck.role === "OWNER") {
        await tx.ownerApplication.create({
          data: {
            ownerId: createdUser.id,
            status: "PENDING",
            businessEmail: createdUser.email,
          },
        });
      }

      await tx.legalConsent.create({
        data: {
          userId: createdUser.id,
          termsVersion: legalConsent.termsVersion,
          privacyVersion: legalConsent.privacyVersion,
        },
      });

      const actionToken = await replaceActiveAccountActionToken(tx, {
        userId: createdUser.id,
        purpose: ACCOUNT_ACTION_PURPOSE.EMAIL_VERIFICATION,
      });
      return { user: createdUser, rawToken: actionToken.rawToken };
    });

    let emailDelivery = "SENT";
    try {
      await sendVerificationEmail({
        to: user.email,
        name: user.name,
        token: rawToken,
      });
    } catch (error) {
      emailDelivery = "FAILED";
      console.error("[auth.register] verification email delivery failed", {
        name: error?.name || "Error",
        code: error?.code || null,
      });
    }

    return res.status(201).json({
      success: true,
      user: safeUser(user),
      nextStep: "VERIFY_EMAIL",
      emailDelivery,
      ...(emailDelivery === "FAILED"
        ? {
            code: "VERIFICATION_EMAIL_DELIVERY_FAILED",
            message:
              "Your account was created, but we could not send the verification email. Please request another verification email.",
          }
        : {}),
    });
  } catch (error) {
    console.error("[auth.register] failed", {
      name: error?.name || "Error",
      code: error?.code || null,
    });
    if (error?.code === "P2002") {
      return res.status(409).json({
        error: "Unable to create account with those details",
      });
    }
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

    if (!user.emailVerifiedAt) {
      return res.status(403).json({
        error: "Email verification is required",
        code: "EMAIL_VERIFICATION_REQUIRED",
      });
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

const GENERIC_VERIFICATION_RESPONSE = Object.freeze({
  success: true,
  message: "If the account is eligible, a verification email will be sent.",
});
const GENERIC_PASSWORD_RESPONSE = Object.freeze({
  success: true,
  message: "If an account exists for that email, password reset instructions will be sent.",
});

export async function resendVerification(req, res) {
  const email = normalizeEmail(req.body?.email);
  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user?.isActive && !user.emailVerifiedAt) {
      const { rawToken } = await prisma.$transaction((tx) =>
        replaceActiveAccountActionToken(tx, {
          userId: user.id,
          purpose: ACCOUNT_ACTION_PURPOSE.EMAIL_VERIFICATION,
        }),
      );
      await sendVerificationEmail({ to: user.email, name: user.name, token: rawToken });
    }
  } catch (error) {
    console.error("[auth.resendVerification] delivery failed", {
      name: error?.name || "Error",
    });
  }
  return res.json(GENERIC_VERIFICATION_RESPONSE);
}

export async function verifyEmail(req, res) {
  try {
    const rawToken = String(req.body?.token || "");
    if (!rawToken) return res.status(400).json({ error: "Verification token is required" });
    const now = new Date();
    const digest = digestAccountActionToken(rawToken);

    const user = await prisma.$transaction(async (tx) => {
      const token = await tx.accountActionToken.findUnique({
        where: { tokenDigest: digest },
      });
      if (
        !token ||
        token.purpose !== ACCOUNT_ACTION_PURPOSE.EMAIL_VERIFICATION ||
        token.consumedAt ||
        token.expiresAt <= now
      ) {
        throw Object.assign(new Error("Verification link is invalid or expired"), {
          statusCode: 400,
          code: "INVALID_OR_EXPIRED_TOKEN",
        });
      }
      const claimed = await tx.accountActionToken.updateMany({
        where: { id: token.id, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (claimed.count !== 1) {
        throw Object.assign(new Error("Verification link is invalid or expired"), {
          statusCode: 400,
          code: "INVALID_OR_EXPIRED_TOKEN",
        });
      }
      return tx.user.update({
        where: { id: token.userId },
        data: { emailVerifiedAt: now },
      });
    });

    return res.json({ success: true, user: safeUser(user), nextStep: "LOGIN" });
  } catch (error) {
    return sendError(res, error, "Email verification failed");
  }
}

export async function forgotPassword(req, res) {
  const email = normalizeEmail(req.body?.email);
  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user?.isActive) {
      const { rawToken } = await prisma.$transaction((tx) =>
        replaceActiveAccountActionToken(tx, {
          userId: user.id,
          purpose: ACCOUNT_ACTION_PURPOSE.PASSWORD_RESET,
        }),
      );
      await sendPasswordResetEmail({ to: user.email, name: user.name, token: rawToken });
    }
  } catch (error) {
    console.error("[auth.forgotPassword] delivery failed", {
      name: error?.name || "Error",
    });
  }
  return res.json(GENERIC_PASSWORD_RESPONSE);
}

export async function resetPassword(req, res) {
  try {
    const rawToken = String(req.body?.token || "");
    const password = String(req.body?.password || "");
    if (!rawToken || !password) return res.status(400).json({ error: "Token and password are required" });

    const digest = digestAccountActionToken(rawToken);
    const tokenRecord = await prisma.accountActionToken.findUnique({
      where: { tokenDigest: digest },
      include: { user: { select: { email: true } } },
    });
    const validationNow = new Date();
    if (
      !tokenRecord ||
      tokenRecord.purpose !== ACCOUNT_ACTION_PURPOSE.PASSWORD_RESET ||
      tokenRecord.consumedAt ||
      tokenRecord.expiresAt <= validationNow
    ) {
      throw Object.assign(new Error("Password reset link is invalid or expired"), {
        statusCode: 400,
        code: "INVALID_OR_EXPIRED_TOKEN",
      });
    }
    validatePassword(password, { email: tokenRecord?.user?.email });
    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      const token = await tx.accountActionToken.findUnique({ where: { tokenDigest: digest } });
      if (
        !token ||
        token.purpose !== ACCOUNT_ACTION_PURPOSE.PASSWORD_RESET ||
        token.consumedAt ||
        token.expiresAt <= now
      ) {
        throw Object.assign(new Error("Password reset link is invalid or expired"), {
          statusCode: 400,
          code: "INVALID_OR_EXPIRED_TOKEN",
        });
      }
      const invalidated = await tx.accountActionToken.updateMany({
        where: {
          userId: token.userId,
          purpose: ACCOUNT_ACTION_PURPOSE.PASSWORD_RESET,
          consumedAt: null,
        },
        data: { consumedAt: now },
      });
      if (invalidated.count < 1) {
        throw Object.assign(new Error("Password reset link is invalid or expired"), {
          statusCode: 400,
          code: "INVALID_OR_EXPIRED_TOKEN",
        });
      }
      await tx.user.update({
        where: { id: token.userId },
        data: {
          password: passwordHash,
          passwordChangedAt: now,
          authVersion: { increment: 1 },
        },
      });
    });

    return res.json({ success: true, nextStep: "LOGIN" });
  } catch (error) {
    return sendError(res, error, "Password reset failed");
  }
}


export async function myShopAccess(
  req,
  res,
) {
  try {
    requireAuthenticatedUser(req);

    const access =
      await getMyShopAccess({
        user: req.user,
      });

    return res.json({
      success: true,
      access,
    });
  } catch (error) {
    console.error(
      "[auth.myShopAccess] error",
      error,
    );

    return sendError(
      res,
      error,
      "Failed to load shop access",
    );
  }
}

export async function me(req, res) {
  try {
    const authUser = requireAuthenticatedUser(req);

    const user = await prisma.user.findUnique({
      where: {
        id: String(
          authUser.sub ||
            authUser.id ||
            authUser.userId,
        ),
      },
      include: {
        ownerApplication: true,
      },
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

    validatePassword(password, { email });

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
        emailVerifiedAt: new Date(),
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
