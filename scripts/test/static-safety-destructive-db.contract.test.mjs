import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { isAllowedDestructiveDbOperation } from "../check-destructive-db-commands.mjs";

const servicePath = "apps/api/backend/src/services/mfa.service.js";

test("static safety permits only bounded ID-list cleanup for MFA ephemeral tables", () => {
  assert.equal(isAllowedDestructiveDbOperation({
    path: servicePath,
    source: "? await tx.mfaChallenge.deleteMany({ where: { id: { in: challengeIds } } })",
  }), true);
  assert.equal(isAllowedDestructiveDbOperation({
    path: servicePath,
    source: "? await tx.mfaStepUpProof.deleteMany({ where: { id: { in: proofIds } } })",
  }), true);
});

test("static safety rejects broad cleanup, other models, paths, and commands", () => {
  for (const candidate of [
    { path: servicePath, source: "await tx.mfaChallenge.deleteMany({})" },
    { path: servicePath, source: "await tx.mfaStepUpProof.deleteMany({ where: { expiresAt: { lt: cutoff } } })" },
    { path: servicePath, source: "await tx.user.deleteMany({ where: { id: { in: challengeIds } } })" },
    { path: "apps/api/backend/src/other.js", source: "? await tx.mfaChallenge.deleteMany({ where: { id: { in: challengeIds } } })" },
    { path: servicePath, source: "await tx.$executeRawUnsafe('TRUNCATE TABLE User')" },
  ]) assert.equal(isAllowedDestructiveDbOperation(candidate), false);
});

test("MFA cleanup selects bounded IDs before either approved deletion", () => {
  const service = fs.readFileSync(new URL("../../apps/api/backend/src/services/mfa.service.js", import.meta.url), "utf8");
  const cleanup = service.slice(service.indexOf("export async function cleanupExpiredMfaArtifacts"), service.indexOf("export async function invalidatePendingMfaChallenges"));
  assert.match(cleanup, /mfaStepUpProof\.findMany\([\s\S]*take: batchSize[\s\S]*const proofIds = proofs\.map\(\(\{ id \}\) => id\)[\s\S]*mfaStepUpProof\.deleteMany\(\{ where: \{ id: \{ in: proofIds \} \} \}\)/);
  assert.match(cleanup, /mfaChallenge\.findMany\([\s\S]*take: batchSize[\s\S]*const challengeIds = challenges\.map\(\(\{ id \}\) => id\)[\s\S]*mfaChallenge\.deleteMany\(\{ where: \{ id: \{ in: challengeIds \} \} \}\)/);
});
