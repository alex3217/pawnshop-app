import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routesPath = new URL("../src/routes/superAdmin.routes.js", import.meta.url);
const controllerPath = new URL("../src/controllers/superAdmin.controller.js", import.meta.url);

test("all platform-setting routes are behind authenticated SUPER_ADMIN middleware", async () => {
  const source = await readFile(routesPath, "utf8");
  const auth = source.indexOf("router.use(authRequired, requireRole(...SUPER_ADMIN_ROLES))");
  for (const route of ["router.get(\"/platform-settings\"", "\"/platform-settings/configurations/:area\"", "\"/platform-settings/configurations/:area/:id\""]) {
    assert.ok(source.lastIndexOf(route) > auth, `${route} must be declared after SUPER_ADMIN authorization`);
  }
});

test("configuration mutations use transactions, optimistic concurrency, and audit logs", async () => {
  const source = await readFile(controllerPath, "utf8");
  const section = source.slice(source.indexOf("export async function createPlatformConfiguration"), source.indexOf("function normalizePricingRuleId"));
  assert.match(section, /prisma\.\$transaction/);
  assert.match(section, /expectedUpdatedAt/);
  assert.match(section, /status = 409|status, 409|conflict\.status = 409/);
  assert.match(section, /superAdminAuditLog\.create/);
});
