import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { querySuperAdminAuditLogs } from "../src/services/superAdminAudit.service.js";

function mockAuditClient(rows) {
  function matches(row, where) {
    return Object.entries(where).every(([key, expected]) => row[key] === expected);
  }
  return {
    superAdminAuditLog: {
      findMany: async ({ where, skip, take }) =>
        rows.filter((row) => matches(row, where)).slice(skip, skip + take),
      count: async ({ where }) => rows.filter((row) => matches(row, where)).length,
    },
  };
}

test("SHOP plus PawnShop targetId returns only that shop's activation or reconciliation audit", async () => {
  const rows = [
    { id: "a1", action: "SELLER_SUBSCRIPTION_ACTIVATED", targetType: "SHOP", targetId: "shop_1" },
    { id: "a2", action: "SELLER_SUBSCRIPTION_RECONCILED", targetType: "SHOP", targetId: "shop_1" },
    { id: "a3", action: "SELLER_SUBSCRIPTION_ACTIVATED", targetType: "SHOP", targetId: "shop_2" },
    { id: "a4", action: "UPDATE_USER", targetType: "USER", targetId: "shop_1" },
  ];
  const result = await querySuperAdminAuditLogs(
    { targetType: "shop", targetId: "shop_1" },
    mockAuditClient(rows),
  );

  assert.equal(result.total, 2);
  assert.deepEqual(result.rows.map(({ id }) => id), ["a1", "a2"]);
  assert.ok(result.rows.every((row) => row.targetId === "shop_1"));
});

test("audit route remains behind Super Admin authorization", async () => {
  const routes = await readFile(new URL("../src/routes/superAdmin.routes.js", import.meta.url), "utf8");
  const authorization = routes.indexOf("router.use(authRequired, requireRole(...SUPER_ADMIN_ROLES))");
  const auditRoute = routes.indexOf('router.get("/audit", asyncRoute(listSuperAdminAuditLogs))');
  assert.ok(authorization >= 0, "Super Admin authorization middleware must exist");
  assert.ok(auditRoute > authorization, "audit route must be registered after authorization");
});
