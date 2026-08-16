import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { verifyProductionReleaseEvidence } from "../verify-production-release.mjs";

const workflowPath = ".github/workflows/production-database.yml";
const sha = "0123456789abcdef0123456789abcdef01234567";
const now = Date.parse("2026-08-15T20:00:00Z");
const evidence = () => ({
  expectedSha: sha,
  provenance: { collectionMethod: "independent-provider-api", collectedAt: "2026-08-15T19:55:00Z" },
  providerIdentity: { githubRepository: "alex3217/pawnshop-app", cloudflareAccountId: "0230f5ea7416d81f9f931bb02545abdb", cloudflareProject: "pawnloop-frontend", renderServiceId: "srv-production123", renderEnvironmentId: "evm-production123" },
  github: { collectedAt: "2026-08-15T19:55:00Z", workflowRunId: "31915363089", workflowRunUrl: "https://github.com/alex3217/pawnshop-app/actions/runs/31915363089", commitSha: sha },
  api: { readinessPath: "/api/ready", status: 200, ready: true, revision: sha }, frontend: { revision: sha },
  database: { collectedAt: "2026-08-15T19:55:00Z", workflowRunId: "31915363090", workflowRunUrl: "https://github.com/alex3217/pawnshop-app/actions/runs/31915363090", releaseSha: sha },
  cloudflare: { collectedAt: "2026-08-15T19:55:00Z", deploymentId: "2e3d541f-4cb8-4469-bce0-296b64ed8318", deploymentUrl: "https://dash.cloudflare.com/0230f5ea7416d81f9f931bb02545abdb/pages/view/pawnloop-frontend/2e3d541f-4cb8-4469-bce0-296b64ed8318", sourceSha: sha },
  render: { collectedAt: "2026-08-15T19:55:00Z", serviceId: "srv-production123", environmentId: "evm-production123", deploymentId: "dep-production123", deploymentUrl: "https://dashboard.render.com/web/srv-production123/deploys/dep-production123", sourceSha: sha },
  releaseRecord: { recordId: "release-2026-08-15", recordUrl: "https://github.com/alex3217/pawnshop-app/issues/314", releaseSha: sha },
});

test("workflow pins actions, contains migration twice, minimizes secrets, and hardens install", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  assert.match(workflow, /^on:\n  workflow_dispatch:/m); assert.doesNotMatch(workflow, /^\s+(push|pull_request|schedule):/m);
  for (const use of workflow.matchAll(/^\s*uses:\s*([^\s#]+)/gm)) assert.match(use[1], /^[^@]+@[0-9a-f]{40}$/);
  assert.match(workflow, /actions\/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4\.4\.0/);
  assert.match(workflow, /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4\.4\.0/);
  const jobEnv = workflow.slice(workflow.indexOf("    env:"), workflow.indexOf("    steps:"));
  assert.doesNotMatch(jobEnv, /DATABASE_URL|DIRECT_URL|secrets\./);
  assert.match(workflow, /npm --prefix apps\/api\/backend ci --ignore-scripts/);
  const containment = [...workflow.matchAll(/node scripts\/verify-production-containment\.mjs/g)].map((match) => match.index);
  const install = workflow.indexOf("npm --prefix apps/api/backend ci"); const deploy = workflow.indexOf("prisma migrate deploy");
  const secondGateStep = workflow.lastIndexOf("- name: Re-verify production containment");
  const nextStep = workflow.indexOf("\n      - name:", secondGateStep + 1);
  assert.equal(containment.length, 2); assert.ok(containment[0] < install); assert.ok(containment[1] < deploy); assert.match(workflow.slice(nextStep, deploy), /- name: Apply certified production migrations/);
  for (const name of ["Check out certified", "Set up Node.js", "Install certified", "Verify production containment"]) {
    const start = workflow.indexOf(`- name: ${name}`); const next = workflow.indexOf("\n      - name:", start + 1); assert.doesNotMatch(workflow.slice(start, next < 0 ? undefined : next), /DATABASE_URL|DIRECT_URL/);
  }
});

test("accepts fully pinned independently referenced evidence", () => {
  assert.equal(verifyProductionReleaseEvidence(evidence(), { now }).verified, true);
});

test("rejects fabricated consistency, missing provenance, wrong identity, placeholders, malformed URLs, stale timestamps, and SHA mismatches", () => {
  const mutations = [
    (v) => { delete v.provenance; }, (v) => { v.provenance.collectionMethod = "operator-authored"; },
    (v) => { v.providerIdentity.githubRepository = "attacker/repo"; }, (v) => { v.render.serviceId = "placeholder"; },
    (v) => { v.github.workflowRunUrl = "https://example.com/run/31915363089"; },
    (v) => { v.cloudflare.deploymentUrl = "not-a-url"; }, (v) => { v.provenance.collectedAt = "2026-08-01T00:00:00Z"; }, (v) => { v.render.collectedAt = "2026-08-01T00:00:00Z"; },
    (v) => { v.render.sourceSha = `f${sha.slice(1)}`; }, (v) => { v.cloudflare.deploymentId = "pending"; },
    (v) => { v.database.workflowRunId = "31915363091"; },
  ];
  for (const mutate of mutations) { const value = evidence(); mutate(value); assert.throws(() => verifyProductionReleaseEvidence(value, { now }), { code: "PRODUCTION_RELEASE_VERIFICATION_FAILED" }); }
  assert.throws(() => verifyProductionReleaseEvidence({ expectedSha: sha, api: { readinessPath: "/api/ready", status: 200, ready: true, revision: sha }, frontend: { revision: sha }, database: { releaseSha: sha }, releaseRecord: { releaseSha: sha } }, { now }), { code: "PRODUCTION_RELEASE_VERIFICATION_FAILED" });
});

test("runbook accurately separates repository and external controls", async () => {
  const text = await readFile("docs/production-release-control-v1.md", "utf8");
  for (const phrase of ["production environment must exist", "required reviewers", "Seller Subscription Browser Tests", "qualifying independent approval", "automatic production builds", "executable containment checks"]) assert.match(text, new RegExp(phrase, "i"));
});
