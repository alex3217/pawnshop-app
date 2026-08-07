import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  configuredDemoUsers,
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
