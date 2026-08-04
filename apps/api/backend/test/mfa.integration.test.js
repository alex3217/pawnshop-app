import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import { prisma } from "../src/lib/prisma.js";
import {
  acceptMfaTotp,
  completeMfaChallenge,
  consumeMfaRecoveryCode,
  createMfaChallenge,
  recordMfaChallengeFailure,
  regenerateMfaRecoveryCodes,
  startMfaEnrollment,
} from "../src/services/mfa.service.js";
import { createTotpCode, decryptTotpSecret } from "../src/services/mfaCrypto.service.js";

const encryptionKey = Buffer.alloc(32, 37);
const marker = `mfa-foundation-${Date.now()}`;
let user;

async function cleanup() {
  await prisma.superAdminAuditLog.deleteMany({ where: { targetId: user?.id || marker } });
  if (user?.id) await prisma.user.deleteMany({ where: { id: user.id } });
}

before(async () => {
  user = await prisma.user.create({
    data: {
      name: "MFA Foundation Test",
      email: `${marker}@example.test`,
      password: "not-used",
      role: "CONSUMER",
      emailVerifiedAt: new Date(),
    },
  });
});

beforeEach(async () => {
  await prisma.superAdminAuditLog.deleteMany({ where: { targetId: user.id } });
  await prisma.mfaChallenge.deleteMany({ where: { userId: user.id } });
  await prisma.userMfaCredential.deleteMany({ where: { userId: user.id } });
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("enrollment stores only an encrypted TOTP secret and creates an atomic audit", async () => {
  const { credential, secret } = await startMfaEnrollment({
    userId: user.id,
    encryptionKey,
  });
  const stored = await prisma.userMfaCredential.findUnique({ where: { id: credential.id } });
  assert.equal(stored.encryptedTotpSecret.includes(secret), false);
  assert.equal(decryptTotpSecret(stored.encryptedTotpSecret, encryptionKey), secret);
  assert.equal(stored.enabledAt, null);
  assert.equal(await prisma.superAdminAuditLog.count({
    where: { targetId: user.id, action: "MFA_ENROLLMENT_STARTED" },
  }), 1);
});

test("enrollment initiation cannot replace or disable an enabled credential", async () => {
  const { credential } = await startMfaEnrollment({ userId: user.id, encryptionKey });
  const enabledAt = new Date();
  await prisma.userMfaCredential.update({
    where: { id: credential.id },
    data: { enabledAt, lastAcceptedTotpCounter: 123 },
  });
  await assert.rejects(
    startMfaEnrollment({ userId: user.id, encryptionKey }),
    (error) => error.code === "MFA_ALREADY_ENABLED",
  );
  const stored = await prisma.userMfaCredential.findUnique({ where: { id: credential.id } });
  assert.equal(stored.enabledAt.getTime(), enabledAt.getTime());
  assert.equal(stored.lastAcceptedTotpCounter, 123);
});

test("concurrent TOTP acceptance permits one request for a time step", async () => {
  const { credential, secret } = await startMfaEnrollment({ userId: user.id, encryptionKey });
  const epochSeconds = 2_000_000_010;
  const token = await createTotpCode({ secret, epochSeconds });
  const results = await Promise.allSettled([
    acceptMfaTotp({ credentialId: credential.id, token, encryptionKey, epochSeconds }),
    acceptMfaTotp({ credentialId: credential.id, token, encryptionKey, epochSeconds }),
  ]);
  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(results.filter(({ status }) => status === "rejected").length, 1);
});

test("recovery codes persist only digests and concurrent consumption succeeds once", async () => {
  const { credential } = await startMfaEnrollment({ userId: user.id, encryptionKey });
  const codes = await regenerateMfaRecoveryCodes({ credentialId: credential.id, encryptionKey });
  const serialized = JSON.stringify(await prisma.userMfaRecoveryCode.findMany({
    where: { credentialId: credential.id },
  }));
  for (const code of codes) assert.equal(serialized.includes(code), false);
  const results = await Promise.allSettled([
    consumeMfaRecoveryCode({ code: codes[0], credentialId: credential.id, encryptionKey }),
    consumeMfaRecoveryCode({ code: codes[0], credentialId: credential.id, encryptionKey }),
  ]);
  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(results.filter(({ status }) => status === "rejected").length, 1);
  assert.equal(await prisma.userMfaRecoveryCode.count({
    where: { credentialId: credential.id, consumedAt: { not: null } },
  }), 1);
  await assert.rejects(
    regenerateMfaRecoveryCodes({
      credentialId: credential.id, encryptionKey, count: 9,
    }),
    /Exactly 10 recovery codes/,
  );
});

test("regeneration invalidates old recovery codes, preserves history, and issues ten active codes", async () => {
  const { credential } = await startMfaEnrollment({ userId: user.id, encryptionKey });
  const oldCodes = await regenerateMfaRecoveryCodes({ credentialId: credential.id, encryptionKey });
  const oldRows = await prisma.userMfaRecoveryCode.findMany({
    where: { credentialId: credential.id },
  });
  const regeneratedAt = new Date("2031-01-01T00:00:00.000Z");
  const newCodes = await regenerateMfaRecoveryCodes({
    credentialId: credential.id,
    encryptionKey,
    now: regeneratedAt,
  });
  const allRows = await prisma.userMfaRecoveryCode.findMany({
    where: { credentialId: credential.id },
  });

  assert.equal(allRows.length, 20);
  const oldIds = new Set(oldRows.map(({ id }) => id));
  const preserved = allRows.filter(({ id }) => oldIds.has(id));
  assert.equal(preserved.length, 10);
  assert.equal(preserved.every(({ consumedAt }) => consumedAt === null), true);
  assert.equal(
    preserved.every(({ invalidatedAt }) => invalidatedAt?.getTime() === regeneratedAt.getTime()),
    true,
  );
  assert.equal(allRows.filter(({ consumedAt, invalidatedAt }) => (
    consumedAt === null && invalidatedAt === null
  )).length, 10);
  await assert.rejects(
    consumeMfaRecoveryCode({
      code: oldCodes[0], credentialId: credential.id, encryptionKey,
    }),
    (error) => error.code === "MFA_CODE_INVALID",
  );
  await consumeMfaRecoveryCode({
    code: newCodes[0], credentialId: credential.id, encryptionKey,
  });
  await assert.rejects(
    consumeMfaRecoveryCode({
      code: newCodes[0], credentialId: credential.id, encryptionKey,
    }),
    (error) => error.code === "MFA_CODE_INVALID",
  );

  const serializedPersistence = JSON.stringify(allRows);
  const serializedAudits = JSON.stringify(await prisma.superAdminAuditLog.findMany({
    where: { targetId: user.id },
  }));
  for (const code of [...oldCodes, ...newCodes]) {
    assert.equal(serializedPersistence.includes(code), false);
    assert.equal(serializedAudits.includes(code), false);
  }
});

test("restarting incomplete enrollment invalidates prior recovery codes without deleting them", async () => {
  const first = await startMfaEnrollment({ userId: user.id, encryptionKey });
  const codes = await regenerateMfaRecoveryCodes({
    credentialId: first.credential.id,
    encryptionKey,
  });
  const oldRows = await prisma.userMfaRecoveryCode.findMany({
    where: { credentialId: first.credential.id },
  });
  const restartedAt = new Date("2031-02-01T00:00:00.000Z");
  const restarted = await startMfaEnrollment({
    userId: user.id,
    encryptionKey,
    now: restartedAt,
  });
  const storedRows = await prisma.userMfaRecoveryCode.findMany({
    where: { credentialId: first.credential.id },
  });

  assert.equal(restarted.credential.id, first.credential.id);
  assert.deepEqual(storedRows.map(({ id }) => id).sort(), oldRows.map(({ id }) => id).sort());
  assert.equal(storedRows.every(({ consumedAt }) => consumedAt === null), true);
  assert.equal(
    storedRows.every(({ invalidatedAt }) => invalidatedAt?.getTime() === restartedAt.getTime()),
    true,
  );
  await assert.rejects(
    consumeMfaRecoveryCode({
      code: codes[0], credentialId: first.credential.id, encryptionKey,
    }),
    (error) => error.code === "MFA_CODE_INVALID",
  );
});

test("audit failure rolls back recovery-code invalidation, replacement, and credential mutation", async () => {
  const { credential } = await startMfaEnrollment({ userId: user.id, encryptionKey });
  const oldCodes = await regenerateMfaRecoveryCodes({ credentialId: credential.id, encryptionKey });
  const beforeCredential = await prisma.userMfaCredential.findUnique({
    where: { id: credential.id },
  });
  const beforeRows = await prisma.userMfaRecoveryCode.findMany({
    where: { credentialId: credential.id },
    orderBy: { id: "asc" },
  });
  const failingAuditClient = {
    $transaction(callback, options) {
      return prisma.$transaction((tx) => callback(new Proxy(tx, {
        get(target, property) {
          if (property === "superAdminAuditLog") {
            return { create: async () => { throw new Error("audit unavailable"); } };
          }
          return Reflect.get(target, property);
        },
      })), options);
    },
  };

  await assert.rejects(
    regenerateMfaRecoveryCodes({
      credentialId: credential.id,
      encryptionKey,
      prismaClient: failingAuditClient,
      now: new Date("2031-03-01T00:00:00.000Z"),
    }),
    /audit unavailable/,
  );
  const afterCredential = await prisma.userMfaCredential.findUnique({
    where: { id: credential.id },
  });
  const afterRows = await prisma.userMfaRecoveryCode.findMany({
    where: { credentialId: credential.id },
    orderBy: { id: "asc" },
  });
  assert.equal(afterCredential.recoveryCodesGeneratedAt.getTime(), (
    beforeCredential.recoveryCodesGeneratedAt.getTime()
  ));
  assert.deepEqual(afterRows, beforeRows);
  await consumeMfaRecoveryCode({
    code: oldCodes[0], credentialId: credential.id, encryptionKey,
  });
});

test("challenges are purpose/authVersion bound, attempt limited, expiring, and single-use", async () => {
  const now = new Date("2030-01-01T00:00:00.000Z");
  const first = await createMfaChallenge({
    userId: user.id, purpose: "LOGIN", encryptionKey, attempts: 2, now,
  });
  await assert.rejects(
    completeMfaChallenge({
      credential: first.credential, purpose: "STEP_UP", encryptionKey, now,
    }),
    (error) => error.code === "MFA_CHALLENGE_PURPOSE",
  );
  await prisma.user.update({ where: { id: user.id }, data: { authVersion: { increment: 1 } } });
  await assert.rejects(
    completeMfaChallenge({
      credential: first.credential, purpose: "LOGIN", encryptionKey, now,
    }),
    (error) => error.code === "MFA_CHALLENGE_AUTH_VERSION",
  );
  await prisma.user.update({ where: { id: user.id }, data: { authVersion: { decrement: 1 } } });
  await completeMfaChallenge({
    credential: first.credential, purpose: "LOGIN", encryptionKey, now,
  });
  await assert.rejects(
    completeMfaChallenge({
      credential: first.credential, purpose: "LOGIN", encryptionKey, now,
    }),
    (error) => error.code === "MFA_CHALLENGE_CONSUMED",
  );

  const expired = await createMfaChallenge({
    userId: user.id, purpose: "LOGIN", encryptionKey, ttlSeconds: 1, now,
  });
  await assert.rejects(
    completeMfaChallenge({
      credential: expired.credential,
      purpose: "LOGIN",
      encryptionKey,
      now: new Date(now.getTime() + 1001),
    }),
    (error) => error.code === "MFA_CHALLENGE_EXPIRED",
  );

  const limited = await createMfaChallenge({
    userId: user.id, purpose: "LOGIN", encryptionKey, attempts: 1, now,
  });
  assert.deepEqual(await recordMfaChallengeFailure({
    credential: limited.credential, purpose: "LOGIN", encryptionKey,
  }), { attemptsRemaining: 0 });
  await assert.rejects(
    completeMfaChallenge({
      credential: limited.credential, purpose: "LOGIN", encryptionKey, now,
    }),
    (error) => error.code === "MFA_CHALLENGE_LOCKED",
  );

  await assert.rejects(
    createMfaChallenge({
      userId: user.id, purpose: "LOGIN", encryptionKey, ttlSeconds: 301,
    }),
    /between 1 and 300/,
  );
});

test("challenge failure recording rejects expired and authVersion-invalid challenges without mutation", async () => {
  const now = new Date("2030-01-01T00:00:00.000Z");
  const expired = await createMfaChallenge({
    userId: user.id, purpose: "LOGIN", encryptionKey, attempts: 3, ttlSeconds: 1, now,
  });
  await assert.rejects(
    recordMfaChallengeFailure({
      credential: expired.credential,
      purpose: "LOGIN",
      encryptionKey,
      now: new Date(now.getTime() + 1001),
    }),
    (error) => error.code === "MFA_CHALLENGE_EXPIRED",
  );
  assert.equal((await prisma.mfaChallenge.findUnique({
    where: { id: expired.challenge.id },
  })).attemptsRemaining, 3);

  const stale = await createMfaChallenge({
    userId: user.id, purpose: "LOGIN", encryptionKey, attempts: 3, now,
  });
  await prisma.user.update({ where: { id: user.id }, data: { authVersion: { increment: 1 } } });
  await assert.rejects(
    recordMfaChallengeFailure({
      credential: stale.credential, purpose: "LOGIN", encryptionKey, now,
    }),
    (error) => error.code === "MFA_CHALLENGE_AUTH_VERSION",
  );
  assert.equal((await prisma.mfaChallenge.findUnique({
    where: { id: stale.challenge.id },
  })).attemptsRemaining, 3);
  await prisma.user.update({ where: { id: user.id }, data: { authVersion: { decrement: 1 } } });
});

test("concurrent challenge completion runs the protected mutation once", async () => {
  const issued = await createMfaChallenge({
    userId: user.id, purpose: "STEP_UP", encryptionKey,
  });
  let mutations = 0;
  const complete = () => completeMfaChallenge({
    credential: issued.credential,
    purpose: "STEP_UP",
    encryptionKey,
    onSuccess: async () => { mutations += 1; },
  });
  const results = await Promise.allSettled([complete(), complete()]);
  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(mutations, 1);
});

test("audit persistence failure rolls back a successful challenge mutation", async () => {
  const issued = await createMfaChallenge({
    userId: user.id, purpose: "LOGIN", encryptionKey,
  });
  const failingAuditClient = {
    $transaction(callback, options) {
      return prisma.$transaction((tx) => callback(new Proxy(tx, {
        get(target, property) {
          if (property === "superAdminAuditLog") {
            return { create: async () => { throw new Error("audit unavailable"); } };
          }
          return Reflect.get(target, property);
        },
      })), options);
    },
  };
  await assert.rejects(
    completeMfaChallenge({
      credential: issued.credential,
      purpose: "LOGIN",
      encryptionKey,
      prismaClient: failingAuditClient,
    }),
    /audit unavailable/,
  );
  const stored = await prisma.mfaChallenge.findUnique({ where: { id: issued.challenge.id } });
  assert.equal(stored.consumedAt, null);
  assert.equal(stored.attemptsRemaining, 5);
});
