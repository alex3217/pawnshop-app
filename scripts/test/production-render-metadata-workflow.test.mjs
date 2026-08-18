import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = ".github/workflows/production-render-metadata.yml";
const workflow = await readFile(workflowPath, "utf8");

test("is manual, production-gated, and minimally permissioned", () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(workflow, /^\s+(push|pull_request|schedule|workflow_run):/m);
  assert.match(workflow, /^permissions:\n  contents: read$/m);
  assert.match(workflow, /^    environment: production$/m);
  assert.match(workflow, /secrets\.RENDER_API_KEY/);
});

test("uses authenticated GET requests only", () => {
  assert.match(workflow, /method: "GET"/);
  assert.match(workflow, /Authorization: `Bearer \$\{apiKey\}`/);
  assert.match(workflow, /\/services\/\$\{serviceId\}`/);
  assert.match(workflow, /\/services\/\$\{serviceId\}\/deploys\?status=live&limit=100/);
  assert.doesNotMatch(workflow, /method:\s*["']?(POST|PUT|PATCH|DELETE)/i);
  assert.doesNotMatch(workflow, /curl\b|wget\b/);
});

test("cannot call a Render deploy or maintenance mutation endpoint", () => {
  const requestPaths = [...workflow.matchAll(/getJson\(`([^`]+)`\)/g)].map((match) => match[1]);
  assert.deepEqual(requestPaths, [
    "/services/${serviceId}",
    "/environments/${environmentId}",
    "/services/${serviceId}/deploys?status=live&limit=100",
  ]);
  assert.doesNotMatch(requestPaths.join("\n"), /\/deploys\/|\/cancel\b|\/rollback\b|\/maintenance\b/i);
  assert.doesNotMatch(workflow, /method:\s*["']?(POST|PUT|PATCH|DELETE)|\b(enable|disable|toggle|update)Maintenance\b/i);
});

test("cannot invoke Prisma or access a database secret", () => {
  assert.doesNotMatch(workflow, /\b(prisma|npx|npm|DATABASE_URL|DIRECT_URL|postgres(?:ql)?:)\b/i);
});

test("masks the credential and emits only allowlisted safe fields", () => {
  assert.match(workflow, /echo "::add-mask::\$RENDER_API_KEY"/);
  assert.doesNotMatch(workflow, /console\.(log|error).*apiKey|console\.(log|error).*Authorization|response\.text\(/i);
  const metadataBlock = workflow.match(/const safeMetadata = \{([\s\S]*?)\n          \};/);
  assert.ok(metadataBlock);
  const fields = [...metadataBlock[1].matchAll(/^\s{12}([A-Za-z][A-Za-z0-9]*)(?::|,)/gm)].map((match) => match[1]);
  assert.deepEqual(fields, ["serviceId", "serviceName", "environmentId", "environmentName", "deployId", "deployStatus", "sourceSha", "maintenanceEnabled", "autoDeploy", "autoDeployTrigger"]);
});

test("fails closed on every required production invariant", () => {
  for (const guard of [
    "authenticated GET returned HTTP",
    "malformed JSON",
    "incorrect service identity",
    "missing environment identity",
    "no unique live deployment matched the exact source SHA",
    "maintenance mode is not enabled",
    "auto-deploy is not disabled",
  ]) assert.match(workflow, new RegExp(guard));
  assert.match(workflow, /matching\.length !== 1/);
  assert.match(workflow, /deploy\.status === "live" && deploy\.commit\?\.id === sourceSha/);
});
