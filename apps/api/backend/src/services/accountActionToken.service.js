import crypto from "node:crypto";

export const ACCOUNT_ACTION_PURPOSE = Object.freeze({
  EMAIL_VERIFICATION: "EMAIL_VERIFICATION",
  PASSWORD_RESET: "PASSWORD_RESET",
});

const DEFAULT_TTL_MS = Object.freeze({
  EMAIL_VERIFICATION: 24 * 60 * 60 * 1000,
  PASSWORD_RESET: 60 * 60 * 1000,
});

export function digestAccountActionToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken), "utf8").digest("hex");
}

export function createRawAccountActionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function configuredTtlMs(purpose) {
  const envName =
    purpose === ACCOUNT_ACTION_PURPOSE.PASSWORD_RESET
      ? "PASSWORD_RESET_TOKEN_TTL_MINUTES"
      : "EMAIL_VERIFICATION_TOKEN_TTL_MINUTES";
  const minutes = Number.parseInt(process.env[envName] || "", 10);
  return Number.isInteger(minutes) && minutes > 0
    ? minutes * 60 * 1000
    : DEFAULT_TTL_MS[purpose];
}

export async function replaceActiveAccountActionToken(
  tx,
  { userId, purpose, now = new Date() },
) {
  const rawToken = createRawAccountActionToken();
  const tokenDigest = digestAccountActionToken(rawToken);
  const expiresAt = new Date(now.getTime() + configuredTtlMs(purpose));

  await tx.accountActionToken.updateMany({
    where: { userId, purpose, consumedAt: null },
    data: { consumedAt: now },
  });
  await tx.accountActionToken.create({
    data: { userId, purpose, tokenDigest, expiresAt },
  });

  return { rawToken, expiresAt };
}
