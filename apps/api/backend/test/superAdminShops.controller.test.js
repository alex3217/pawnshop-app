import assert from "node:assert/strict";
import test from "node:test";
import { listSuperAdminShops } from "../src/controllers/superAdmin.controller.js";
import { prisma } from "../src/lib/prisma.js";

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

function request(query = {}, role = "SUPER_ADMIN") {
  return { query, user: { id: "admin-1", role } };
}

async function withPawnShopMocks(run, rows = []) {
  const originalCount = prisma.pawnShop.count;
  const originalFindMany = prisma.pawnShop.findMany;
  const calls = [];
  prisma.pawnShop.count = async (args) => { calls.push({ method: "count", args }); return rows.length; };
  prisma.pawnShop.findMany = async (args) => { calls.push({ method: "findMany", args }); return rows; };
  try { return await run(calls); }
  finally {
    prisma.pawnShop.count = originalCount;
    prisma.pawnShop.findMany = originalFindMany;
  }
}

const shop = {
  id: "shop-1",
  name: "Loop Pawn",
  address: "123 Main",
  ownerId: "owner-1",
  owner: { id: "owner-1", name: "Avery Seller", email: "avery@example.test" },
  subscriptionPlan: "PRO",
  subscriptionStatus: "ACTIVE",
  subscriptionBillingInterval: "MONTHLY",
  stripeCustomerId: "cus_123",
  stripeSubscriptionId: "sub_123",
  isDeleted: false,
};

test("filters seller shops by a normalized supported subscription status", async () => {
  await withPawnShopMocks(async (calls) => {
    const res = responseRecorder();
    await listSuperAdminShops(request({ subscriptionStatus: " trialing " }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(calls[0].args.where.subscriptionStatus, "TRIALING");
  }, [shop]);
});

test("rejects an unsupported subscription status using the normal validation response", async () => {
  const res = responseRecorder();
  await listSuperAdminShops(request({ subscriptionStatus: "UNPAID" }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.match(res.body.error, /Invalid subscription status/);
  assert.ok(res.body.details.allowedStatuses.includes("ACTIVE"));
});

test("global shop search includes shop, address, owner, and Stripe identifiers", async () => {
  for (const q of ["Loop Pawn", "123 Main", "Avery Seller", "avery@example.test", "cus_123", "sub_123"]) {
    await withPawnShopMocks(async (calls) => {
      const res = responseRecorder();
      await listSuperAdminShops(request({ q }), res);
      assert.equal(res.statusCode, 200);
      const or = calls[0].args.where.OR;
      assert.equal(or[0].name.contains, q);
      assert.equal(or[1].address.contains, q);
      assert.equal(or[2].stripeCustomerId.contains, q);
      assert.equal(or[3].stripeSubscriptionId.contains, q);
      assert.equal(or[4].owner.is.OR[0].name.contains, q);
      assert.equal(or[4].owner.is.OR[1].email.contains, q);
      assert.ok(or.every((condition) => {
        const serialized = JSON.stringify(condition);
        return serialized.includes('"mode":"insensitive"');
      }));
    }, [shop]);
  }
});

test("combines search, plan, status, and deleted-state filters with filtered pagination", async () => {
  await withPawnShopMocks(async (calls) => {
    const res = responseRecorder();
    await listSuperAdminShops(request({ q: "Avery", subscriptionPlan: "pro", subscriptionStatus: "active", isDeleted: "false", page: "1", limit: "1" }), res);
    assert.equal(res.statusCode, 200);
    const where = calls[0].args.where;
    assert.equal(where.isDeleted, false);
    assert.equal(where.subscriptionPlan, "PRO");
    assert.equal(where.subscriptionStatus, "ACTIVE");
    assert.ok(Array.isArray(where.OR));
    const find = calls.find((call) => call.method === "findMany").args;
    assert.equal(find.skip, 0);
    assert.equal(find.take, 1);
    assert.deepEqual(find.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
    assert.deepEqual(res.body.pagination, { page: 1, limit: 1, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false });
    assert.equal(res.body.shops[0].isDeleted, false);
  }, [shop]);
});

test("requires Super Admin authorization before querying shops", async () => {
  const res = responseRecorder();
  await listSuperAdminShops(request({}, "ADMIN"), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, "Super Admin access required.");
});
