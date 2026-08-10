import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  configuredDemoUsers,
  ensureDemoOwnerApproval,
  loadConfiguredDemoUsers,
  upsertDemoUser,
} from "../scripts/lib/seed-demo-users.mjs";

test("reseed refreshes an existing demo user's stale password in User.password", async () => {
  const configured = configuredDemoUsers({});

  for (const user of configured) {
    const existing = { id: `${user.key}-id`, email: user.email };
    let updateArgs;
    const prisma = {
      user: {
        findUnique: async () => existing,
        create: async () => assert.fail("existing users must be updated"),
        update: async (args) => {
          updateArgs = args;
          return { ...existing, ...args.data };
        },
      },
    };

    await upsertDemoUser({
      prisma,
      user,
      buildData: (_model, data) => data,
      hasField: (_model, field) => field === "authVersion",
    });

    assert.equal(updateArgs.where.id, existing.id);
    assert.equal(typeof updateArgs.data.password, "string");
    assert.equal(await bcrypt.compare(user.password, updateArgs.data.password), true);
    assert.deepEqual(updateArgs.data.authVersion, { increment: 1 });
    assert.equal("passwordHash" in updateArgs.data, false);
    assert.equal("hashedPassword" in updateArgs.data, false);
  }
});

test("environment-defined credentials resolve for all four roles", () => {
  const env = Object.fromEntries(
    ["BUYER", "OWNER", "ADMIN", "SUPER_ADMIN"].flatMap((role) => [
      [`${role}_EMAIL`, `${role.toLowerCase()}-override@pawn.local`],
      [`${role}_PASSWORD`, `Valid-${role}-Override-2026!`],
    ]),
  );
  const users = configuredDemoUsers(env);

  assert.equal(users.length, 4);
  for (const user of users) {
    const prefix = user.key === "superAdmin" ? "SUPER_ADMIN" : user.key.toUpperCase();
    assert.equal(user.email, env[`${prefix}_EMAIL`]);
    assert.equal(user.password, env[`${prefix}_PASSWORD`]);
  }
});

test("development env files load before credentials are resolved", () => {
  const backendRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pawn-demo-env-"));
  try {
    fs.writeFileSync(
      path.join(backendRoot, ".env.development"),
      "BUYER_EMAIL=loaded@pawn.local\nBUYER_PASSWORD=Loaded-After-Dotenv-2026!\n",
    );
    const env = { APP_ENV: "development" };
    const users = loadConfiguredDemoUsers({ env, backendRoot });
    assert.equal(users.find(({ key }) => key === "buyer").email, "loaded@pawn.local");
    assert.equal(users.find(({ key }) => key === "buyer").password, "Loaded-After-Dotenv-2026!");
  } finally {
    fs.rmSync(backendRoot, { recursive: true, force: true });
  }
});

test("development seed approval is owner-only, owner-scoped, and idempotent", async () => {
  const owner = {
    id: "demo-owner-id",
    email: "owner@pawn.local",
    role: "OWNER",
  };
  const shop = {
    id: "demo-shop-id",
    name: "Demo Pawn Shop",
    ownerId: owner.id,
  };
  const firstTransitionAt = new Date("2026-08-07T12:00:00.000Z");
  const unchangedReseedAt = new Date("2026-08-08T12:00:00.000Z");
  const applications = new Map();
  const prisma = {
    ownerApplication: {
      findUnique: async ({ where }) => applications.get(where.ownerId) || null,
      create: async ({ data }) => {
        const record = { id: "demo-owner-application-id", ...data };
        applications.set(data.ownerId, record);
        return record;
      },
      update: async ({ where, data }) => {
        const record = { ...applications.get(where.ownerId), ...data };
        applications.set(where.ownerId, record);
        return record;
      },
    },
  };

  const first = await ensureDemoOwnerApproval({
    prisma,
    owner,
    shop,
    reviewedAt: firstTransitionAt,
  });
  shop.name = "Renamed Demo Pawn Shop";
  const second = await ensureDemoOwnerApproval({
    prisma,
    owner,
    shop,
    reviewedAt: unchangedReseedAt,
  });

  assert.equal(first.status, "APPROVED");
  assert.equal(first.ownerId, owner.id);
  assert.equal(first.businessName, "Demo Pawn Shop");
  assert.equal(first.reviewedAt, firstTransitionAt);
  assert.equal(first.statusChangedAt, firstTransitionAt);
  assert.equal(second.id, first.id);
  assert.equal(second.businessName, "Renamed Demo Pawn Shop");
  assert.equal(second.reviewedAt, firstTransitionAt);
  assert.equal(second.statusChangedAt, firstTransitionAt);
  assert.equal(applications.size, 1);
});

test("development seed records a fresh transition time when approving an existing application", async () => {
  const owner = {
    id: "pending-owner-id",
    email: "pending-owner@pawn.local",
    role: "OWNER",
  };
  const shop = {
    id: "pending-owner-shop-id",
    name: "Pending Owner Shop",
    ownerId: owner.id,
  };
  const originalStatusChangedAt = new Date("2026-08-01T12:00:00.000Z");
  const transitionAt = new Date("2026-08-08T12:00:00.000Z");
  const applications = new Map([
    [
      owner.id,
      {
        id: "pending-owner-application-id",
        ownerId: owner.id,
        status: "PENDING",
        reviewedAt: null,
        statusChangedAt: originalStatusChangedAt,
      },
    ],
  ]);
  const prisma = {
    ownerApplication: {
      findUnique: async ({ where }) => applications.get(where.ownerId) || null,
      create: async () => assert.fail("existing applications must be updated"),
      update: async ({ where, data }) => {
        const record = { ...applications.get(where.ownerId), ...data };
        applications.set(where.ownerId, record);
        return record;
      },
    },
  };

  const approved = await ensureDemoOwnerApproval({
    prisma,
    owner,
    shop,
    reviewedAt: transitionAt,
  });

  assert.equal(approved.id, "pending-owner-application-id");
  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.reviewedAt, transitionAt);
  assert.equal(approved.statusChangedAt, transitionAt);
  assert.equal(applications.size, 1);
});

test("development seed approval rejects buyers and mismatched shop ownership", async () => {
  let upsertCalls = 0;
  const prisma = {
    ownerApplication: {
      findUnique: async () => {
        upsertCalls += 1;
      },
    },
  };
  const buyer = {
    id: "demo-buyer-id",
    email: "buyer@pawn.local",
    role: "CONSUMER",
  };
  const owner = {
    id: "demo-owner-id",
    email: "owner@pawn.local",
    role: "OWNER",
  };

  await assert.rejects(
    ensureDemoOwnerApproval({
      prisma,
      owner: buyer,
      shop: { id: "buyer-shop", name: "Buyer Shop", ownerId: buyer.id },
    }),
    /requires an OWNER user/,
  );
  await assert.rejects(
    ensureDemoOwnerApproval({
      prisma,
      owner,
      shop: { id: "other-shop", name: "Other Shop", ownerId: "other-owner" },
    }),
    /requires an owner-owned shop/,
  );
  assert.equal(upsertCalls, 0);
});
