const ROLLOUT_MODES = new Set(["disabled", "optional", "required"]);

function positiveInteger(name, value, fallback, maximum) {
  if (value === undefined || value === "") return fallback;
  if (!/^[1-9]\d*$/.test(String(value))) {
    throw new Error(`${name} must be a positive integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${name} must be a safe positive integer`);
  }
  if (parsed > maximum) throw new Error(`${name} must not exceed ${maximum}`);
  return parsed;
}

function encryptionKey(value, { required }) {
  const raw = String(value || "").trim();
  if (!raw) {
    if (required) throw new Error("MFA_ENCRYPTION_KEY is required");
    return null;
  }

  let decoded;
  try {
    decoded = Buffer.from(raw, "base64");
  } catch {
    decoded = Buffer.alloc(0);
  }

  if (decoded.length !== 32 || decoded.toString("base64") !== raw) {
    throw new Error(
      "MFA_ENCRYPTION_KEY must be exactly 32 bytes encoded as canonical base64",
    );
  }
  return decoded;
}

export function loadMfaConfig(env = process.env) {
  const rawRolloutMode = String(env.MFA_MODE || "disabled");
  const rolloutMode = rawRolloutMode
    .trim()
    .toLowerCase();
  if (!ROLLOUT_MODES.has(rolloutMode)) {
    throw new Error("MFA_MODE must be disabled, optional, or required");
  }
  const runtime = String(env.APP_ENV || env.NODE_ENV || "development").trim().toLowerCase();
  if (runtime === "production" && rawRolloutMode !== "required") {
    throw new Error("MFA_MODE must equal required in production");
  }

  return Object.freeze({
    rolloutMode,
    encryptionKey: encryptionKey(env.MFA_ENCRYPTION_KEY, {
      required: rolloutMode !== "disabled",
    }),
    issuer: String(env.MFA_ISSUER || "PawnLoop").trim() || "PawnLoop",
    challengeTtlSeconds: positiveInteger(
      "MFA_CHALLENGE_TTL_SECONDS",
      env.MFA_CHALLENGE_TTL_SECONDS,
      300,
      300,
    ),
    challengeAttempts: positiveInteger(
      "MFA_CHALLENGE_ATTEMPTS",
      env.MFA_CHALLENGE_ATTEMPTS,
      5,
      5,
    ),
    enrollmentTtlSeconds: positiveInteger(
      "MFA_ENROLLMENT_TTL_SECONDS",
      env.MFA_ENROLLMENT_TTL_SECONDS,
      600,
      3600,
    ),
    totpPeriodSeconds: 30,
    totpSkewSeconds: 30,
    recoveryCodeCount: 10,
  });
}

export const MFA_ROLLOUT_MODES = Object.freeze([
  "disabled",
  "optional",
  "required",
]);
