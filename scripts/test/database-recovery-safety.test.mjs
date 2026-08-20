import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { assertSchemaCompatibility, buildManifest, isLoopback, readProductionBackupApproval, sha256File, validateBackup, validateBackupTarget, validateDatabaseTarget } from "../lib/database-recovery-safety.mjs";

const productionUrl = "postgresql://synthetic_user:synthetic_password@prod-db.invalid/pawnloop_production?sslmode=require";
const target = (overrides = {}) => ({ databaseUrl: productionUrl, environment: "production", approvedHostname: "prod-db.invalid", expectedDatabase: "pawnloop_production", ...overrides });
const neutralBackupTarget = (overrides = {}) => ({
  databaseUrl: "postgresql://synthetic_user:synthetic_password@primary-db.invalid/providerdb?sslmode=require",
  environment: "production",
  approvedHostname: "primary-db.invalid",
  expectedDatabase: "providerdb",
  productionHostname: "primary-db.invalid",
  confirmation: "BACKUP PRODUCTION",
  ...overrides,
});
const developmentTarget = (host = "localhost", databaseName = "pawnshop", overrides = {}) => ({
  databaseUrl: `postgresql://synthetic_dev_user:synthetic_dev_password@${host}/${databaseName}`,
  environment: "development",
  approvedHostname: host,
  expectedDatabase: databaseName,
  ...overrides,
});

test("valid synthetic production backup configuration", () => {
  const result = validateDatabaseTarget(target());
  assert.deepEqual([result.environment, result.hostname, result.databaseName], ["production", "prod-db.invalid", "pawnloop_production"]);
  assert.doesNotMatch(JSON.stringify(result), /synthetic_password/);
});

test("Production backup accepts a provider-neutral database only with every exact approval", () => {
  const result = validateBackupTarget(neutralBackupTarget());
  assert.deepEqual([result.environment, result.hostname, result.databaseName], ["production", "primary-db.invalid", "providerdb"]);
});

test("Production approval file requires current operator ownership", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pawnloop-approval-owner-"));
  await chmod(directory, 0o700);
  const approval = join(directory, "approval.json");
  await writeFile(approval, JSON.stringify({ hostname: "ownership-canary.invalid", databaseName: "ownership_canary" }), { mode: 0o600 });
  const uid = process.getuid?.();
  if (uid === undefined) return;
  await assert.rejects(readProductionBackupApproval(approval, { expectedUid: uid + 1 }), /owned by the current operator/i);
});

test("Production backup rejects missing or incorrect explicit confirmation", () => {
  for (const confirmation of [undefined, "", "BACKUP production", "BACKUP PRODUCTION ", "RESTORE PRODUCTION"]) {
    assert.throws(() => validateBackupTarget(neutralBackupTarget({ confirmation })), /confirmation/i);
  }
});

test("Production backup requires exact selected host, database, and Production host confirmation", () => {
  assert.throws(() => validateBackupTarget(neutralBackupTarget({ approvedHostname: "other.invalid" })), /approved hostname/i);
  assert.throws(() => validateBackupTarget(neutralBackupTarget({ expectedDatabase: "otherdb" })), /explicitly selected/i);
  assert.throws(() => validateBackupTarget(neutralBackupTarget({ productionHostname: undefined })), /host confirmation is required/i);
  assert.throws(() => validateBackupTarget(neutralBackupTarget({ productionHostname: "other.invalid" })), /host confirmation does not match/i);
});

test("Production backup rejects loopback, non-PostgreSQL, and non-Production markers", () => {
  assert.throws(() => validateBackupTarget(neutralBackupTarget({
    databaseUrl: "postgresql://user:secret@localhost/providerdb", approvedHostname: "localhost", productionHostname: "localhost",
  })), /localhost|loopback/i);
  assert.throws(() => validateBackupTarget(neutralBackupTarget({ databaseUrl: "mysql://user:secret@primary-db.invalid/providerdb" })), /PostgreSQL/);
  for (const value of ["local", "localhost", "dev", "development", "test", "testing", "stage", "staging"]) {
    const host = `primary-${value}.invalid`;
    assert.throws(() => validateBackupTarget(neutralBackupTarget({
      databaseUrl: `postgresql://user:secret@${host}/providerdb`, approvedHostname: host, productionHostname: host,
    })), /environment marker/i);
    const database = `provider_${value}`;
    assert.throws(() => validateBackupTarget(neutralBackupTarget({
      databaseUrl: `postgresql://user:secret@primary-db.invalid/${database}`, expectedDatabase: database,
    })), /environment marker/i);
  }
});

test("neutral-name backup allowance does not weaken Production or isolated restore targets", () => {
  assert.throws(() => validateDatabaseTarget(neutralBackupTarget()), /unambiguously/i);
  assert.throws(() => validateDatabaseTarget({
    databaseUrl: "postgresql://user:secret@remote.invalid/pawnloop_restore_drill",
    environment: "isolated", approvedHostname: "remote.invalid", expectedDatabase: "pawnloop_restore_drill", destination: true,
  }), /loopback/i);
  assert.throws(() => validateDatabaseTarget({
    databaseUrl: "postgresql://user:secret@localhost/providerdb",
    environment: "isolated", approvedHostname: "localhost", expectedDatabase: "providerdb", destination: true,
  }), /unambiguously/i);
});

test("Production backup target failures never expose connection values", () => {
  const rawUrl = "postgresql://private_user:private_password@primary-db.invalid/providerdb";
  let output = "";
  try { validateBackupTarget(neutralBackupTarget({ databaseUrl: rawUrl, confirmation: "wrong" })); } catch (error) { output = error.message; }
  assert.doesNotMatch(output, /private_user|private_password|postgresql:\/\/|primary-db\.invalid|providerdb/);
});

test("malformed and non-PostgreSQL URLs fail closed", () => {
  assert.throws(() => validateDatabaseTarget(target({ databaseUrl: "not-a-url" })), /malformed/);
  assert.throws(() => validateDatabaseTarget(target({ databaseUrl: "mysql://user:secret@prod-db.invalid/pawnloop_production" })), /PostgreSQL/);
  assert.throws(() => validateDatabaseTarget(target({ databaseUrl: "postgresql:///pawnloop_production" })), /hostname/);
});

test("localhost and loopback misuse is rejected", () => {
  for (const host of ["localhost", "127.0.0.1", "127.0.0.2"]) {
    assert.throws(() => validateDatabaseTarget(target({ databaseUrl: `postgresql://user:secret@${host}/pawnloop_production`, approvedHostname: host })), /localhost|loopback/);
  }
});

test("loopback classification requires actual IPv4 literals", () => {
  for (const host of ["127.0.0.1", "127.0.0.2", "127.42.19.8", "127.255.255.255"]) {
    assert.equal(isLoopback(host), true, `${host} should be loopback`);
  }
  for (const host of ["127.attacker.example", "127.example.com", "127.localhost.example", "127.0.0.1.example"]) {
    assert.equal(isLoopback(host), false, `${host} must remain a DNS hostname`);
  }
});

test("127-prefixed DNS targets are rejected by loopback-only environments", () => {
  const host = "127.attacker.example";
  assert.throws(() => validateDatabaseTarget(developmentTarget(host)), /unambiguously|loopback/);
  assert.throws(() => validateDatabaseTarget({
    databaseUrl: `postgresql://test_user:test_password@${host}/pawnloop_test`,
    environment: "test", approvedHostname: host, expectedDatabase: "pawnloop_test",
  }), /loopback/);
  assert.throws(() => validateDatabaseTarget({
    databaseUrl: `postgresql://isolated_user:isolated_password@${host}/pawnloop_restore_drill`,
    environment: "isolated", approvedHostname: host, expectedDatabase: "pawnloop_restore_drill", destination: true,
  }), /loopback/);
});

test("IPv4-mapped IPv6 loopback is classified from its canonical literal", () => {
  for (const address of ["::ffff:127.0.0.1", "::ffff:127.42.19.8"]) {
    assert.equal(isLoopback(address), true);
    const approvedHostname = `[${address}]`;
    const development = validateDatabaseTarget(developmentTarget("localhost", "pawnshop", {
      databaseUrl: `postgresql://mapped_user:mapped_password@[${address}]/pawnshop`,
      approvedHostname,
    }));
    assert.equal(development.environment, "development");
    assert.throws(() => validateDatabaseTarget({
      databaseUrl: `postgresql://mapped_user:mapped_password@[${address}]/pawnloop_production`,
      environment: "production", approvedHostname, expectedDatabase: "pawnloop_production",
    }), /localhost|loopback/);
  }
});

test("loopback bypass errors do not expose target credentials", () => {
  const rawUrl = "postgresql://prefix_secret_user:prefix_secret_password@127.attacker.example/pawnloop_test";
  let message = "";
  try {
    validateDatabaseTarget({ databaseUrl: rawUrl, environment: "test", approvedHostname: "127.attacker.example", expectedDatabase: "pawnloop_test" });
  } catch (error) { message = error.message; }
  assert.doesNotMatch(message, /prefix_secret_user|prefix_secret_password|postgresql:\/\/|token/i);
  assert.notEqual(message, rawUrl);
});

test("environment target mixups and ambiguous names are rejected", () => {
  for (const name of ["pawnloop_staging", "pawnloop_test", "pawnloop_development", "pawnloop", "pawnloop_prod_test"]) {
    assert.throws(() => validateDatabaseTarget(target({ databaseUrl: `postgresql://user:secret@prod-db.invalid/${name}`, expectedDatabase: name })), /unambiguously/);
  }
  assert.throws(() => validateDatabaseTarget(target({ environment: "staging" })), /unambiguously/);
});

test("wrong approved hostname and unsafe database name are rejected", () => {
  assert.throws(() => validateDatabaseTarget(target({ approvedHostname: "other.invalid" })), /approved hostname/);
  assert.throws(() => validateDatabaseTarget(target({ databaseUrl: "postgresql://user:secret@prod-db.invalid/bad%2Fname", expectedDatabase: "bad/name" })), /unsafe/);
});

test("established pawnshop development database is allowed only on approved loopback targets", () => {
  for (const host of ["localhost", "127.0.0.1", "127.42.19.8"]) {
    const result = validateDatabaseTarget(developmentTarget(host));
    assert.deepEqual([result.environment, result.hostname, result.databaseName], ["development", host, "pawnshop"]);
  }
});

test("IPv6 loopback approved-host forms normalize to the parsed DATABASE_URL hostname", () => {
  for (const approvedHostname of ["::1", "[::1]"]) {
    const result = validateDatabaseTarget(developmentTarget("localhost", "pawnshop", {
      databaseUrl: "postgresql://ipv6_user:ipv6_password@[::1]/pawnshop",
      approvedHostname,
    }));
    assert.deepEqual([result.environment, result.hostname, result.databaseName], ["development", "::1", "pawnshop"]);
  }
});

test("isolated target validation accepts normalized IPv6 loopback", () => {
  const result = validateDatabaseTarget({
    databaseUrl: "postgresql://isolated_user:isolated_password@[::1]/pawnloop_restore_drill",
    environment: "isolated",
    approvedHostname: "::1",
    expectedDatabase: "pawnloop_restore_drill",
    destination: true,
  });
  assert.deepEqual([result.environment, result.hostname], ["isolated", "::1"]);
});

test("production and staging reject bracketed and unbracketed IPv6 loopback approvals", () => {
  for (const environment of ["production", "staging"]) {
    const databaseName = `pawnloop_${environment}`;
    for (const approvedHostname of ["::1", "[::1]"]) {
      assert.throws(() => validateDatabaseTarget({
        databaseUrl: `postgresql://deployed_user:deployed_password@[::1]/${databaseName}`,
        environment,
        approvedHostname,
        expectedDatabase: databaseName,
      }), /localhost|loopback/);
    }
  }
});

test("approved hostname rejects malformed IPv6, ports, and non-host components", () => {
  for (const approvedHostname of [
    "[::1", "::1]", "[::gg]", "localhost:5432", "[::1]:5432",
    "user@localhost", "user:password@localhost", "localhost/path",
    "localhost?query=1", "localhost#fragment",
  ]) {
    assert.throws(() => validateDatabaseTarget(developmentTarget("localhost", "pawnshop", { approvedHostname })), /hostname|Hostname/);
  }
});

test("DNS, public IPv4, localhost, and IPv4 loopback behavior is preserved", () => {
  for (const host of ["prod-db.invalid", "203.0.113.10"]) {
    const result = validateDatabaseTarget(target({
      databaseUrl: `postgresql://public_user:public_password@${host}/pawnloop_production`,
      approvedHostname: host,
    }));
    assert.equal(result.hostname, host);
  }
  for (const host of ["localhost", "127.0.0.1", "127.99.8.7"]) {
    assert.equal(validateDatabaseTarget(developmentTarget(host)).hostname, host);
  }
});

test("IPv6 hostname validation errors redact connection secrets", () => {
  const rawUrl = "postgresql://ipv6_secret_user:ipv6_secret_password@[::1]/pawnshop";
  let message = "";
  try { validateDatabaseTarget(developmentTarget("localhost", "pawnshop", { databaseUrl: rawUrl, approvedHostname: "[::2]" })); } catch (error) { message = error.message; }
  assert.doesNotMatch(message, /ipv6_secret_user|ipv6_secret_password|postgresql:\/\//);
  assert.notEqual(message, rawUrl);
});

test("pawnshop compatibility name remains rejected outside development", () => {
  const cases = [
    { environment: "production", host: "prod-db.invalid", destination: false },
    { environment: "staging", host: "staging-db.invalid", destination: false },
    { environment: "test", host: "localhost", destination: false },
    { environment: "isolated", host: "localhost", destination: true },
  ];
  for (const { environment, host, destination } of cases) {
    assert.throws(() => validateDatabaseTarget(developmentTarget(host, "pawnshop", { environment, destination })), /unambiguously/);
  }
});

test("development compatibility does not allow arbitrary or cross-environment names", () => {
  for (const name of ["arbitrary", "pawnshop_test", "pawnshop_staging", "pawnshop_prod_test"]) {
    assert.throws(() => validateDatabaseTarget(developmentTarget("localhost", name)), /unambiguously/);
  }
  const marked = validateDatabaseTarget(developmentTarget("localhost", "pawnloop_development"));
  assert.equal(marked.databaseName, "pawnloop_development");
});

test("pawnshop development compatibility still requires exact selection and loopback", () => {
  assert.throws(() => validateDatabaseTarget(developmentTarget("localhost", "pawnshop", { expectedDatabase: "other" })), /explicitly selected/);
  assert.throws(() => validateDatabaseTarget(developmentTarget("dev-db.invalid")), /unambiguously|loopback/);
});

test("development compatibility errors do not expose connection secrets", () => {
  const rawUrl = "postgresql://p1_review_user:p1_review_password@remote.invalid/pawnshop";
  let message = "";
  try { validateDatabaseTarget(developmentTarget("remote.invalid", "pawnshop", { databaseUrl: rawUrl })); } catch (error) { message = error.message; }
  assert.doesNotMatch(message, /p1_review_user|p1_review_password|postgresql:\/\//);
  assert.notEqual(message, rawUrl);
});

async function fixture({ ageHours = 0, content = "synthetic-custom-archive", sourceSchema = "" } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "pawnloop-recovery-test-"));
  const backup = join(directory, "synthetic.dump");
  const manifestFile = `${backup}.manifest.json`;
  await writeFile(backup, content, { mode: 0o600 });
  const createdAt = new Date(Date.now() - ageHours * 60 * 60 * 1000).toISOString();
  const manifest = await buildManifest({ backupFile: backup, environment: "production", hostname: "prod-db.invalid", databaseName: "pawnloop_production", sourceSchema, applicationRevision: "synthetic-revision", createdAt, toolVersion: "pg_dump synthetic", archiveMetadata: "synthetic pg_restore list passed" });
  await writeFile(manifestFile, JSON.stringify(manifest), { mode: 0o600 });
  return { backup, manifestFile, manifest };
}

test("manifest records exact schema-scoped and full-database source scopes", async () => {
  assert.equal((await fixture({ sourceSchema: "public" })).manifest.sourceSchema, "public");
  assert.equal((await fixture({ sourceSchema: "" })).manifest.sourceSchema, "");
});

test("validated backup preserves source schema scope", async () => {
  const item = await fixture({ sourceSchema: "tenant_a" });
  const manifest = await validateBackup({ backupFile: item.backup, manifestFile: item.manifestFile, expectedEnvironment: "production" });
  assert.equal(manifest.sourceSchema, "tenant_a");
});

test("missing and non-string manifest source schema metadata is rejected", async () => {
  for (const sourceSchema of [undefined, 123, null, { name: "public" }]) {
    const item = await fixture({ sourceSchema: "public" });
    if (sourceSchema === undefined) delete item.manifest.sourceSchema;
    else item.manifest.sourceSchema = sourceSchema;
    await writeFile(item.manifestFile, JSON.stringify(item.manifest));
    await assert.rejects(validateBackup({ backupFile: item.backup, manifestFile: item.manifestFile, expectedEnvironment: "production" }), /malformed/);
  }
});

test("schema compatibility requires exact source and destination scope", () => {
  for (const [source, destination] of [["public", "public"], ["tenant_a", "tenant_a"], ["", ""]]) {
    assert.deepEqual(assertSchemaCompatibility(source, destination), { sourceSchema: source, destinationSchema: destination });
  }
  for (const [source, destination] of [["public", "other"], ["public", ""], ["", "public"], ["tenant_a", "tenant_b"]]) {
    assert.throws(() => assertSchemaCompatibility(source, destination), /incompatible.*remapping/i);
  }
});

test("schema compatibility errors are sanitized", () => {
  const secret = "schema-secret-password";
  let message = "";
  try { assertSchemaCompatibility("public", "other"); } catch (error) { message = error.message; }
  assert.doesNotMatch(message, new RegExp(`${secret}|username|postgresql://|DATABASE_URL|token|credential`, "i"));
});

test("streamed checksum matches SHA-256 for a normal synthetic backup", async () => {
  const item = await fixture();
  const expected = createHash("sha256").update("synthetic-custom-archive").digest("hex");
  assert.equal(await sha256File(item.backup), expected);
});

test("streamed checksum matches SHA-256 across multiple filesystem chunks", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pawnloop-stream-checksum-"));
  const backup = join(directory, "multi-chunk.dump");
  const content = Buffer.alloc(256 * 1024 + 137);
  for (let index = 0; index < content.length; index += 1) content[index] = index % 251;
  await writeFile(backup, content, { mode: 0o600 });
  const expected = createHash("sha256").update(content).digest("hex");
  assert.equal(await sha256File(backup), expected);
});

test("manifest records streamed digest and unchanged backup validates", async () => {
  const item = await fixture();
  const expected = createHash("sha256").update("synthetic-custom-archive").digest("hex");
  assert.equal(item.manifest.sha256, expected);
  const validated = await validateBackup({ backupFile: item.backup, manifestFile: item.manifestFile, expectedEnvironment: "production" });
  assert.equal(validated.sha256, expected);
});

test("streamed checksum rejects missing files without exposing path secrets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pawnloop-stream-checksum-"));
  const secret = "checksum-secret-user-password";
  const missing = join(directory, `${secret}.dump`);
  await assert.rejects(sha256File(missing), (error) => (
    /checksum could not be calculated/.test(error.message) &&
    !error.message.includes(secret) &&
    !error.message.includes(missing) &&
    !/postgresql:\/\//.test(error.message)
  ));
});

test("missing and malformed manifests are rejected", async () => {
  const item = await fixture();
  await assert.rejects(validateBackup({ backupFile: item.backup, manifestFile: `${item.backup}.missing`, expectedEnvironment: "production" }), /missing/);
  await writeFile(item.manifestFile, "not-json");
  await assert.rejects(validateBackup({ backupFile: item.backup, manifestFile: item.manifestFile, expectedEnvironment: "production" }), /malformed/);
});

test("missing and zero-byte backups are rejected", async () => {
  const item = await fixture();
  await assert.rejects(validateBackup({ backupFile: `${item.backup}.missing`, manifestFile: item.manifestFile, expectedEnvironment: "production" }), /missing/);
  await writeFile(item.backup, "");
  await assert.rejects(validateBackup({ backupFile: item.backup, manifestFile: item.manifestFile, expectedEnvironment: "production" }), /empty/);
});

test("stale backups and environment mismatches are rejected", async () => {
  const stale = await fixture({ ageHours: 48 });
  await assert.rejects(validateBackup({ backupFile: stale.backup, manifestFile: stale.manifestFile, expectedEnvironment: "production", maxAgeHours: 36 }), /stale/);
  const fresh = await fixture();
  await assert.rejects(validateBackup({ backupFile: fresh.backup, manifestFile: fresh.manifestFile, expectedEnvironment: "staging" }), /environment/);
});

test("checksum and manifest-to-file mismatches are rejected", async () => {
  const item = await fixture();
  await writeFile(item.backup, "Xynthetic-custom-archive");
  await assert.rejects(validateBackup({ backupFile: item.backup, manifestFile: item.manifestFile, expectedEnvironment: "production" }), /checksum mismatch/);
});

test("errors and manifests redact secrets", async () => {
  const secret = "never-print-this-password";
  let message = "";
  try { validateDatabaseTarget(target({ databaseUrl: `postgresql://secret_user:${secret}@wrong.invalid/pawnloop_production` })); } catch (error) { message = error.message; }
  assert.doesNotMatch(message, new RegExp(secret));
  assert.doesNotMatch(message, /secret_user/);
  const item = await fixture();
  assert.doesNotMatch(JSON.stringify(item.manifest), /password|DATABASE_URL|connection string|credential|token/i);
});
