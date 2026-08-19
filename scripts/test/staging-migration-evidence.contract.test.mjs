import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { verifyStagingMigrationEvidence } from "../verify-staging-migration-evidence.mjs";
import { verifyStagingRunProvenance } from "../verify-staging-run-provenance.mjs";

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

const sha = "a".repeat(40);
const provenanceExpected = { repository: "alex3217/pawnshop-app", releaseSha: sha, runId: "123" };
const workflow = { id: 987, path: ".github/workflows/staging-database.yml" };
const run = { repository: { full_name: provenanceExpected.repository }, workflow_id: 987, path: workflow.path, event: "workflow_dispatch", head_branch: "main", head_sha: sha, status: "completed", conclusion: "success" };
const artifact = { id: 456, name: `staging-migration-receipt-123-${sha}`, expired: false, digest: `sha256:${"b".repeat(64)}` };
const validProvenance = () => ({ workflow: { ...workflow }, run: structuredClone(run), artifacts: { artifacts: [{ ...artifact }] } });

test("GitHub-authenticated run and artifact provenance is accepted", () => {
  assert.deepEqual(verifyStagingRunProvenance(validProvenance(), provenanceExpected), { id: 456, digest: artifact.digest, name: artifact.name });
});

for (const [name, mutate] of [
  ["wrong repository", (value) => { value.run.repository.full_name = "attacker/fork"; }],
  ["wrong workflow", (value) => { value.run.workflow_id = 111; }],
  ["wrong workflow path", (value) => { value.workflow.path = ".github/workflows/untrusted.yml"; }],
  ["wrong event", (value) => { value.run.event = "pull_request"; }],
  ["wrong ref", (value) => { value.run.head_branch = "feature"; }],
  ["wrong SHA", (value) => { value.run.head_sha = "c".repeat(40); }],
  ["incomplete", (value) => { value.run.status = "in_progress"; }],
  ["failed", (value) => { value.run.conclusion = "failure"; }],
  ["cancelled", (value) => { value.run.conclusion = "cancelled"; }],
  ["missing artifact", (value) => { value.artifacts.artifacts = []; }],
  ["duplicate artifact", (value) => { value.artifacts.artifacts.push({ ...artifact, id: 457 }); }],
  ["stale artifact", (value) => { value.artifacts.artifacts[0].expired = true; }],
  ["wrong artifact run", (value) => { value.artifacts.artifacts[0].name = `staging-migration-receipt-999-${sha}`; }],
  ["wrong artifact SHA", (value) => { value.artifacts.artifacts[0].name = `staging-migration-receipt-123-${"c".repeat(40)}`; }],
  ["missing digest", (value) => { delete value.artifacts.artifacts[0].digest; }],
]) test(`${name} provenance cannot authorize staging`, () => {
  const value = validProvenance();
  mutate(value);
  assert.throws(() => verifyStagingRunProvenance(value, provenanceExpected));
});

test("workflow downloads the exact archive and verifies its GitHub digest before extraction", () => {
  const source = fs.readFileSync(new URL("../../.github/workflows/staging-release-receipt.yml", import.meta.url), "utf8");
  assert.match(source, /actions\/runs\/\$MIGRATION_RUN_ID/);
  assert.match(source, /actions\/artifacts\/\$artifact_id\/zip/);
  assert.match(source, /test "\$artifact_digest" = "sha256:\$\(sha256sum/);
  assert.ok(source.indexOf("sha256sum") < source.indexOf("unzip -q"));
});
