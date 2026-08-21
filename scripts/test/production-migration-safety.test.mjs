import assert from "node:assert/strict";
import { chmod, lstat, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  EXPECTED_COMPLETED, EXPECTED_PENDING, HISTORICAL_ROLLBACK_FINGERPRINTS, REQUIRED_CONFIRMATION, REQUIRED_TIMEOUTS, VALIDATION_MIGRATION,
  readApprovalFile, targetFingerprint, validateChecks, validatePending, validatePostconditions,
  validateHistoricalMigrationState, validateStartingState, validateTimeouts,
} from "../lib/production-migration-safety.mjs";

const repositoryChecksums = Object.fromEntries([...EXPECTED_COMPLETED, ...EXPECTED_PENDING, VALIDATION_MIGRATION].map((migrationName) => {
  const fingerprint = HISTORICAL_ROLLBACK_FINGERPRINTS.find((x) => x.migrationName === migrationName);
  return [migrationName, fingerprint?.successfulChecksum || `checksum-${migrationName}`];
}));
const historicalState = { approvedFingerprints: HISTORICAL_ROLLBACK_FINGERPRINTS, repositoryChecksums };
const finishedRecords = (names) => names.map((migration_name, index) => {
  const fingerprint = HISTORICAL_ROLLBACK_FINGERPRINTS.find((x) => x.migrationName === migration_name);
  return { migration_name, checksum: fingerprint?.successfulChecksum || `checksum-${migration_name}`, started_at: new Date(1_000_000 + index * 10_000).toISOString(), finished_at: new Date(1_001_000 + index * 10_000).toISOString(), rolled_back_at: null, applied_steps_count: fingerprint?.successfulAppliedSteps ?? 1 };
});
const auditedRecords = (completedNames = EXPECTED_COMPLETED) => {
  const successful = finishedRecords(completedNames);
  const rollbacks = HISTORICAL_ROLLBACK_FINGERPRINTS.map((fingerprint) => {
    const success = successful.find((record) => record.migration_name === fingerprint.migrationName);
    const started = new Date(new Date(success.started_at).getTime() - 2_000).toISOString();
    return { migration_name: fingerprint.migrationName, checksum: fingerprint.rolledBackChecksum, started_at: started, finished_at: null, rolled_back_at: new Date(new Date(success.started_at).getTime() - 1_000).toISOString(), applied_steps_count: fingerprint.rolledBackAppliedSteps };
  });
  return [...successful, ...rollbacks];
};
async function fixture(overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), "t60r2c-approval-")); await chmod(directory, 0o700);
  const path = join(directory, "approval.json");
  const databaseUrl = "postgresql://synthetic:do-not-log@production.invalid/pawnloop_production";
  await writeFile(path, JSON.stringify({ confirmation: REQUIRED_CONFIRMATION, databaseUrl, targetSha256: targetFingerprint(databaseUrl), ...REQUIRED_TIMEOUTS, historicalRollbackFingerprints: HISTORICAL_ROLLBACK_FINGERPRINTS, ...overrides }), { mode: 0o600 });
  return { directory, path, databaseUrl };
}

test("missing and incorrect confirmation fail closed", async () => {
  await assert.rejects(readApprovalFile("/definitely/missing"), /missing/);
  const { path } = await fixture({ confirmation: "almost" }); await assert.rejects(readApprovalFile(path), /confirmation/);
});
test("insecure approval file and directory are rejected", async () => {
  const one = await fixture(); await chmod(one.path, 0o644); await assert.rejects(readApprovalFile(one.path), /mode 600/);
  const two = await fixture(); await chmod(two.directory, 0o755); await assert.rejects(readApprovalFile(two.path), /directory/);
});
test("approval symlinks are rejected", async () => {
  const { directory, path } = await fixture(); const link = join(directory, "link"); await symlink(path, link); await assert.rejects(readApprovalFile(link), /symlink/);
});
test("approval requires the exact historical fingerprint set", async () => {
  const missing = await fixture({ historicalRollbackFingerprints: [] }); await assert.rejects(readApprovalFile(missing.path), /fingerprint set/);
  const altered = structuredClone(HISTORICAL_ROLLBACK_FINGERPRINTS); altered[1].rolledBackChecksum = "e".repeat(64);
  const changed = await fixture({ historicalRollbackFingerprints: altered }); await assert.rejects(readApprovalFile(changed.path), /fingerprint set/);
});
test("target mismatch is rejected without metadata disclosure", async () => {
  const { path, databaseUrl } = await fixture({ targetSha256: "a".repeat(64) });
  let message = ""; try { await readApprovalFile(path); } catch (error) { message = error.message; }
  assert.match(message, /target mismatch/); assert.doesNotMatch(message, /synthetic|do-not-log|production\.invalid|pawnloop_production|postgresql/); assert.notEqual(message, databaseUrl);
});
test("exact starting migration state is required", () => {
  assert.equal(validateStartingState(auditedRecords(), historicalState), true);
  assert.throws(() => validateStartingState(auditedRecords(EXPECTED_COMPLETED.slice(1)), historicalState), /pair|starting state/);
});
test("exact provenance-approved rollback fingerprints are accepted", () => {
  assert.equal(validateHistoricalMigrationState(auditedRecords(), historicalState), true);
});
test("missing expected and additional rollback records are rejected", () => {
  assert.throws(() => validateHistoricalMigrationState(auditedRecords().slice(0, -1), historicalState), /count/);
  const extra = { ...auditedRecords().at(-1), migration_name: EXPECTED_COMPLETED[0] };
  assert.throws(() => validateHistoricalMigrationState([...auditedRecords(), extra], historicalState), /count/);
});
test("unknown migration and unresolved records are rejected", () => {
  assert.throws(() => validateHistoricalMigrationState([...auditedRecords(), { migration_name: "unknown", started_at: "x" }], historicalState), /unknown/);
  const unresolved = { migration_name: EXPECTED_COMPLETED[0], checksum: "x", started_at: new Date().toISOString(), finished_at: null, rolled_back_at: null, applied_steps_count: 0 };
  assert.throws(() => validateHistoricalMigrationState([...auditedRecords(), unresolved], historicalState), /unresolved/);
});
test("altered historical and successful checksums are rejected", () => {
  const alteredRollback = auditedRecords().map((x) => x.rolled_back_at && x.migration_name === HISTORICAL_ROLLBACK_FINGERPRINTS[1].migrationName ? { ...x, checksum: "a".repeat(64) } : x);
  assert.throws(() => validateHistoricalMigrationState(alteredRollback, historicalState), /rollback fingerprint|additional/);
  const alteredSuccess = auditedRecords().map((x) => x.finished_at && x.migration_name === HISTORICAL_ROLLBACK_FINGERPRINTS[1].migrationName ? { ...x, checksum: "b".repeat(64) } : x);
  assert.throws(() => validateHistoricalMigrationState(alteredSuccess, historicalState), /successful migration checksum|successful migration fingerprint/);
});
test("ordering reversal and a third checksum variant are rejected", () => {
  const reversed = auditedRecords().map((x) => x.rolled_back_at && x.migration_name === HISTORICAL_ROLLBACK_FINGERPRINTS[1].migrationName ? { ...x, started_at: "2099-01-01T00:00:00.000Z", rolled_back_at: "2099-01-02T00:00:00.000Z" } : x);
  assert.throws(() => validateHistoricalMigrationState(reversed, historicalState), /precede/);
  const source = auditedRecords().find((x) => x.finished_at && x.migration_name === HISTORICAL_ROLLBACK_FINGERPRINTS[1].migrationName);
  assert.throws(() => validateHistoricalMigrationState([...auditedRecords(), { ...source, checksum: "c".repeat(64), started_at: "2099-01-03T00:00:00.000Z", finished_at: "2099-01-04T00:00:00.000Z" }], historicalState), /successful migration checksum|record pair|variant/);
});
test("current repository checksum mismatch is rejected", () => {
  assert.throws(() => validateHistoricalMigrationState(auditedRecords(), { ...historicalState, repositoryChecksums: { ...repositoryChecksums, [HISTORICAL_ROLLBACK_FINGERPRINTS[1].migrationName]: "d".repeat(64) } }), /current immutable repository/);
});
test("exact pending chain includes only the additive validation migration", () => {
  assert.equal(validatePending([...EXPECTED_COMPLETED, ...EXPECTED_PENDING, VALIDATION_MIGRATION], EXPECTED_COMPLETED).length, 23);
  assert.throws(() => validatePending([...EXPECTED_COMPLETED, ...EXPECTED_PENDING], EXPECTED_COMPLETED), /pending chain/);
});
test("collisions and thresholds reject any positive or excessive result", () => {
  assert.throws(() => validateChecks([{ name: "collision", value: 1, maximum: 0 }]), /collision/);
  assert.throws(() => validateChecks([{ name: "table rows", value: 101, maximum: 100 }]), /threshold/);
});
test("timeout enforcement requires the exact propagated settings", () => {
  assert.equal(validateTimeouts({ lock_timeout_ms: 5000, statement_timeout_ms: 300000 }), true);
  assert.throws(() => validateTimeouts({ lock_timeout_ms: 0, statement_timeout_ms: 300000 }), /timeouts/);
});
test("rollback evidence permissions can be restricted to directory 700 and file 600", async () => {
  const directory = await mkdtemp(join(tmpdir(), "t60r2c-evidence-")); await chmod(directory, 0o700); const path = join(directory, "evidence.json");
  await writeFile(path, "[]\n", { mode: 0o600 }); assert.equal((await lstat(directory)).mode & 0o777, 0o700); assert.equal((await lstat(path)).mode & 0o777, 0o600);
});
test("postcondition failures are detected", () => {
  const records = auditedRecords([...EXPECTED_COMPLETED, ...EXPECTED_PENDING, VALIDATION_MIGRATION]);
  assert.throws(() => validatePostconditions({ records, checks: [], affectedBefore: { availability: 2 }, affectedAfter: { availability: 1 }, historicalState }), /accounting/);
});
test("destination constraint migration validates the existing named constraint", async () => {
  const sql = await readFile(resolve("apps/api/backend/prisma/migrations", VALIDATION_MIGRATION, "migration.sql"), "utf8");
  assert.match(sql, /VALIDATE CONSTRAINT "MarketplaceListing_destination_type_check"/); assert.doesNotMatch(sql, /ADD CONSTRAINT/);
});
