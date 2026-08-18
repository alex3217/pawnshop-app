import fs from "node:fs";

function reject(message) {
  throw new Error(`Staging migration provenance rejected: ${message}`);
}

export function verifyStagingRunProvenance({ workflow, run, artifacts }, expected) {
  if (!workflow || workflow.path !== ".github/workflows/staging-database.yml" || !Number.isInteger(workflow.id)) reject("untrusted workflow");
  if (!run || run.repository?.full_name !== expected.repository) reject("repository mismatch");
  if (run.workflow_id !== workflow.id || run.path !== workflow.path) reject("workflow mismatch");
  if (run.event !== "workflow_dispatch") reject("event mismatch");
  if (run.head_branch !== "main") reject("branch mismatch");
  if (run.head_sha !== expected.releaseSha) reject("release SHA mismatch");
  if (run.status !== "completed" || run.conclusion !== "success") reject("run did not succeed");
  const name = `staging-migration-receipt-${expected.runId}-${expected.releaseSha}`;
  const matches = Array.isArray(artifacts?.artifacts)
    ? artifacts.artifacts.filter((artifact) => artifact.name === name && artifact.expired === false)
    : [];
  if (matches.length !== 1) reject("missing or duplicate exact artifact");
  const artifact = matches[0];
  if (!Number.isInteger(artifact.id) || !/^sha256:[0-9a-f]{64}$/.test(artifact.digest || "")) reject("invalid artifact metadata");
  return { id: artifact.id, digest: artifact.digest, name };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [workflowPath, runPath, artifactsPath, outputPath] = process.argv.slice(2);
  if (![workflowPath, runPath, artifactsPath, outputPath].every(Boolean)) reject("required metadata path is missing");
  const result = verifyStagingRunProvenance({
    workflow: JSON.parse(fs.readFileSync(workflowPath, "utf8")),
    run: JSON.parse(fs.readFileSync(runPath, "utf8")),
    artifacts: JSON.parse(fs.readFileSync(artifactsPath, "utf8")),
  }, {
    repository: process.env.GITHUB_REPOSITORY,
    releaseSha: process.env.EXPECTED_RELEASE_SHA,
    runId: String(process.env.EXPECTED_MIGRATION_RUN_ID || ""),
  });
  fs.writeFileSync(outputPath, JSON.stringify(result), { mode: 0o600 });
}
