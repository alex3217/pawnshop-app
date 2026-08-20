import assert from "node:assert/strict";
import test from "node:test";

import {
  APPROVED_RENDER_STAGING_DATABASE_TARGET_FINGERPRINT,
  STAGING_QA_CONFIRMATION,
  databaseTargetFingerprint,
  isApprovedRenderStagingTarget,
  provisionStagingQaAccounts,
  validateStagingQaProvisioningEnvironment,
} from "../scripts/lib/staging-qa-account-provisioner.mjs";

function validEnv() {
  return {
    APP_ENV: "staging",
    T48_PROVISION_STAGING_QA_ACCOUNTS: STAGING_QA_CONFIRMATION,
    DATABASE_URL: "postgresql://qa:secret@staging-db.internal/pawnloop_stage",
    T48_STAGING_DATABASE_URL_CONFIRMATION: "postgresql://qa:secret@staging-db.internal/pawnloop_stage",
    BUYER_EMAIL: "buyer-qa@example.test", BUYER_PASSWORD: "Buyer-Unique-2026!",
    OWNER_EMAIL: "owner-qa@example.test", OWNER_PASSWORD: "Owner-Unique-2026!",
    ADMIN_EMAIL: "admin-qa@example.test", ADMIN_PASSWORD: "Admin-Unique-2026!",
    SUPER_ADMIN_EMAIL: "super-qa@example.test", SUPER_ADMIN_PASSWORD: "Super-Unique-2026!",
  };
}

function validRenderIdentity() {
  return {
    APP_ENV: "staging",
    RENDER: "true",
    RENDER_SERVICE_ID: "srv-d9l3l9daeets73af05gg",
    RENDER_SERVICE_NAME: "pawnshop-staging-api",
    RENDER_GIT_REPO_SLUG: "alex3217/pawnshop-app",
  };
}

test("guard accepts only an explicitly confirmed staging target and eight distinct credentials", () => {
  const result = validateStagingQaProvisioningEnvironment(validEnv());
  assert.deepEqual(result.accounts.map(({ role }) => role), ["CONSUMER", "OWNER", "ADMIN", "SUPER_ADMIN"]);
});

test("guard accepts valid remote private and internal staging targets", () => {
  for (const url of [
    "postgresql://qa:secret@10.24.8.12/pawnloop_staging",
    "postgresql://qa:secret@staging-db.internal/pawnloop",
  ]) {
    const result = validateStagingQaProvisioningEnvironment({ ...validEnv(), DATABASE_URL: url, T48_STAGING_DATABASE_URL_CONFIRMATION: url });
    assert.ok(result.databaseHost);
  }
});

test("unlabeled provider targets require the exact Render staging identity and pinned fingerprint", () => {
  assert.equal(isApprovedRenderStagingTarget(validRenderIdentity(), APPROVED_RENDER_STAGING_DATABASE_TARGET_FINGERPRINT), true);

  const mismatches = [
    ["APP_ENV", undefined], ["APP_ENV", "STAGING"],
    ["RENDER", undefined], ["RENDER", "false"],
    ["RENDER_SERVICE_ID", undefined], ["RENDER_SERVICE_ID", "srv-other"],
    ["RENDER_SERVICE_NAME", undefined], ["RENDER_SERVICE_NAME", "pawnshop-api"],
    ["RENDER_GIT_REPO_SLUG", undefined], ["RENDER_GIT_REPO_SLUG", "other/pawnshop-app"],
  ];
  for (const [name, value] of mismatches) {
    const env = { ...validRenderIdentity() };
    if (value === undefined) delete env[name];
    else env[name] = value;
    assert.equal(isApprovedRenderStagingTarget(env, APPROVED_RENDER_STAGING_DATABASE_TARGET_FINGERPRINT), false, `${name}=${value}`);
  }
  assert.equal(isApprovedRenderStagingTarget(validRenderIdentity(), "0".repeat(64)), false);
});

test("database target fingerprint excludes credentials and query parameters", () => {
  const first = new URL("postgres://first-user:first-password@provider-db.internal/pawnloop?sslmode=require");
  const second = new URL("postgresql://second-user:second-password@PROVIDER-DB.INTERNAL:5432/pawnloop?application_name=other");
  assert.equal(databaseTargetFingerprint(first), databaseTargetFingerprint(second));
});

test("unlabeled remote targets fail closed when their computed fingerprint is not approved", () => {
  const url = "postgresql://qa:secret@provider-db.internal/pawnloop";
  assert.throws(
    () => validateStagingQaProvisioningEnvironment({ ...validEnv(), ...validRenderIdentity(), DATABASE_URL: url, T48_STAGING_DATABASE_URL_CONFIRMATION: url }),
    /must identify a staging-labeled database target/,
  );
});

test("guard rejects localhost and the entire IPv4 loopback range", () => {
  for (const hostname of ["localhost", "127.0.0.1", "127.0.0.2", "127.255.255.255", "127.1", "0177.0.0.1"]) {
    const url = `postgresql://qa:secret@${hostname}/pawnloop_staging`;
    assert.throws(() => validateStagingQaProvisioningEnvironment({ ...validEnv(), DATABASE_URL: url, T48_STAGING_DATABASE_URL_CONFIRMATION: url }), /not an allowed remote staging target/);
  }
});

test("guard rejects normalized IPv6 loopback forms", () => {
  for (const hostname of ["[::1]", "[0:0:0:0:0:0:0:1]"]) {
    const url = `postgresql://qa:secret@${hostname}/pawnloop_staging`;
    assert.throws(() => validateStagingQaProvisioningEnvironment({ ...validEnv(), DATABASE_URL: url, T48_STAGING_DATABASE_URL_CONFIRMATION: url }), /not an allowed remote staging target/);
  }
});

test("guard rejects unspecified IPv4 and IPv6 addresses", () => {
  for (const hostname of ["0.0.0.0", "[::]"]) {
    const url = `postgresql://qa:secret@${hostname}/pawnloop_staging`;
    assert.throws(() => validateStagingQaProvisioningEnvironment({ ...validEnv(), DATABASE_URL: url, T48_STAGING_DATABASE_URL_CONFIRMATION: url }), /not an allowed remote staging target/);
  }
});

test("guard fails closed for Production labels, missing confirmation, mismatched database, and missing credentials", () => {
  for (const patch of [
    { APP_ENV: "production" },
    { T48_PROVISION_STAGING_QA_ACCOUNTS: "" },
    { T48_STAGING_DATABASE_URL_CONFIRMATION: "postgresql://qa:secret@other/db" },
    { DATABASE_URL: "postgresql://qa:secret@production-db.internal/pawnloop" , T48_STAGING_DATABASE_URL_CONFIRMATION: "postgresql://qa:secret@production-db.internal/pawnloop" },
    { OWNER_PASSWORD: "" },
  ]) assert.throws(() => validateStagingQaProvisioningEnvironment({ ...validEnv(), ...patch }));
});

test("guard errors do not disclose credential values", () => {
  const env = validEnv();
  env.OWNER_EMAIL = env.BUYER_EMAIL;
  assert.throws(() => validateStagingQaProvisioningEnvironment(env), (error) => {
    for (const key of ["BUYER_EMAIL", "BUYER_PASSWORD", "OWNER_EMAIL", "OWNER_PASSWORD", "ADMIN_EMAIL", "ADMIN_PASSWORD", "SUPER_ADMIN_EMAIL", "SUPER_ADMIN_PASSWORD"]) assert.doesNotMatch(error.message, new RegExp(env[key].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    return true;
  });
});

test("guard errors do not disclose database URL components", () => {
  const env = validEnv();
  env.DATABASE_URL = "postgresql://sensitive-user:sensitive-password@unlabeled-provider.internal/private-database?sslmode=require";
  env.T48_STAGING_DATABASE_URL_CONFIRMATION = env.DATABASE_URL;
  assert.throws(() => validateStagingQaProvisioningEnvironment(env), (error) => {
    for (const secret of [env.DATABASE_URL, "sensitive-user", "sensitive-password", "unlabeled-provider.internal", "private-database", "sslmode=require"]) {
      assert.doesNotMatch(error.message, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    return true;
  });
});

test("provisioning is transactional, role-safe, and prepares the owner account", async () => {
  const { accounts } = validateStagingQaProvisioningEnvironment(validEnv());
  const users = new Map(); let application; let shop; let transactionCalls = 0;
  const tx = {
    user: {
      findMany: async () => [...users.values()],
      create: async ({ data }) => { const user = { id: `${data.role}-id`, ...data, authVersion: 0 }; users.set(data.email, user); return user; },
      update: async ({ where, data }) => { const user = [...users.values()].find(({ id }) => id === where.id); Object.assign(user, data, { authVersion: user.authVersion + 1 }); return user; },
    },
    ownerApplication: { upsert: async ({ create, update }) => { application = application ? { ...application, ...update } : { id: "application-id", ...create }; return application; } },
    pawnShop: { findFirst: async () => shop, create: async ({ data }) => { shop = { id: "shop-id", ...data }; return shop; } },
  };
  const prisma = { $transaction: async (callback) => { transactionCalls += 1; return callback(tx); } };
  const first = await provisionStagingQaAccounts({ prisma, accounts, hashPassword: async (value) => `hashed:${value.length}` });
  const second = await provisionStagingQaAccounts({ prisma, accounts, hashPassword: async (value) => `hashed:${value.length}` });
  assert.deepEqual(first, { buyer: "created", owner: "created", admin: "created", superAdmin: "created" });
  assert.deepEqual(second, { buyer: "updated", owner: "updated", admin: "updated", superAdmin: "updated" });
  assert.equal(transactionCalls, 2); assert.equal(users.size, 4); assert.equal(application.status, "APPROVED"); assert.equal(shop.ownerId, users.get(accounts[1].email).id);
});

test("provisioning refuses to repurpose an existing account with another role", async () => {
  const { accounts } = validateStagingQaProvisioningEnvironment(validEnv());
  const prisma = { $transaction: async (callback) => callback({ user: { findMany: async () => [{ id: "existing", email: accounts[0].email, role: "ADMIN" }] } }) };
  await assert.rejects(provisionStagingQaAccounts({ prisma, accounts, hashPassword: async () => "hash" }), /Refusing to change the role/);
});
