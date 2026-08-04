import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  redactSuperAdminAuditMetadata,
  runGovernedShopMutation,
  runGovernedUserMutation,
} from "../src/services/superAdminAudit.service.js";

function request(role = "SUPER_ADMIN", sub = "actor") {
  return {
    user: { sub, role, email: `${sub}@example.test` },
    method: "PATCH",
    originalUrl: "/api/super-admin/users/target",
    route: { path: "/users/:id" },
    headers: { authorization: "Bearer hidden", cookie: "session=hidden" },
  };
}

function mockClient({ users, auditFails = false, lockRows = [{ acquired: null }] }) {
  const state = new Map(users.map((user) => [user.id, structuredClone(user)]));
  const audits = [];

  return {
    state,
    audits,
    async $transaction(callback, options) {
      const pending = new Map([...state].map(([id, user]) => [id, structuredClone(user)]));
      const pendingAudits = [];
      const tx = {
        $queryRaw: async () => lockRows,
        user: {
          findUnique: async ({ where }) => pending.get(where.id) || null,
          count: async ({ where }) =>
            [...pending.values()].filter(
              (user) => user.role === where.role && user.isActive === where.isActive,
            ).length,
          update: async ({ where, data }) => {
            const previous = pending.get(where.id);
            const next = {
              ...previous,
              ...data,
              authVersion: data.authVersion?.increment
                ? previous.authVersion + data.authVersion.increment
                : previous.authVersion,
            };
            pending.set(where.id, next);
            return next;
          },
        },
        superAdminAuditLog: {
          create: async ({ data }) => {
            if (auditFails) throw new Error("audit unavailable");
            pendingAudits.push(data);
            return data;
          },
        },
      };

      const result = await callback(tx);
      assert.equal(options?.isolationLevel, "ReadCommitted");
      state.clear();
      for (const [id, user] of pending) state.set(id, user);
      audits.push(...pendingAudits);
      return result;
    },
  };
}

const superAdmin = (id, overrides = {}) => ({
  id,
  role: "SUPER_ADMIN",
  isActive: true,
  authVersion: 0,
  ...overrides,
});

test("rejects unauthenticated and unauthorized governance calls", async () => {
  const client = mockClient({ users: [superAdmin("target")] });
  await assert.rejects(
    runGovernedUserMutation({
      req: request("CONSUMER"),
      targetUserId: "target",
      update: { isActive: false },
      action: "UPDATE_USER",
      prismaClient: client,
    }),
    (error) => error.statusCode === 403 && error.code === "ADMIN_REQUIRED",
  );
});

test("ADMIN cannot promote a user or mutate an existing SUPER_ADMIN", async () => {
  const client = mockClient({
    users: [superAdmin("root"), { id: "user", role: "ADMIN", isActive: true, authVersion: 0 }],
  });

  await assert.rejects(
    runGovernedUserMutation({
      req: request("ADMIN"), targetUserId: "user", update: { role: "SUPER_ADMIN" },
      action: "UPDATE_USER", prismaClient: client,
    }),
    (error) => error.code === "SUPER_ADMIN_REQUIRED",
  );
  await assert.rejects(
    runGovernedUserMutation({
      req: request("ADMIN"), targetUserId: "root", update: { name: "changed" },
      action: "UPDATE_USER", prismaClient: client,
    }),
    (error) => error.code === "SUPER_ADMIN_REQUIRED",
  );
});

test("SUPER_ADMIN cannot deactivate, block, or demote itself", async () => {
  for (const update of [{ isActive: false }, { role: "ADMIN" }]) {
    const client = mockClient({ users: [superAdmin("self"), superAdmin("other")] });
    await assert.rejects(
      runGovernedUserMutation({
        req: request("SUPER_ADMIN", "self"), targetUserId: "self", update,
        action: "UPDATE_USER", prismaClient: client,
      }),
      (error) => error.code === "SUPER_ADMIN_SELF_LOCKOUT",
    );
    assert.equal(client.audits.length, 0);
  }
});

test("cannot remove the last active authentication-eligible SUPER_ADMIN", async () => {
  const client = mockClient({ users: [superAdmin("last")] });
  await assert.rejects(
    runGovernedUserMutation({
      req: request("SUPER_ADMIN", "actor"), targetUserId: "last",
      update: { isActive: false }, action: "UPDATE_USER", prismaClient: client,
    }),
    (error) => error.code === "LAST_ACTIVE_SUPER_ADMIN",
  );
  assert.equal(client.state.get("last").isActive, true);
});

test("successful user mutation persists exactly one redacted audit and preserves result", async () => {
  const client = mockClient({ users: [superAdmin("actor"), superAdmin("target")] });
  const req = request();
  const result = await runGovernedUserMutation({
    req,
    targetUserId: "target",
    update: {
      isActive: false,
      nested: {
        password: "hidden",
        refreshToken: "hidden",
        cookies: "hidden",
        paymentCredentials: { cardNumber: "4242", cvv: "123" },
      },
    },
    action: "UPDATE_USER",
    prismaClient: client,
  });

  assert.equal(result.isActive, false);
  assert.equal(client.audits.length, 1);
  assert.equal(req.skipPersistedSuperAdminAudit, true);
  assert.deepEqual(client.audits[0].metadata.update.nested, {
    password: "[REDACTED]",
    refreshToken: "[REDACTED]",
    cookies: "[REDACTED]",
    paymentCredentials: "[REDACTED]",
  });
});

test("audit failure rolls back the required user mutation", async () => {
  const client = mockClient({
    users: [superAdmin("actor"), superAdmin("target")],
    auditFails: true,
  });
  await assert.rejects(
    runGovernedUserMutation({
      req: request(), targetUserId: "target", update: { isActive: false },
      action: "UPDATE_USER", prismaClient: client,
    }),
    /audit unavailable/,
  );
  assert.equal(client.state.get("target").isActive, true);
});

test("advisory lock acquisition cannot silently return no row", async () => {
  const client = mockClient({ users: [superAdmin("target")], lockRows: [] });
  await assert.rejects(
    runGovernedUserMutation({
      req: request(), targetUserId: "target", update: { name: "safe" },
      action: "UPDATE_USER", prismaClient: client,
    }),
    /Failed to acquire the Super Admin governance lock/,
  );
});

test("shop governance mutation and audit are atomic and exactly once", async () => {
  let shop = { id: "shop", isDeleted: false };
  const audits = [];
  const client = {
    async $transaction(callback) {
      const before = structuredClone(shop);
      const pending = [];
      try {
        const result = await callback({
          pawnShop: { update: async ({ data }) => (shop = { ...shop, ...data }) },
          superAdminAuditLog: { create: async ({ data }) => pending.push(data) },
        });
        audits.push(...pending);
        return result;
      } catch (error) {
        shop = before;
        throw error;
      }
    },
  };
  const req = request("ADMIN");
  const result = await runGovernedShopMutation({
    req, targetShopId: "shop", update: { isDeleted: true },
    action: "ADMIN_DISABLE_SHOP", prismaClient: client,
  });
  assert.deepEqual(result, { id: "shop", isDeleted: true });
  assert.equal(audits.length, 1);
  assert.equal(req.skipPersistedSuperAdminAudit, true);
});

test("redaction recursively handles arrays and all credential families", () => {
  assert.deepEqual(
    redactSuperAdminAuditMetadata({
      items: [{ authorization: "hidden", apiSecret: "hidden" }],
      payment: { bankAccount: "hidden", routingNumber: "hidden" },
    }),
    {
      items: [{ authorization: "[REDACTED]", apiSecret: "[REDACTED]" }],
      payment: { bankAccount: "[REDACTED]", routingNumber: "[REDACTED]" },
    },
  );
});

test("routes retain authorization and response contracts without duplicate governance audit", async () => {
  const [routes, adminController, superController] = await Promise.all([
    readFile(new URL("../src/routes/superAdmin.routes.js", import.meta.url), "utf8"),
    readFile(new URL("../src/controllers/admin.controller.js", import.meta.url), "utf8"),
    readFile(new URL("../src/controllers/superAdmin.controller.js", import.meta.url), "utf8"),
  ]);
  assert.match(routes, /router\.use\(authRequired, requireRole\(\.\.\.SUPER_ADMIN_ROLES\)\)/);
  assert.doesNotMatch(routes, /auditSuperAdminGovernanceMutation/);
  assert.match(adminController, /success: true,\s+user: serializeAdminUser\(user\)/);
  assert.match(adminController, /ok: true, id: shop\.id, isDeleted: shop\.isDeleted/);
  assert.match(superController, /success: true,\s+user: mapUserRow\(updated\)/);
  assert.match(superController, /success: true,\s+shop: mapShopRow\(updated\)/);
});

test("real PostgreSQL advisory lock serializes concurrent last-admin removals", {
  skip: process.env.GOVERNANCE_DATABASE_TEST !== "1",
}, async () => {
  const { PrismaClient } = await import("@prisma/client");
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(url.hostname));
  assert.equal(url.pathname.replace(/^\//, ""), "pawnshop_test");
  const db = new PrismaClient();
  const marker = `governance-${Date.now()}`;
  const password = "not-a-real-credential";
  const created = await Promise.all(["a", "b"].map((suffix) => db.user.create({
    data: { name: marker, email: `${marker}-${suffix}@example.test`, password, role: "SUPER_ADMIN" },
  })));

  try {
    const results = await Promise.allSettled(created.map((user) =>
      runGovernedUserMutation({
        req: request("SUPER_ADMIN", "external-actor"),
        targetUserId: user.id,
        update: { role: "ADMIN", authVersion: { increment: 1 } },
        action: "CONCURRENT_DEMOTION_TEST",
        prismaClient: db,
      })));
    const diagnostics = results.map((result) =>
      result.status === "fulfilled" ? "fulfilled" : String(result.reason?.message || result.reason),
    );
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1, diagnostics.join(" | "));
    assert.equal(results.filter((result) => result.status === "rejected").length, 1, diagnostics.join(" | "));
    assert.equal(await db.user.count({
      where: { id: { in: created.map(({ id }) => id) }, role: "SUPER_ADMIN", isActive: true },
    }), 1);
  } finally {
    await db.superAdminAuditLog.deleteMany({ where: { action: "CONCURRENT_DEMOTION_TEST" } });
    await db.user.deleteMany({ where: { id: { in: created.map(({ id }) => id) } } });
    await db.$disconnect();
  }
});
