import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const rootPackage = JSON.parse(await readFile("package.json", "utf8"));
const backendPackage = JSON.parse(
  await readFile("apps/api/backend/package.json", "utf8"),
);

test("Render pre-deploy delegates to the backend production migration command", () => {
  assert.equal(
    rootPackage.scripts["render:predeploy"],
    "npm --prefix apps/api/backend run prisma:migrate:deploy",
  );
  assert.equal(
    backendPackage.scripts["prisma:migrate:deploy"],
    "prisma migrate deploy",
  );
});

test("Render pre-deploy excludes development and destructive Prisma operations", () => {
  const commands = [
    rootPackage.scripts["render:predeploy"],
    backendPackage.scripts["prisma:migrate:deploy"],
  ].join("\n");

  assert.doesNotMatch(commands, /migrate\s+(dev|reset)|db\s+(push|seed)|prisma\s+studio/i);
  assert.doesNotMatch(commands, /&&|\|\||;|--force|--accept-data-loss/i);
});

test("CI enforces the Render pre-deploy command contract", async () => {
  const workflow = await readFile(".github/workflows/core-ci.yml", "utf8");
  assert.match(workflow, /name: Render pre-deploy contract tests/);
  assert.match(workflow, /run: npm run test:render-predeploy-contract/);
});

test("deployment documentation scopes provider configuration and database access", async () => {
  const deployment = await readFile("DEPLOYMENT.md", "utf8");

  assert.match(deployment, /npm run render:predeploy/);
  assert.match(deployment, /does not configure Render/i);
  assert.match(deployment, /does not\s+authorize or perform a migration/i);
  assert.match(deployment, /separate authorization/i);
  assert.match(deployment, /prisma\s+migrate\s+deploy/i);
});
