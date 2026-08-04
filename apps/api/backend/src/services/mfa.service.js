import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import {
  createTotpSecret,
  decryptTotpSecret,
  digestMfaValue,
  encryptTotpSecret,
  generateOpaqueChallengeCredential,
  generateRecoveryCodes,
  matchesMfaDigest,
  verifyTotpCode,
} from "./mfaCrypto.service.js";
import { createMfaAuditEvent } from "./mfaAudit.service.js";

function mfaError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = code === "MFA_NOT_FOUND" ? 404 : code === "MFA_ALREADY_ENABLED" ? 409 : 401;
  return error;
}

function invalidEnrollmentError() {
  return mfaError("MFA_ENROLLMENT_INVALID", "MFA enrollment confirmation is invalid");
}

function requireEnrollmentTtl(enrollmentTtlSeconds) {
  if (
    !Number.isSafeInteger(enrollmentTtlSeconds)
    || enrollmentTtlSeconds < 1
    || enrollmentTtlSeconds > 3600
  ) {
    throw new Error("MFA enrollment TTL must be between 1 and 3600 seconds");
  }
}

function auditContext(targetUserId, audit = {}) {
  const { actorId, actorEmail, actorRole, requestId, ipAddress, userAgent } = audit || {};
  return { actorId, actorEmail, actorRole, requestId, ipAddress, userAgent, targetUserId };
}

async function lockMfaEnrollmentUser(tx, userId) {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))
  `;
}

async function lockCredential(tx, credentialId) {
  const rows = await tx.$queryRaw`
    SELECT "id" FROM "UserMfaCredential"
    WHERE "id" = ${credentialId}
    FOR UPDATE
  `;
  if (rows.length !== 1) throw mfaError("MFA_NOT_FOUND", "MFA credential not found");
}

export async function startMfaEnrollment({
  userId,
  encryptionKey,
  enrollmentTtlSeconds = 600,
  audit,
  prismaClient = prisma,
  now = new Date(),
}) {
  requireEnrollmentTtl(enrollmentTtlSeconds);
  return prismaClient.$transaction(async (tx) => {
    await lockMfaEnrollmentUser(tx, userId);
    const rows = await tx.$queryRaw`
      SELECT "id", "userId", "encryptedTotpSecret", "enrollmentStartedAt",
             "enabledAt", "lastAcceptedTotpCounter", "recoveryCodesGeneratedAt",
             "createdAt", "updatedAt"
      FROM "UserMfaCredential"
      WHERE "userId" = ${userId}
      FOR UPDATE
    `;
    const existing = rows[0];
    if (existing?.enabledAt) {
      throw mfaError("MFA_ALREADY_ENABLED", "MFA is already enabled");
    }
    const enrollmentExpiresAt = existing?.enrollmentStartedAt
      ? existing.enrollmentStartedAt.getTime() + enrollmentTtlSeconds * 1000
      : 0;
    const pendingEnrollmentIsValid = Boolean(existing) && now.getTime() < enrollmentExpiresAt;
    let secret;
    let stored;
    if (pendingEnrollmentIsValid) {
      secret = decryptTotpSecret(existing.encryptedTotpSecret, encryptionKey);
      stored = existing;
    } else {
      secret = createTotpSecret();
      const encryptedTotpSecret = encryptTotpSecret(secret, encryptionKey);
      if (existing) {
        await tx.userMfaRecoveryCode.updateMany({
          where: {
            credentialId: existing.id,
            consumedAt: null,
            invalidatedAt: null,
          },
          data: { invalidatedAt: now },
        });
      }
      stored = existing
        ? await tx.userMfaCredential.update({
          where: { id: existing.id },
          data: {
            encryptedTotpSecret,
            enrollmentStartedAt: now,
            enabledAt: null,
            lastAcceptedTotpCounter: null,
            recoveryCodesGeneratedAt: null,
          },
        })
        : await tx.userMfaCredential.create({
          data: { userId, encryptedTotpSecret, enrollmentStartedAt: now },
        });
    }
    await createMfaAuditEvent(tx, {
      event: "ENROLLMENT_STARTED",
      ...auditContext(userId, audit),
      metadata: { outcome: "started" },
    });
    return { credential: stored, secret };
  });
}

export async function confirmMfaEnrollment({
  userId,
  token,
  encryptionKey,
  enrollmentTtlSeconds = 600,
  epochSeconds = Math.floor(Date.now() / 1000),
  audit,
  prismaClient = prisma,
  now = new Date(epochSeconds * 1000),
}) {
  requireEnrollmentTtl(enrollmentTtlSeconds);

  return prismaClient.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`
      SELECT "id", "userId", "encryptedTotpSecret", "enrollmentStartedAt",
             "enabledAt", "lastAcceptedTotpCounter"
      FROM "UserMfaCredential"
      WHERE "userId" = ${userId}
      FOR UPDATE
    `;
    const credential = rows[0];
    const enrollmentExpiresAt = credential?.enrollmentStartedAt
      ? credential.enrollmentStartedAt.getTime() + enrollmentTtlSeconds * 1000
      : 0;
    if (!credential || credential.enabledAt || now.getTime() >= enrollmentExpiresAt) {
      throw invalidEnrollmentError();
    }

    const secret = decryptTotpSecret(credential.encryptedTotpSecret, encryptionKey);
    const verified = await verifyTotpCode({
      secret,
      token,
      epochSeconds,
      lastAcceptedCounter: credential.lastAcceptedTotpCounter,
    });
    if (!verified.valid) throw invalidEnrollmentError();

    const recoveryCodes = generateRecoveryCodes(10);
    const batchId = crypto.randomUUID();
    const recoveryCodeRows = recoveryCodes.map((code) => ({
      credentialId: credential.id,
      codeDigest: digestMfaValue(code, encryptionKey),
      batchId,
    }));

    await tx.userMfaRecoveryCode.updateMany({
      where: { credentialId: credential.id, consumedAt: null, invalidatedAt: null },
      data: { invalidatedAt: now },
    });
    await tx.userMfaRecoveryCode.createMany({ data: recoveryCodeRows });
    const enabledCredential = await tx.userMfaCredential.update({
      where: { id: credential.id },
      data: {
        enabledAt: now,
        lastAcceptedTotpCounter: verified.counter,
        recoveryCodesGeneratedAt: now,
      },
    });
    await createMfaAuditEvent(tx, {
      event: "MFA_ENABLED",
      ...auditContext(userId, audit),
      metadata: {
        outcome: "enabled",
        purpose: "ENROLLMENT_CONFIRMATION",
        recoveryCodeCount: 10,
      },
    });
    return { credential: enabledCredential, recoveryCodes };
  });
}

export async function recordMfaEnrollmentFailure({
  userId,
  reason = "invalid_code",
  audit,
  prismaClient = prisma,
}) {
  return prismaClient.$transaction((tx) => createMfaAuditEvent(tx, {
    event: "CHALLENGE_FAILED",
    ...auditContext(userId, audit),
    success: false,
    metadata: {
      outcome: "failed",
      reason,
      purpose: "ENROLLMENT_CONFIRMATION",
    },
  }));
}

export async function acceptMfaTotp({
  credentialId,
  token,
  encryptionKey,
  epochSeconds = Math.floor(Date.now() / 1000),
  audit,
  event = "CHALLENGE_SUCCEEDED",
  prismaClient = prisma,
}) {
  return prismaClient.$transaction(async (tx) => {
    await lockCredential(tx, credentialId);
    const credential = await tx.userMfaCredential.findUnique({
      where: { id: credentialId },
    });
    const secret = decryptTotpSecret(credential.encryptedTotpSecret, encryptionKey);
    const verified = await verifyTotpCode({
      secret,
      token,
      epochSeconds,
      lastAcceptedCounter: credential.lastAcceptedTotpCounter,
    });
    if (!verified.valid) throw mfaError("MFA_CODE_INVALID", "MFA code is invalid");
    await tx.userMfaCredential.update({
      where: { id: credentialId },
      data: { lastAcceptedTotpCounter: verified.counter },
    });
    await createMfaAuditEvent(tx, {
      event,
      ...auditContext(credential.userId, audit),
      metadata: { outcome: "succeeded" },
    });
    return { counter: verified.counter };
  });
}

export async function regenerateMfaRecoveryCodes({
  credentialId,
  encryptionKey,
  count = 10,
  audit,
  prismaClient = prisma,
  now = new Date(),
}) {
  if (count !== 10) throw new Error("Exactly 10 recovery codes are required");
  const codes = generateRecoveryCodes(count);
  const batchId = crypto.randomUUID();
  const digests = codes.map((code) => digestMfaValue(code, encryptionKey));
  await prismaClient.$transaction(async (tx) => {
    await lockCredential(tx, credentialId);
    const credential = await tx.userMfaCredential.findUnique({ where: { id: credentialId } });
    await tx.userMfaRecoveryCode.updateMany({
      where: { credentialId, consumedAt: null, invalidatedAt: null },
      data: { invalidatedAt: now },
    });
    await tx.userMfaRecoveryCode.createMany({
      data: digests.map((codeDigest) => ({ credentialId, codeDigest, batchId })),
    });
    await tx.userMfaCredential.update({
      where: { id: credentialId },
      data: { recoveryCodesGeneratedAt: now },
    });
    await createMfaAuditEvent(tx, {
      event: "RECOVERY_CODES_REGENERATED",
      ...auditContext(credential.userId, audit),
      metadata: { outcome: "succeeded", recoveryCodeCount: count },
    });
  });
  return codes;
}

export async function consumeMfaRecoveryCode({
  code,
  credentialId,
  encryptionKey,
  audit,
  prismaClient = prisma,
  now = new Date(),
}) {
  const codeDigest = digestMfaValue(code, encryptionKey);
  return prismaClient.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`
      SELECT "id", "codeDigest", "consumedAt", "invalidatedAt" FROM "UserMfaRecoveryCode"
      WHERE "credentialId" = ${credentialId} AND "codeDigest" = ${codeDigest}
      FOR UPDATE
    `;
    const stored = rows[0];
    if (
      !stored
      || stored.consumedAt
      || stored.invalidatedAt
      || !matchesMfaDigest(code, stored.codeDigest, encryptionKey)
    ) {
      throw mfaError("MFA_CODE_INVALID", "MFA code is invalid");
    }
    const credential = await tx.userMfaCredential.findUnique({ where: { id: credentialId } });
    await tx.userMfaRecoveryCode.update({
      where: { id: stored.id },
      data: { consumedAt: now },
    });
    await createMfaAuditEvent(tx, {
      event: "RECOVERY_CODE_USED",
      ...auditContext(credential.userId, audit),
      metadata: { outcome: "succeeded" },
    });
    return { consumed: true };
  });
}

export async function createMfaChallenge({
  userId,
  purpose,
  encryptionKey,
  ttlSeconds = 300,
  attempts = 5,
  prismaClient = prisma,
  now = new Date(),
}) {
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 300) {
    throw new Error("MFA challenge TTL must be between 1 and 300 seconds");
  }
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 5) {
    throw new Error("MFA challenge attempts must be between 1 and 5");
  }
  const credential = generateOpaqueChallengeCredential();
  const credentialDigest = digestMfaValue(credential, encryptionKey);
  const challenge = await prismaClient.$transaction(async (tx) => {
    const users = await tx.$queryRaw`
      SELECT "id", "authVersion" FROM "User"
      WHERE "id" = ${userId}
      FOR UPDATE
    `;
    const currentUser = users[0];
    if (!currentUser) throw mfaError("MFA_NOT_FOUND", "MFA user not found");
    return tx.mfaChallenge.create({
      data: {
        userId,
        purpose,
        authVersion: currentUser.authVersion,
        credentialDigest,
        attemptsRemaining: attempts,
        expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
      },
    });
  });
  return { challenge, credential };
}

export async function completeMfaChallenge({
  credential,
  purpose,
  encryptionKey,
  audit,
  onSuccess,
  prismaClient = prisma,
  now = new Date(),
}) {
  const credentialDigest = digestMfaValue(credential, encryptionKey);
  return prismaClient.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`
      SELECT c."id", c."userId", c."credentialDigest", c."purpose", c."expiresAt",
             c."attemptsRemaining", c."consumedAt", c."authVersion",
             u."authVersion" AS "currentAuthVersion"
      FROM "MfaChallenge" c
      JOIN "User" u ON u."id" = c."userId"
      WHERE c."credentialDigest" = ${credentialDigest}
      FOR UPDATE
    `;
    const challenge = rows[0];
    const validDigest = challenge && matchesMfaDigest(
      credential,
      challenge.credentialDigest,
      encryptionKey,
    );
    if (!validDigest) throw mfaError("MFA_CHALLENGE_INVALID", "MFA challenge is invalid");
    if (challenge.consumedAt) throw mfaError("MFA_CHALLENGE_CONSUMED", "MFA challenge is invalid");
    if (challenge.expiresAt <= now) throw mfaError("MFA_CHALLENGE_EXPIRED", "MFA challenge expired");
    if (challenge.purpose !== purpose) throw mfaError("MFA_CHALLENGE_PURPOSE", "MFA challenge is invalid");
    if (challenge.authVersion !== challenge.currentAuthVersion) {
      throw mfaError("MFA_CHALLENGE_AUTH_VERSION", "MFA challenge is invalid");
    }
    if (challenge.attemptsRemaining < 1) {
      throw mfaError("MFA_CHALLENGE_LOCKED", "MFA challenge is invalid");
    }
    const result = onSuccess ? await onSuccess(tx, challenge) : undefined;
    await tx.mfaChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: now, attemptsRemaining: 0 },
    });
    await createMfaAuditEvent(tx, {
      event: purpose === "STEP_UP" ? "STEP_UP_SUCCEEDED" : "CHALLENGE_SUCCEEDED",
      ...auditContext(challenge.userId, audit),
      metadata: { outcome: "succeeded", purpose },
    });
    return { challengeId: challenge.id, result };
  });
}

export async function recordMfaChallengeFailure({
  credential,
  purpose,
  encryptionKey,
  audit,
  prismaClient = prisma,
  now = new Date(),
}) {
  const credentialDigest = digestMfaValue(credential, encryptionKey);
  return prismaClient.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`
      SELECT c."id", c."userId", c."purpose", c."attemptsRemaining", c."consumedAt",
             c."expiresAt", c."authVersion", u."authVersion" AS "currentAuthVersion"
      FROM "MfaChallenge" c
      JOIN "User" u ON u."id" = c."userId"
      WHERE c."credentialDigest" = ${credentialDigest}
      FOR UPDATE
    `;
    const challenge = rows[0];
    if (!challenge || challenge.consumedAt || challenge.purpose !== purpose) {
      throw mfaError("MFA_CHALLENGE_INVALID", "MFA challenge is invalid");
    }
    if (challenge.expiresAt <= now) {
      throw mfaError("MFA_CHALLENGE_EXPIRED", "MFA challenge expired");
    }
    if (challenge.authVersion !== challenge.currentAuthVersion) {
      throw mfaError("MFA_CHALLENGE_AUTH_VERSION", "MFA challenge is invalid");
    }
    if (challenge.attemptsRemaining < 1) {
      throw mfaError("MFA_CHALLENGE_LOCKED", "MFA challenge is invalid");
    }
    const attemptsRemaining = Math.max(0, challenge.attemptsRemaining - 1);
    await tx.mfaChallenge.update({
      where: { id: challenge.id },
      data: { attemptsRemaining },
    });
    await createMfaAuditEvent(tx, {
      event: purpose === "STEP_UP" ? "STEP_UP_FAILED" : "CHALLENGE_FAILED",
      ...auditContext(challenge.userId, audit),
      success: false,
      metadata: {
        outcome: "failed",
        reason: attemptsRemaining === 0 ? "attempts_exhausted" : "invalid_code",
        purpose,
        attemptsRemaining,
      },
    });
    return { attemptsRemaining };
  });
}
