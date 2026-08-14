import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = ".github/workflows/production-database.yml";
const runbookPath = "docs/production-release-control-v1.md";

test("production migration workflow retains mandatory safety gates", async () => {
  const workflow = await readFile(migrationPath, "utf8");

  assert.match(workflow, /^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^\s+(push|pull_request|schedule):/m);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(workflow, /git merge-base --is-ancestor "\$RELEASE_SHA" origin\/main/);
  assert.match(workflow, /CONFIRMED_DATABASE_HOST.*APPROVED_PRODUCTION_DATABASE_HOST/);
  assert.match(workflow, /BACKUP_EVIDENCE_VERIFIED/);

  const validateIndex = workflow.indexOf("prisma validate");
  const preStatusIndex = workflow.indexOf("Record pre-migration status");
  const guardIndex = workflow.indexOf("Re-verify all mutation guards");
  const deployIndex = workflow.indexOf("prisma migrate deploy");
  const postStatusIndex = workflow.indexOf("Verify post-migration status");
  const readyIndex = workflow.indexOf("/api/ready");
  assert.ok(validateIndex > -1 && validateIndex < deployIndex);
  assert.ok(preStatusIndex > validateIndex && preStatusIndex < deployIndex);
  assert.ok(guardIndex > preStatusIndex && guardIndex < deployIndex);
  assert.ok(postStatusIndex > deployIndex);
  assert.ok(readyIndex > deployIndex);
  assert.doesNotMatch(workflow, /echo[^\n]*(DATABASE_URL|DIRECT_URL)/);
});

test("release runbook names checks, immutable parity, approvals, and provider controls", async () => {
  const runbook = await readFile(runbookPath, "utf8");
  for (const check of [
    "Web and API Validation",
    "Mobile TypeScript Validation",
    "Backend Automated Tests",
    "Seller Subscription Browser Tests",
  ]) assert.match(runbook, new RegExp(check));

  assert.match(runbook, /main.*development integration/i);
  assert.match(runbook, /staging.*release-candidate/i);
  assert.match(runbook, /API and frontend.*same certified SHA/i);
  assert.match(runbook, /last-known-good SHA/i);
  assert.match(runbook, /\/api\/ready.*production health gate/i);
  assert.match(runbook, /Disable automatic production API deploys from `main`/);
  assert.match(runbook, /Disable automatic Production deployment for every `main` commit/);
});
