import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { classifyMigrationState } from "../production-migration-postcondition.mjs";

const workflowPath = ".github/workflows/production-database.yml";
test("migration workflow is manual, serialized, pinned, and contains twice", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  assert.match(workflow, /^on:\n  workflow_dispatch:/m); assert.doesNotMatch(workflow, /^\s+(push|pull_request|schedule):/m); assert.match(workflow, /cancel-in-progress: false/); assert.match(workflow, /environment: production/);
  for (const use of workflow.matchAll(/^\s*uses:\s*([^\s#]+)/gm)) assert.match(use[1], /^[^@]+@[0-9a-f]{40}$/);
  const gates = [...workflow.matchAll(/node scripts\/verify-production-containment\.mjs/g)].map((match) => match.index); const install = workflow.indexOf("npm --prefix apps/api/backend ci"); const deploy = workflow.indexOf("prisma migrate deploy");
  assert.equal(gates.length, 2); assert.ok(gates[0] < install && gates[1] < deploy); assert.equal(workflow.indexOf("\n      - name:", gates[1]), workflow.lastIndexOf("\n      - name: Apply certified production migrations", deploy));
  const jobEnv = workflow.slice(workflow.indexOf("    env:"), workflow.indexOf("    steps:")); assert.doesNotMatch(jobEnv, /DATABASE_URL|DIRECT_URL|secrets\./); assert.match(workflow, /npm --prefix apps\/api\/backend ci --ignore-scripts/);
});
test("migration outcome and postcondition fail closed for failure, cancellation, and unknown state", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const classifier = await readFile("scripts/production-migration-postcondition.mjs", "utf8");
  assert.match(workflow, /id: migration/); assert.match(workflow, /id: postcondition/); assert.match(workflow, /if: \$\{\{ always\(\) \}\}/); assert.match(workflow, /steps\.migration\.outcome/); assert.match(workflow, /MIGRATION_STARTED/); assert.match(workflow, /MIGRATION_FINISHED/); assert.match(classifier, /migration_never_started/); assert.match(classifier, /migration_succeeded_clean/); assert.match(classifier, /migration_command_failed/); assert.match(classifier, /migration_state_unknown/); assert.match(workflow, /manual reconciliation/i); assert.match(workflow, /GITHUB_STEP_SUMMARY/); assert.doesNotMatch(workflow, /cancel-in-progress:\s*true/);
});
test("migration classifier distinguishes never-started, success, command failure, cancellation, and partial/unknown state", () => {
  assert.equal(classifyMigrationState({ started: false }), "migration_never_started");
  assert.equal(classifyMigrationState({ started: true, finishedExit: 0, outcome: "success", statusClean: true }), "migration_succeeded_clean");
  assert.equal(classifyMigrationState({ started: true, finishedExit: 2, outcome: "failure", statusClean: false }), "migration_command_failed");
  for (const state of [{ started: true, finishedExit: null, outcome: "cancelled" }, { started: true, finishedExit: 0, outcome: "success", statusClean: false }, { started: true, finishedExit: 2, outcome: "cancelled" }]) assert.equal(classifyMigrationState(state), "migration_state_unknown");
});
test("duplicate dispatch remains serialized and cannot cancel the in-progress migration", async () => { const workflow = await readFile(workflowPath, "utf8"); assert.match(workflow, /group: pawnloop-production-database\n  cancel-in-progress: false/); });
test("runbook states repository controls and every remaining external blocker", async () => {
  const text = await readFile("docs/production-release-control-v1.md", "utf8");
  for (const phrase of ["production environment does not exist", "reviewer gate", "Seller Subscription Browser Tests", "independent approval", "/api/ready", "Cloudflare automatic-production", "immutable Git blob", "SHA-256", "hard runner loss", "manual reconciliation", "retention", "RENDER_API_KEY", "CLOUDFLARE_API_TOKEN", "GITHUB_TOKEN"]) assert.match(text, new RegExp(phrase, "i"), phrase);
});
