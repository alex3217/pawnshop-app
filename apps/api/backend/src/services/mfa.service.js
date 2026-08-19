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
        await tx.mfaChallenge.updateMany({
          where: { userId, consumedAt: null },
          data: { consumedAt: now, attemptsRemaining: 0 },
        });
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
    await tx.mfaChallenge.updateMany({
      where: { userId: credential.userId, consumedAt: null },
      data: { consumedAt: now, attemptsRemaining: 0 },
    });
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
  sessionDigest = null,
  operationScope = null,
  encryptionKey,
  ttlSeconds = 300,
  attempts = 5,
  prismaClient = prisma,
  now = new Date(),
  audit,
}) {
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 300) {
    throw new Error("MFA challenge TTL must be between 1 and 300 seconds");
  }
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 5) {
    throw new Error("MFA challenge attempts must be between 1 and 5");
  }
  if (purpose === "STEP_UP" && (!sessionDigest || !operationScope)) {
    throw new Error("STEP_UP challenges require session and operation scope binding");
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
    const created = await tx.mfaChallenge.create({
      data: {
        userId,
        purpose,
        authVersion: currentUser.authVersion,
        credentialDigest,
        attemptsRemaining: attempts,
        sessionDigest,
        operationScope,
        expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
      },
    });
    await createMfaAuditEvent(tx, {
      event: "CHALLENGE_ISSUED", ...auditContext(userId, audit),
      metadata: { outcome: "issued", purpose },
    });
    return created;
  });
  return { challenge, credential };
}

export async function verifyStepUpMfaChallenge({
  credential,
  userId,
  sessionDigest,
  operationScope,
  method,
  code,
  encryptionKey,
  proofTtlSeconds = 120,
  audit,
  prismaClient = prisma,
  now = new Date(),
  epochSeconds = Math.floor(now.getTime() / 1000),
}) {
  if (!Number.isSafeInteger(proofTtlSeconds) || proofTtlSeconds < 1 || proofTtlSeconds > 120) {
    throw new Error("MFA step-up proof TTL must be between 1 and 120 seconds");
  }
  const credentialDigest = digestMfaValue(credential, encryptionKey);
  return prismaClient.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`
      SELECT c."id", c."userId", c."credentialDigest", c."purpose", c."expiresAt",
             c."attemptsRemaining", c."consumedAt", c."authVersion", c."sessionDigest",
             c."operationScope", u."authVersion" AS "currentAuthVersion", u."isActive",
             m."id" AS "mfaCredentialId", m."encryptedTotpSecret", m."enabledAt",
             m."lastAcceptedTotpCounter"
      FROM "MfaChallenge" c
      JOIN "User" u ON u."id" = c."userId"
      JOIN "UserMfaCredential" m ON m."userId" = c."userId"
      WHERE c."credentialDigest" = ${credentialDigest}
      FOR UPDATE OF c, m
    `;
    const challenge = rows[0];
    if (!challenge || !matchesMfaDigest(credential, challenge.credentialDigest, encryptionKey)
      || challenge.purpose !== "STEP_UP" || challenge.consumedAt || challenge.expiresAt <= now
      || challenge.attemptsRemaining < 1 || challenge.authVersion !== challenge.currentAuthVersion
      || !challenge.isActive || !challenge.enabledAt || challenge.userId !== userId
      || challenge.sessionDigest !== sessionDigest || challenge.operationScope !== operationScope) {
      throw mfaError("MFA_CHALLENGE_INVALID", "MFA challenge is invalid");
    }

    if (method === "recovery_code") {
      const codeDigest = digestMfaValue(code, encryptionKey);
      const codes = await tx.$queryRaw`
        SELECT "id", "codeDigest" FROM "UserMfaRecoveryCode"
        WHERE "credentialId" = ${challenge.mfaCredentialId}
          AND "codeDigest" = ${codeDigest} AND "consumedAt" IS NULL AND "invalidatedAt" IS NULL
        FOR UPDATE
      `;
      const stored = codes[0];
      if (!stored || !matchesMfaDigest(code, stored.codeDigest, encryptionKey)) {
        throw mfaError("MFA_CODE_INVALID", "MFA code is invalid");
      }
      await tx.userMfaRecoveryCode.update({ where: { id: stored.id }, data: { consumedAt: now } });
      await createMfaAuditEvent(tx, {
        event: "RECOVERY_CODE_USED", ...auditContext(challenge.userId, audit),
        metadata: { outcome: "succeeded", purpose: "STEP_UP" },
      });
    } else {
      const secret = decryptTotpSecret(challenge.encryptedTotpSecret, encryptionKey);
      const verified = await verifyTotpCode({
        secret, token: code, epochSeconds,
        lastAcceptedCounter: challenge.lastAcceptedTotpCounter,
      });
      if (!verified.valid) throw mfaError("MFA_CODE_INVALID", "MFA code is invalid");
      await tx.userMfaCredential.update({
        where: { id: challenge.mfaCredentialId }, data: { lastAcceptedTotpCounter: verified.counter },
      });
    }

    const proof = generateOpaqueChallengeCredential();
    await tx.mfaStepUpProof.create({
      data: {
        challengeId: challenge.id,
        userId,
        sessionDigest,
        operationScope,
        credentialDigest: digestMfaValue(proof, encryptionKey),
        expiresAt: new Date(now.getTime() + proofTtlSeconds * 1000),
      },
    });
    await tx.mfaChallenge.update({
      where: { id: challenge.id }, data: { consumedAt: now, attemptsRemaining: 0 },
    });
    await createMfaAuditEvent(tx, {
      event: "STEP_UP_SUCCEEDED", ...auditContext(challenge.userId, audit),
      metadata: { outcome: "succeeded", purpose: "STEP_UP" },
    });
    return { proof, challengeId: challenge.id, expiresInSeconds: proofTtlSeconds };
  });
}

export async function consumeStepUpProof({
  proof,
  userId,
  sessionDigest,
  operationScope,
  encryptionKey,
  prismaClient = prisma,
  now = new Date(),
}) {
  const credentialDigest = digestMfaValue(proof, encryptionKey);
  return prismaClient.$transaction(async (tx) => {
    const consumed = await tx.mfaStepUpProof.updateMany({
      where: {
        credentialDigest,
        userId,
        sessionDigest,
        operationScope,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) throw mfaError("MFA_STEP_UP_REQUIRED", "Valid step-up proof required");
    return { consumed: true };
  });
}

export async function cleanupExpiredMfaArtifacts({
  retentionSeconds = 604800,
  batchSize = 100,
  prismaClient = prisma,
  now = new Date(),
}) {
  if (!Number.isSafeInteger(retentionSeconds) || retentionSeconds < 1 || retentionSeconds > 2592000) {
    throw new Error("MFA artifact retention must be between 1 and 2592000 seconds");
  }
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new Error("MFA cleanup batch size must be between 1 and 500");
  }
  const cutoff = new Date(now.getTime() - retentionSeconds * 1000);
  return prismaClient.$transaction(async (tx) => {
    const proofs = await tx.mfaStepUpProof.findMany({
      where: { OR: [{ expiresAt: { lte: cutoff } }, { consumedAt: { lte: cutoff } }] },
      select: { id: true },
      orderBy: { expiresAt: "asc" },
      take: batchSize,
    });
    const proofIds = proofs.map(({ id }) => id);
    const deletedProofs = proofIds.length
      ? await tx.mfaStepUpProof.deleteMany({ where: { id: { in: proofIds } } })
      : { count: 0 };
    const challenges = await tx.mfaChallenge.findMany({
      where: { OR: [{ expiresAt: { lte: cutoff } }, { consumedAt: { lte: cutoff } }] },
      select: { id: true },
      orderBy: { expiresAt: "asc" },
      take: batchSize,
    });
    const challengeIds = challenges.map(({ id }) => id);
    const deletedChallenges = challengeIds.length
      ? await tx.mfaChallenge.deleteMany({ where: { id: { in: challengeIds } } })
      : { count: 0 };
    return { proofs: deletedProofs.count, challenges: deletedChallenges.count };
  });
}

export async function invalidatePendingMfaChallenges({
  userId, prismaClient = prisma, now = new Date(),
}) {
  return prismaClient.mfaChallenge.updateMany({
    where: { userId, consumedAt: null },
    data: { consumedAt: now, attemptsRemaining: 0 },
  });
}

export async function completeLoginMfaChallenge({
  credential,
  method,
  code,
  encryptionKey,
  audit,
  prismaClient = prisma,
  now = new Date(),
  epochSeconds = Math.floor(now.getTime() / 1000),
}) {
  const credentialDigest = digestMfaValue(credential, encryptionKey);
  return prismaClient.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`
      SELECT c."id", c."userId", c."credentialDigest", c."purpose", c."expiresAt",
             c."attemptsRemaining", c."consumedAt", c."authVersion",
             u."authVersion" AS "currentAuthVersion", u."isActive",
             m."id" AS "mfaCredentialId", m."encryptedTotpSecret", m."enabledAt",
             m."lastAcceptedTotpCounter"
      FROM "MfaChallenge" c
      JOIN "User" u ON u."id" = c."userId"
      JOIN "UserMfaCredential" m ON m."userId" = c."userId"
      WHERE c."credentialDigest" = ${credentialDigest}
      FOR UPDATE OF c, m
    `;
    const challenge = rows[0];
    if (!challenge || !matchesMfaDigest(credential, challenge.credentialDigest, encryptionKey)
      || challenge.purpose !== "LOGIN" || challenge.consumedAt || challenge.expiresAt <= now
      || challenge.attemptsRemaining < 1 || challenge.authVersion !== challenge.currentAuthVersion
      || !challenge.isActive || !challenge.enabledAt) {
      throw mfaError("MFA_CHALLENGE_INVALID", "MFA challenge is invalid");
    }

    if (method === "recovery_code") {
      const codeDigest = digestMfaValue(code, encryptionKey);
      const codes = await tx.$queryRaw`
        SELECT "id", "codeDigest" FROM "UserMfaRecoveryCode"
        WHERE "credentialId" = ${challenge.mfaCredentialId}
          AND "codeDigest" = ${codeDigest} AND "consumedAt" IS NULL AND "invalidatedAt" IS NULL
        FOR UPDATE
      `;
      const stored = codes[0];
      if (!stored || !matchesMfaDigest(code, stored.codeDigest, encryptionKey)) {
        throw mfaError("MFA_CODE_INVALID", "MFA code is invalid");
      }
      await tx.userMfaRecoveryCode.update({ where: { id: stored.id }, data: { consumedAt: now } });
      await createMfaAuditEvent(tx, {
        event: "RECOVERY_CODE_USED", ...auditContext(challenge.userId, audit),
        metadata: { outcome: "succeeded", purpose: "LOGIN" },
      });
    } else {
      const secret = decryptTotpSecret(challenge.encryptedTotpSecret, encryptionKey);
      const verified = await verifyTotpCode({
        secret, token: code, epochSeconds,
        lastAcceptedCounter: challenge.lastAcceptedTotpCounter,
      });
      if (!verified.valid) throw mfaError("MFA_CODE_INVALID", "MFA code is invalid");
      await tx.userMfaCredential.update({
        where: { id: challenge.mfaCredentialId }, data: { lastAcceptedTotpCounter: verified.counter },
      });
    }
    await tx.mfaChallenge.update({
      where: { id: challenge.id }, data: { consumedAt: now, attemptsRemaining: 0 },
    });
    await createMfaAuditEvent(tx, {
      event: "CHALLENGE_SUCCEEDED", ...auditContext(challenge.userId, audit),
      metadata: { outcome: "succeeded", purpose: "LOGIN", method },
    });
    const user = await tx.user.findUnique({ where: { id: challenge.userId } });
    return { user };
  });
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
  if (purpose === "STEP_UP") {
    throw mfaError("MFA_CODE_REQUIRED", "TOTP or recovery-code verification is required");
  }
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
  userId = null,
  sessionDigest = null,
  operationScope = null,
  encryptionKey,
  audit,
  prismaClient = prisma,
  now = new Date(),
}) {
  const credentialDigest = digestMfaValue(credential, encryptionKey);
  return prismaClient.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`
      SELECT c."id", c."userId", c."purpose", c."attemptsRemaining", c."consumedAt",
             c."expiresAt", c."authVersion", c."sessionDigest", c."operationScope",
             u."authVersion" AS "currentAuthVersion"
      FROM "MfaChallenge" c
      JOIN "User" u ON u."id" = c."userId"
      WHERE c."credentialDigest" = ${credentialDigest}
      FOR UPDATE
    `;
    const challenge = rows[0];
    if (!challenge || challenge.consumedAt || challenge.purpose !== purpose) {
      throw mfaError("MFA_CHALLENGE_INVALID", "MFA challenge is invalid");
    }
    if ((userId && challenge.userId !== userId)
      || (sessionDigest && challenge.sessionDigest !== sessionDigest)
      || (operationScope && challenge.operationScope !== operationScope)) {
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
