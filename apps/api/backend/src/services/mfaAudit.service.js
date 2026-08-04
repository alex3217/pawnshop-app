const MFA_AUDIT_ACTIONS = Object.freeze({
  ENROLLMENT_STARTED: "MFA_ENROLLMENT_STARTED",
  MFA_ENABLED: "MFA_ENABLED",
  CHALLENGE_SUCCEEDED: "MFA_CHALLENGE_SUCCEEDED",
  CHALLENGE_FAILED: "MFA_CHALLENGE_FAILED",
  RECOVERY_CODE_USED: "MFA_RECOVERY_CODE_USED",
  RECOVERY_CODES_REGENERATED: "MFA_RECOVERY_CODES_REGENERATED",
  STEP_UP_SUCCEEDED: "MFA_STEP_UP_SUCCEEDED",
  STEP_UP_FAILED: "MFA_STEP_UP_FAILED",
  MFA_DISABLED: "MFA_DISABLED",
  MFA_RESET: "MFA_RESET",
  SESSIONS_INVALIDATED: "MFA_SESSIONS_INVALIDATED",
  RATE_LIMIT_ENFORCED: "MFA_RATE_LIMIT_ENFORCED",
});

const SAFE_METADATA_KEYS = new Set([
  "outcome",
  "reason",
  "purpose",
  "attemptsRemaining",
  "recoveryCodeCount",
  "rolloutMode",
  "sessionsInvalidated",
]);

const SAFE_STRING_VALUES = Object.freeze({
  outcome: new Set([
    "started", "enabled", "succeeded", "failed", "used", "regenerated",
    "disabled", "reset", "invalidated", "enforced",
  ]),
  reason: new Set([
    "invalid_code", "attempts_exhausted", "expired", "auth_version_mismatch",
    "rate_limited", "locked_out",
  ]),
  purpose: new Set([
    "ENROLLMENT_CONFIRMATION", "LOGIN", "STEP_UP",
    "RECOVERY_CODES_REGENERATION", "DISABLE", "RESET",
  ]),
  rolloutMode: new Set(["disabled", "optional", "required"]),
});

export function allowlistedMfaAuditMetadata(metadata = {}) {
  const safe = {};
  for (const [key, value] of Object.entries(metadata || {})) {
    if (!SAFE_METADATA_KEYS.has(key)) continue;
    if (SAFE_STRING_VALUES[key]) {
      if (!SAFE_STRING_VALUES[key].has(value)) {
        throw new Error(`Unsafe MFA audit metadata value for ${key}`);
      }
      safe[key] = value;
      continue;
    }
    if (key === "attemptsRemaining" && Number.isInteger(value) && value >= 0 && value <= 5) {
      safe[key] = value;
      continue;
    }
    if (key === "recoveryCodeCount" && Number.isInteger(value) && value >= 1 && value <= 10) {
      safe[key] = value;
      continue;
    }
    if (key === "sessionsInvalidated" && typeof value === "boolean") safe[key] = value;
  }
  return safe;
}

export async function createMfaAuditEvent(tx, {
  event,
  actorId = null,
  actorEmail = null,
  actorRole = null,
  targetUserId,
  requestId = null,
  ipAddress = null,
  userAgent = null,
  success = true,
  metadata = {},
}) {
  const action = MFA_AUDIT_ACTIONS[event];
  if (!action) throw new Error("Unsupported MFA audit event");
  if (!tx?.superAdminAuditLog?.create) {
    throw new Error("MFA audit persistence is unavailable");
  }
  return tx.superAdminAuditLog.create({
    data: {
      actorId,
      actorEmail,
      actorRole,
      action,
      method: "INTERNAL",
      path: "mfa",
      routeKey: null,
      targetType: "USER",
      targetId: targetUserId,
      statusCode: success ? 200 : 401,
      success,
      requestId,
      ipAddress,
      userAgent,
      metadata: allowlistedMfaAuditMetadata(metadata),
    },
  });
}

export { MFA_AUDIT_ACTIONS };
