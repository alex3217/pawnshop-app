import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const schema = fs.readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../prisma/migrations/20260818210000_real_mfa_step_up_security/migration.sql", import.meta.url), "utf8");

test("MFA challenge/proof expiry indexes have schema and migration parity", () => {
  const challenge = schema.slice(schema.indexOf("model MfaChallenge"), schema.indexOf("model MfaStepUpProof"));
  const proof = schema.slice(schema.indexOf("model MfaStepUpProof"), schema.indexOf("model BuyerSubscription"));
  assert.match(challenge, /@@index\(\[expiresAt\]\)/);
  assert.match(proof, /@@index\(\[expiresAt\]\)/);
  assert.match(migration, /CREATE INDEX "MfaChallenge_expiresAt_idx" ON "MfaChallenge"\("expiresAt"\)/);
  assert.match(migration, /CREATE INDEX "MfaStepUpProof_expiresAt_idx" ON "MfaStepUpProof"\("expiresAt"\)/);
});
