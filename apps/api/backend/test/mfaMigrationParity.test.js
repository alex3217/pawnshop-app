import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const schema = fs.readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const migrationsDirectory = fileURLToPath(new URL("../prisma/migrations", import.meta.url));
const migrations = fs.readdirSync(migrationsDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .sort((left, right) => left.name.localeCompare(right.name))
  .map((entry) => ({
    name: entry.name,
    sql: fs.readFileSync(path.join(migrationsDirectory, entry.name, "migration.sql"), "utf8"),
  }));
const migrationChain = migrations.map(({ sql }) => sql).join("\n");
const stepUpMigration = migrations.find(({ name }) => name === "20260818210000_real_mfa_step_up_security")?.sql || "";

test("MFA challenge/proof expiry indexes have schema and migration parity", () => {
  const challenge = schema.slice(schema.indexOf("model MfaChallenge"), schema.indexOf("model MfaStepUpProof"));
  const proof = schema.slice(schema.indexOf("model MfaStepUpProof"), schema.indexOf("model BuyerSubscription"));
  assert.match(challenge, /@@index\(\[expiresAt\]\)/);
  assert.match(proof, /@@index\(\[expiresAt\]\)/);
  const challengeIndex = /CREATE INDEX "MfaChallenge_expiresAt_idx"\s+ON "MfaChallenge"\s*\("expiresAt"\)/g;
  assert.equal([...migrationChain.matchAll(challengeIndex)].length, 1);
  assert.doesNotMatch(stepUpMigration, /CREATE INDEX "MfaChallenge_expiresAt_idx"/);
  assert.match(stepUpMigration, /CREATE INDEX "MfaStepUpProof_expiresAt_idx" ON "MfaStepUpProof"\("expiresAt"\)/);
});
