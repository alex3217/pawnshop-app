import { loadMfaConfig } from "../config/mfa.js";
import { prisma } from "../lib/prisma.js";
import {
  confirmMfaEnrollment,
  recordMfaEnrollmentFailure,
  startMfaEnrollment,
} from "../services/mfa.service.js";

function unavailableError() {
  const error = new Error("MFA enrollment is unavailable");
  error.code = "MFA_ENROLLMENT_UNAVAILABLE";
  error.statusCode = 404;
  return error;
}

function auditFromRequest(req) {
  return {
    actorId: req.user.sub,
    actorEmail: req.user.email,
    actorRole: req.user.role,
    requestId: req.requestId || null,
    ipAddress: req.ip || null,
    userAgent: req.get("user-agent") || null,
  };
}

function enrollmentConfig() {
  const config = loadMfaConfig(process.env);
  if (config.rolloutMode === "disabled") throw unavailableError();
  return config;
}

function otpauthUri({ secret, issuer, accountName }) {
  const label = `${issuer}:${accountName}`;
  const query = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${query.toString()}`;
}

export async function getMfaEnrollmentStatus(req, res) {
  const config = enrollmentConfig();
  const credential = await prisma.userMfaCredential.findUnique({
    where: { userId: req.user.sub },
    select: {
      enrollmentStartedAt: true,
      enabledAt: true,
      recoveryCodesGeneratedAt: true,
    },
  });
  return res.json({
    success: true,
    mfa: {
      available: true,
      rolloutMode: config.rolloutMode,
      enrolled: Boolean(credential),
      enabled: Boolean(credential?.enabledAt),
      enrollmentStartedAt: credential?.enrollmentStartedAt || null,
      enabledAt: credential?.enabledAt || null,
      recoveryCodesGenerated: Boolean(credential?.recoveryCodesGeneratedAt),
    },
  });
}

export async function beginMfaEnrollment(req, res) {
  const config = enrollmentConfig();
  const result = await startMfaEnrollment({
    userId: req.user.sub,
    encryptionKey: config.encryptionKey,
    enrollmentTtlSeconds: config.enrollmentTtlSeconds,
    audit: auditFromRequest(req),
  });
  return res.status(201).json({
    success: true,
    enrollment: {
      secret: result.secret,
      otpauthUri: otpauthUri({
        secret: result.secret,
        issuer: config.issuer,
        accountName: req.user.email,
      }),
      enrollmentStartedAt: result.credential.enrollmentStartedAt,
    },
  });
}

export async function confirmEnrollment(req, res) {
  const config = enrollmentConfig();
  const keys = Object.keys(req.body || {});
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
  if (keys.length !== 1 || keys[0] !== "code" || !/^\d{6}$/.test(code)) {
    await recordMfaEnrollmentFailure({
      userId: req.user.sub,
      audit: auditFromRequest(req),
    });
    const error = new Error("MFA enrollment confirmation is invalid");
    error.statusCode = 401;
    throw error;
  }

  try {
    const result = await confirmMfaEnrollment({
      userId: req.user.sub,
      token: code,
      encryptionKey: config.encryptionKey,
      enrollmentTtlSeconds: config.enrollmentTtlSeconds,
      audit: auditFromRequest(req),
    });
    return res.json({
      success: true,
      enabled: true,
      enabledAt: result.credential.enabledAt,
      recoveryCodes: result.recoveryCodes,
    });
  } catch (error) {
    if (error?.code === "MFA_ENROLLMENT_INVALID") {
      await recordMfaEnrollmentFailure({
        userId: req.user.sub,
        audit: auditFromRequest(req),
      });
    }
    throw error;
  }
}
