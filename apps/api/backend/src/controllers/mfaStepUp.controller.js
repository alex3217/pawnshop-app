import { loadMfaConfig } from "../config/mfa.js";
import { digestMfaValue } from "../services/mfaCrypto.service.js";
import { createMfaAuditEvent } from "../services/mfaAudit.service.js";
import { prisma } from "../lib/prisma.js";
import {
  createMfaChallenge,
  cleanupExpiredMfaArtifacts,
  recordMfaChallengeFailure,
  verifyStepUpMfaChallenge,
} from "../services/mfa.service.js";

const SCOPE_PATTERN = /^[a-z][a-z0-9.-]{2,79}$/;

function audit(req) {
  return {
    actorId: req.user.sub,
    actorEmail: req.user.email,
    actorRole: req.user.role,
    requestId: req.requestId || null,
    ipAddress: req.ip || null,
    userAgent: req.get("user-agent") || null,
  };
}

export function stepUpSessionDigest(req, encryptionKey) {
  const sessionId = String(req.user?.jti || "").trim();
  if (!sessionId) throw new Error("Authenticated session identifier is required");
  return digestMfaValue(`session:${sessionId}`, encryptionKey);
}

function operationScope(req) {
  const scope = typeof req.body?.scope === "string" ? req.body.scope.trim() : "";
  return SCOPE_PATTERN.test(scope) ? scope : null;
}

function generic(res) {
  return res.status(401).json({
    success: false,
    error: "Unable to complete privileged authentication",
    code: "MFA_STEP_UP_FAILED",
  });
}

async function auditRejected(req) {
  try {
    await prisma.$transaction((tx) => createMfaAuditEvent(tx, {
      event: "STEP_UP_FAILED",
      ...audit(req),
      targetUserId: req.user.sub,
      success: false,
      metadata: { outcome: "failed", reason: "invalid_code", purpose: "STEP_UP" },
    }));
  } catch { /* Authentication remains fail-closed if audit persistence is unavailable. */ }
}

export async function beginMfaStepUp(req, res) {
  const scope = operationScope(req);
  if (!scope) return res.status(400).json({ success: false, error: "Valid operation scope is required" });
  try {
    const config = loadMfaConfig(process.env);
    if (config.rolloutMode !== "required") return generic(res);
    await cleanupExpiredMfaArtifacts({
      retentionSeconds: config.artifactRetentionSeconds,
      batchSize: config.cleanupBatchSize,
    });
    const issued = await createMfaChallenge({
      userId: req.user.sub,
      purpose: "STEP_UP",
      sessionDigest: stepUpSessionDigest(req, config.encryptionKey),
      operationScope: scope,
      encryptionKey: config.encryptionKey,
      ttlSeconds: config.challengeTtlSeconds,
      attempts: config.challengeAttempts,
      audit: audit(req),
    });
    return res.status(201).json({
      success: true,
      challenge: issued.credential,
      scope,
      expiresInSeconds: config.challengeTtlSeconds,
    });
  } catch {
    return generic(res);
  }
}

export async function verifyMfaStepUp(req, res) {
  const scope = operationScope(req);
  const challenge = typeof req.body?.challenge === "string" ? req.body.challenge.trim() : "";
  const method = req.body?.method === "recovery_code" ? "recovery_code" : "totp";
  const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
  if (!scope || !challenge || !code || (method === "totp" && !/^\d{6}$/.test(code))) {
    await auditRejected(req);
    return generic(res);
  }
  let config;
  let sessionDigest;
  try {
    config = loadMfaConfig(process.env);
    if (config.rolloutMode !== "required") return generic(res);
    sessionDigest = stepUpSessionDigest(req, config.encryptionKey);
    const verified = await verifyStepUpMfaChallenge({
      credential: challenge,
      userId: req.user.sub,
      sessionDigest,
      operationScope: scope,
      method,
      code,
      encryptionKey: config.encryptionKey,
      audit: audit(req),
    });
    return res.json({
      success: true,
      proof: verified.proof,
      challengeId: verified.challengeId,
      scope,
      expiresInSeconds: verified.expiresInSeconds,
    });
  } catch {
    if (config && sessionDigest && challenge) {
      try {
        await recordMfaChallengeFailure({
          credential: challenge,
          purpose: "STEP_UP",
          userId: req.user.sub,
          sessionDigest,
          operationScope: scope,
          encryptionKey: config.encryptionKey,
          audit: audit(req),
        });
      } catch { await auditRejected(req); }
    }
    return generic(res);
  }
}
