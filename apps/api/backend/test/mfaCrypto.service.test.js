import assert from "node:assert/strict";
import test from "node:test";
import {
  createTotpCode,
  createTotpSecret,
  decryptTotpSecret,
  digestMfaValue,
  encryptTotpSecret,
  generateOpaqueChallengeCredential,
  generateRecoveryCodes,
  matchesMfaDigest,
  verifyTotpCode,
} from "../src/services/mfaCrypto.service.js";

const key = Buffer.alloc(32, 19);

test("TOTP secrets use authenticated encryption with no plaintext persistence", () => {
  const secret = createTotpSecret();
  const encrypted = encryptTotpSecret(secret, key);
  assert.notEqual(encrypted, secret);
  assert.equal(encrypted.includes(secret), false);
  assert.equal(decryptTotpSecret(encrypted, key), secret);
  assert.throws(() => decryptTotpSecret(`${encrypted}x`, key), /authenticated|invalid/);
  assert.throws(() => encryptTotpSecret(secret, Buffer.alloc(16)), /dedicated 32-byte/);
});

test("TOTP verification permits one time step of skew and rejects replay", async () => {
  const secret = createTotpSecret();
  const epoch = 2_000_000_000;
  const previousCode = await createTotpCode({ secret, epochSeconds: epoch - 30 });
  const accepted = await verifyTotpCode({ secret, token: previousCode, epochSeconds: epoch });
  assert.equal(accepted.valid, true);
  assert.equal(accepted.counter, Math.floor((epoch - 30) / 30));
  const replay = await verifyTotpCode({
    secret,
    token: previousCode,
    epochSeconds: epoch,
    lastAcceptedCounter: accepted.counter,
  });
  assert.equal(replay.valid, false);
  const tooOld = await createTotpCode({ secret, epochSeconds: epoch - 60 });
  assert.equal((await verifyTotpCode({ secret, token: tooOld, epochSeconds: epoch })).valid, false);
  await assert.rejects(
    verifyTotpCode({ secret, token: previousCode, epochSeconds: epoch, skewSeconds: 31 }),
    /between 0 and 30 seconds/,
  );
});

test("recovery and challenge values are random and compared by keyed digest", () => {
  const codes = generateRecoveryCodes(10);
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  const challenge = generateOpaqueChallengeCredential();
  const digest = digestMfaValue(challenge, key);
  assert.equal(digest.includes(challenge), false);
  assert.equal(matchesMfaDigest(challenge, digest, key), true);
  assert.equal(matchesMfaDigest(`${challenge}x`, digest, key), false);
});
