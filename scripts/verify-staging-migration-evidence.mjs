import fs from "node:fs";

function fail(message) {
  throw new Error(`Staging migration evidence rejected: ${message}`);
}

export function verifyStagingMigrationEvidence(evidence, expected) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) fail("missing or malformed receipt");
  if (!/^[0-9a-f]{40}$/.test(expected.releaseSha || "")) fail("invalid expected release SHA");
  if (!/^[0-9a-f]{64}$/.test(expected.registryDigest || "")) fail("invalid expected migration registry digest");
  if (String(evidence.releaseSha) !== expected.releaseSha) fail("release SHA mismatch");
  if (String(evidence.registryDigest) !== expected.registryDigest) fail("migration registry mismatch");
  if (String(evidence.repository) !== expected.repository) fail("repository mismatch");
  if (String(evidence.workflowRunId) !== String(expected.workflowRunId)) fail("workflow run mismatch");
  if (evidence.migrateDeploy !== "success") fail("migrate deploy did not succeed");
  if (evidence.postMigrationStatus !== "clean") fail("post-migration status is not clean");
  return true;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) fail("receipt file is missing");
  const evidence = JSON.parse(fs.readFileSync(file, "utf8"));
  verifyStagingMigrationEvidence(evidence, {
    releaseSha: process.env.EXPECTED_RELEASE_SHA,
    registryDigest: process.env.EXPECTED_REGISTRY_DIGEST,
    repository: process.env.GITHUB_REPOSITORY,
    workflowRunId: process.env.EXPECTED_MIGRATION_RUN_ID,
  });
  console.log("Exact-SHA staging migration evidence verified.");
}
