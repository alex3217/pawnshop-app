import assert from "node:assert/strict";
import test from "node:test";
import { verifyStagingMigrationEvidence } from "../verify-staging-migration-evidence.mjs";

const expected = { releaseSha: "a".repeat(40), registryDigest: "b".repeat(64), repository: "alex3217/pawnshop-app", workflowRunId: "123" };
const valid = { ...expected, workflowRunId: 123, migrateDeploy: "success", postMigrationStatus: "clean" };

test("exact staging migration evidence is accepted", () => assert.equal(verifyStagingMigrationEvidence(valid, expected), true));
for (const [name, mutation] of [
  ["stale SHA", { releaseSha: "c".repeat(40) }],
  ["mismatched registry", { registryDigest: "d".repeat(64) }],
  ["failed migration", { migrateDeploy: "failure" }],
  ["dirty status", { postMigrationStatus: "pending" }],
  ["wrong run", { workflowRunId: 456 }],
]) test(`${name} cannot authorize release`, () => assert.throws(() => verifyStagingMigrationEvidence({ ...valid, ...mutation }, expected)));
test("missing evidence cannot authorize release", () => assert.throws(() => verifyStagingMigrationEvidence(null, expected)));
