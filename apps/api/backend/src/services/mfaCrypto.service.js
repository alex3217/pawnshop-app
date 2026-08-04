import crypto from "node:crypto";
import { generate, generateSecret, verify } from "otplib";

const ENCRYPTION_VERSION = "v1";
const ENCRYPTION_AAD = Buffer.from("pawnloop:user-mfa:totp:v1", "utf8");
const DIGEST_CONTEXT = Buffer.from("pawnloop:user-mfa:digests:v1", "utf8");
const RECOVERY_CODE_BYTES = 16;

function requireKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error("A dedicated 32-byte MFA encryption key is required");
  }
  return key;
}

function digestKey(key) {
  return crypto.hkdfSync("sha256", requireKey(key), Buffer.alloc(0), DIGEST_CONTEXT, 32);
}

export function encryptTotpSecret(secret, key) {
  const plaintext = String(secret || "").trim();
  if (!plaintext) throw new Error("TOTP secret is required");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", requireKey(key), iv);
  cipher.setAAD(ENCRYPTION_AAD);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ENCRYPTION_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptTotpSecret(value, key) {
  const [version, ivValue, tagValue, ciphertextValue, extra] = String(value || "").split(".");
  if (
    version !== ENCRYPTION_VERSION ||
    !ivValue ||
    !tagValue ||
    !ciphertextValue ||
    extra !== undefined
  ) {
    throw new Error("Encrypted MFA secret is invalid");
  }
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      requireKey(key),
      Buffer.from(ivValue, "base64url"),
    );
    decipher.setAAD(ENCRYPTION_AAD);
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Encrypted MFA secret could not be authenticated");
  }
}

export function createTotpSecret() {
  return generateSecret();
}

export async function createTotpCode({ secret, epochSeconds } = {}) {
  return generate({
    secret,
    ...(epochSeconds === undefined ? {} : { epoch: epochSeconds }),
  });
}

export async function verifyTotpCode({
  secret,
  token,
  epochSeconds = Math.floor(Date.now() / 1000),
  lastAcceptedCounter = null,
  skewSeconds = 30,
} = {}) {
  if (!Number.isSafeInteger(skewSeconds) || skewSeconds < 0 || skewSeconds > 30) {
    throw new Error("TOTP clock skew must be between 0 and 30 seconds");
  }
  const normalizedToken = String(token || "").trim();
  if (!/^\d{6}$/.test(normalizedToken)) return { valid: false, counter: null };

  const result = await verify({
    secret,
    token: normalizedToken,
    epoch: epochSeconds,
    epochTolerance: [skewSeconds, skewSeconds],
    ...(Number.isInteger(lastAcceptedCounter)
      ? { afterTimeStep: lastAcceptedCounter }
      : {}),
  });
  if (!result.valid) return { valid: false, counter: null };
  const delta = Number(result.delta || 0);
  return {
    valid: true,
    counter: Math.floor(epochSeconds / 30) + delta,
  };
}

export function generateRecoveryCodes(count = 10) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 100) {
    throw new Error("Recovery-code count is invalid");
  }
  return Array.from({ length: count }, () =>
    crypto.randomBytes(RECOVERY_CODE_BYTES).toString("hex").toUpperCase().match(/.{1,8}/g).join("-"),
  );
}

export function generateOpaqueChallengeCredential() {
  return crypto.randomBytes(32).toString("base64url");
}

export function digestMfaValue(value, key) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error("MFA credential value is required");
  return crypto.createHmac("sha256", digestKey(key)).update(normalized, "utf8").digest("hex");
}

export function matchesMfaDigest(value, expectedDigest, key) {
  const actual = Buffer.from(digestMfaValue(value, key), "hex");
  const expected = Buffer.from(String(expectedDigest || ""), "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
