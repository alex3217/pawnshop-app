import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { completeMfaChallenge, consumeStepUpProof, verifyStepUpMfaChallenge } from "../src/services/mfa.service.js";
import { createTotpCode, createTotpSecret, digestMfaValue, encryptTotpSecret } from "../src/services/mfaCrypto.service.js";
import { verifyMfaStepUp } from "../src/controllers/mfaStepUp.controller.js";

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
