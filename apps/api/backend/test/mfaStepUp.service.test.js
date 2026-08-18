import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { cleanupExpiredMfaArtifacts, completeMfaChallenge, consumeStepUpProof, verifyStepUpMfaChallenge } from "../src/services/mfa.service.js";
import { createTotpCode, createTotpSecret, digestMfaValue, encryptTotpSecret } from "../src/services/mfaCrypto.service.js";
import { verifyMfaStepUp } from "../src/controllers/mfaStepUp.controller.js";
import { requireMfaStepUpForRoles } from "../src/middleware/mfaStepUp.js";

const key = Buffer.alloc(32, 41);
const now = new Date("2030-01-01T00:00:00.000Z");
const secret = createTotpSecret();

function verificationFixture({ method = "totp" } = {}) {
  const challengeCredential = `challenge-${crypto.randomUUID()}`;
  const recoveryCode = "RECOVERY-CODE-FIXTURE";
  const state = {
    challenge: {
      id: crypto.randomUUID(), userId: "user-a", purpose: "STEP_UP",
      credentialDigest: digestMfaValue(challengeCredential, key),
      expiresAt: new Date(now.getTime() + 60_000), attemptsRemaining: 5,
      consumedAt: null, authVersion: 3, currentAuthVersion: 3,
      sessionDigest: "session-a", operationScope: "refund.create", isActive: true,
      mfaCredentialId: "mfa-a", encryptedTotpSecret: encryptTotpSecret(secret, key),
      enabledAt: now, lastAcceptedTotpCounter: null,
    },
    recovery: {
      id: "recovery-a", codeDigest: digestMfaValue(recoveryCode, key), consumedAt: null,
    },
    proof: null,
    audits: [],
  };
  const tx = {
    async $queryRaw(strings) {
      if (strings.join("").includes("UserMfaRecoveryCode")) {
        return state.recovery.consumedAt ? [] : [state.recovery];
      }
      return [state.challenge];
    },
    userMfaRecoveryCode: { async update() { state.recovery.consumedAt = now; } },
    userMfaCredential: { async update({ data }) { state.challenge.lastAcceptedTotpCounter = data.lastAcceptedTotpCounter; } },
    mfaStepUpProof: { async create({ data }) { state.proof = { ...data, consumedAt: null }; return state.proof; } },
    mfaChallenge: { async update({ data }) { Object.assign(state.challenge, data); } },
    superAdminAuditLog: { async create({ data }) { state.audits.push(data); return data; } },
  };
  const prismaClient = { async $transaction(callback) { return callback(tx); } };
  return { challengeCredential, recoveryCode, state, prismaClient, method };
}

test("challenge identifier alone and a wrong TOTP are not second-factor proof", async () => {
  const response = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await verifyMfaStepUp({ body: { challenge: "identifier-only", scope: "refund.create" } }, response);
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.proof, undefined);

  const fixture = verificationFixture();
  await assert.rejects(verifyStepUpMfaChallenge({
    credential: fixture.challengeCredential, userId: "user-a", sessionDigest: "session-a",
    operationScope: "refund.create", method: "totp", code: "000000", encryptionKey: key,
    prismaClient: fixture.prismaClient, now, epochSeconds: Math.floor(now.getTime() / 1000),
  }), (error) => error.code === "MFA_CODE_INVALID");
  assert.equal(fixture.state.proof, null);
});

test("valid TOTP creates challenge-bound short-lived proof while legacy completion cannot", async () => {
  const fixture = verificationFixture();
  await assert.rejects(completeMfaChallenge({
    credential: fixture.challengeCredential, purpose: "STEP_UP", encryptionKey: key,
    prismaClient: fixture.prismaClient, now,
  }));
  const code = await createTotpCode({ secret, epochSeconds: Math.floor(now.getTime() / 1000) });
  const result = await verifyStepUpMfaChallenge({
    credential: fixture.challengeCredential, userId: "user-a", sessionDigest: "session-a",
    operationScope: "refund.create", method: "totp", code, encryptionKey: key,
    prismaClient: fixture.prismaClient, now, epochSeconds: Math.floor(now.getTime() / 1000),
  });
  assert.equal(result.challengeId, fixture.state.challenge.id);
  assert.equal(fixture.state.proof.challengeId, fixture.state.challenge.id);
  assert.equal(fixture.state.proof.userId, "user-a");
  assert.equal(fixture.state.proof.sessionDigest, "session-a");
  assert.equal(fixture.state.proof.operationScope, "refund.create");
  assert.equal(fixture.state.proof.expiresAt.getTime(), now.getTime() + 120_000);
  assert.equal(fixture.state.challenge.consumedAt, now);
});

test("proof consumption rejects replay, expiry, wrong user, session, and operation scope", async () => {
  const rawProof = "opaque-proof-fixture";
  const base = {
    credentialDigest: digestMfaValue(rawProof, key), userId: "user-a",
    sessionDigest: "session-a", operationScope: "refund.create",
    expiresAt: new Date(now.getTime() + 60_000), consumedAt: null,
  };
  const createClient = (overrides = {}) => {
    const row = { ...base, ...overrides };
    return { row, client: { async $transaction(callback) { return callback({
      mfaStepUpProof: { async updateMany({ where, data }) {
        const matches = row.credentialDigest === where.credentialDigest && row.userId === where.userId
          && row.sessionDigest === where.sessionDigest && row.operationScope === where.operationScope
          && row.consumedAt === null && row.expiresAt > where.expiresAt.gt;
        if (matches) row.consumedAt = data.consumedAt;
        return { count: matches ? 1 : 0 };
      } },
    }); } } };
  };
  const valid = createClient();
  const input = { proof: rawProof, userId: "user-a", sessionDigest: "session-a", operationScope: "refund.create", encryptionKey: key, prismaClient: valid.client, now };
  assert.deepEqual(await consumeStepUpProof(input), { consumed: true });
  await assert.rejects(consumeStepUpProof(input), (error) => error.code === "MFA_STEP_UP_REQUIRED");
  for (const change of [
    { userId: "user-b" }, { sessionDigest: "session-b" }, { operationScope: "payout.process" },
  ]) {
    const fixture = createClient();
    await assert.rejects(consumeStepUpProof({ ...input, ...change, prismaClient: fixture.client }));
  }
  const expired = createClient({ expiresAt: new Date(now.getTime() - 1) });
  await assert.rejects(consumeStepUpProof({ ...input, prismaClient: expired.client }));
});

test("a recovery code is consumed atomically and cannot be reused for another challenge", async () => {
  const fixture = verificationFixture({ method: "recovery_code" });
  const verify = () => verifyStepUpMfaChallenge({
    credential: fixture.challengeCredential, userId: "user-a", sessionDigest: "session-a",
    operationScope: "refund.create", method: "recovery_code", code: fixture.recoveryCode,
    encryptionKey: key, prismaClient: fixture.prismaClient, now,
  });
  await verify();
  fixture.state.challenge.consumedAt = null;
  fixture.state.challenge.attemptsRemaining = 5;
  fixture.state.challenge.id = crypto.randomUUID();
  fixture.state.proof = null;
  await assert.rejects(verify(), (error) => error.code === "MFA_CODE_INVALID");
  assert.equal(fixture.state.proof, null);
});

test("two simultaneous sessions cannot exchange operation proofs", async () => {
  const sessionOne = verificationFixture();
  const sessionTwo = verificationFixture();
  sessionTwo.state.challenge.sessionDigest = "session-b";
  const codeOne = await createTotpCode({ secret, epochSeconds: Math.floor(now.getTime() / 1000) });
  await verifyStepUpMfaChallenge({
    credential: sessionOne.challengeCredential, userId: "user-a", sessionDigest: "session-a",
    operationScope: "refund.create", method: "totp", code: codeOne, encryptionKey: key,
    prismaClient: sessionOne.prismaClient, now, epochSeconds: Math.floor(now.getTime() / 1000),
  });
  const rawProof = "session-one-proof";
  sessionOne.state.proof.credentialDigest = digestMfaValue(rawProof, key);
  sessionOne.prismaClient.$transaction = async (callback) => callback({
    mfaStepUpProof: { updateMany: async ({ where, data }) => {
      const matches = where.sessionDigest === "session-a" && sessionOne.state.proof.consumedAt === null;
      if (matches) sessionOne.state.proof.consumedAt = data.consumedAt;
      return { count: matches ? 1 : 0 };
    } },
  });
  await assert.rejects(consumeStepUpProof({
    proof: rawProof, userId: "user-a", sessionDigest: "session-b",
    operationScope: "refund.create", encryptionKey: key, prismaClient: sessionOne.prismaClient, now,
  }));
  assert.equal(sessionOne.state.proof.consumedAt, null);
});

test("concurrent proof consumption permits exactly one winner", async () => {
  let consumed = false;
  const prismaClient = { $transaction: async (callback) => callback({
    mfaStepUpProof: { updateMany: async ({ data }) => {
      if (consumed) return { count: 0 };
      consumed = true;
      await Promise.resolve();
      void data;
      return { count: 1 };
    } },
  }) };
  const input = { proof: "race-proof", userId: "user-a", sessionDigest: "session-a", operationScope: "refund.create", encryptionKey: key, prismaClient, now };
  const results = await Promise.allSettled([consumeStepUpProof(input), consumeStepUpProof(input)]);
  assert.deepEqual(results.map(({ status }) => status).sort(), ["fulfilled", "rejected"]);
});

test("artifact cleanup is bounded, retention-aware, and idempotent", async () => {
  const state = { proofs: ["p1", "p2"], challenges: ["c1"] };
  const tx = {
    mfaStepUpProof: {
      findMany: async ({ take }) => state.proofs.slice(0, take).map((id) => ({ id })),
      deleteMany: async ({ where }) => { const ids = where.id.in; state.proofs = state.proofs.filter((id) => !ids.includes(id)); return { count: ids.length }; },
    },
    mfaChallenge: {
      findMany: async ({ take }) => state.challenges.slice(0, take).map((id) => ({ id })),
      deleteMany: async ({ where }) => { const ids = where.id.in; state.challenges = state.challenges.filter((id) => !ids.includes(id)); return { count: ids.length }; },
    },
  };
  const prismaClient = { $transaction: async (callback) => callback(tx) };
  assert.deepEqual(await cleanupExpiredMfaArtifacts({ retentionSeconds: 60, batchSize: 1, prismaClient, now }), { proofs: 1, challenges: 1 });
  assert.deepEqual(await cleanupExpiredMfaArtifacts({ retentionSeconds: 60, batchSize: 1, prismaClient, now }), { proofs: 1, challenges: 0 });
  assert.deepEqual(await cleanupExpiredMfaArtifacts({ retentionSeconds: 60, batchSize: 1, prismaClient, now }), { proofs: 0, challenges: 0 });
});

test("role-sensitive step-up preserves ordinary party actions and denies an administrator without proof", async () => {
  const middleware = requireMfaStepUpForRoles("financial.marketplace.fulfillment", "ADMIN", "SUPER_ADMIN");
  let continued = false;
  await middleware({ user: { role: "OWNER" } }, {}, () => { continued = true; });
  assert.equal(continued, true);
  const response = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  const previous = { mode: process.env.MFA_MODE, key: process.env.MFA_ENCRYPTION_KEY };
  process.env.MFA_MODE = "required";
  process.env.MFA_ENCRYPTION_KEY = key.toString("base64");
  await middleware({ user: { sub: "admin-a", role: "ADMIN" }, get: () => "", ip: "127.0.0.1" }, response, () => assert.fail("must not continue"));
  if (previous.mode === undefined) delete process.env.MFA_MODE; else process.env.MFA_MODE = previous.mode;
  if (previous.key === undefined) delete process.env.MFA_ENCRYPTION_KEY; else process.env.MFA_ENCRYPTION_KEY = previous.key;
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.scope, "financial.marketplace.fulfillment");
});
