import { loadMfaConfig } from "../config/mfa.js";
import { consumeStepUpProof } from "../services/mfa.service.js";
import { stepUpSessionDigest } from "../controllers/mfaStepUp.controller.js";
import { createMfaAuditEvent } from "../services/mfaAudit.service.js";
import { prisma } from "../lib/prisma.js";

async function auditRejectedProof(req) {
  try {
    await prisma.$transaction((tx) => createMfaAuditEvent(tx, {
      event: "STEP_UP_FAILED",
      actorId: req.user.sub,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      targetUserId: req.user.sub,
      requestId: req.requestId || null,
      ipAddress: req.ip || null,
      userAgent: req.get("user-agent") || null,
      success: false,
      metadata: { outcome: "failed", reason: "invalid_proof", purpose: "STEP_UP" },
    }));
  } catch { /* The privileged operation remains denied if audit persistence fails. */ }
}

export function requireMfaStepUp(operationScope) {
  if (!/^[a-z][a-z0-9.-]{2,79}$/.test(operationScope)) throw new Error("Invalid privileged operation scope");
  return async function enforceMfaStepUp(req, res, next) {
    const proof = String(req.get("x-mfa-step-up-proof") || "").trim();
    if (!proof) {
      await auditRejectedProof(req);
      return res.status(403).json({ success: false, error: "MFA step-up required", code: "MFA_STEP_UP_REQUIRED", scope: operationScope });
    }
    try {
      const config = loadMfaConfig(process.env);
      if (config.rolloutMode !== "required") throw new Error("MFA is not required");
      await consumeStepUpProof({
        proof,
        userId: req.user.sub,
        sessionDigest: stepUpSessionDigest(req, config.encryptionKey),
        operationScope,
        encryptionKey: config.encryptionKey,
      });
      req.mfaStepUp = { scope: operationScope };
      return next();
    } catch {
      await auditRejectedProof(req);
      return res.status(403).json({ success: false, error: "Valid MFA step-up proof required", code: "MFA_STEP_UP_REQUIRED", scope: operationScope });
    }
  };
}
