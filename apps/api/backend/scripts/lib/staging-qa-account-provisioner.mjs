import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { validatePassword } from "../../src/services/passwordPolicy.service.js";

export const STAGING_QA_CONFIRMATION = "T48-STAGING-QA-ACCOUNTS";
export const APPROVED_RENDER_STAGING_DATABASE_TARGET_FINGERPRINT = "0e5b70c8b942174c813120c8a058e709a0ce10a714ad7881ab49a769bbc240eb";

const APPROVED_RENDER_STAGING_IDENTITY = Object.freeze({
  RENDER: "true",
  RENDER_SERVICE_ID: "srv-d9l3l9daeets73af05gg",
  RENDER_SERVICE_NAME: "pawnshop-staging-api",
  RENDER_GIT_REPO_SLUG: "alex3217/pawnshop-app",
});

export const STAGING_QA_ACCOUNTS = Object.freeze([
  Object.freeze({ key: "buyer", role: "CONSUMER", emailEnv: "BUYER_EMAIL", passwordEnv: "BUYER_PASSWORD", name: "Staging QA Buyer" }),
  Object.freeze({ key: "owner", role: "OWNER", emailEnv: "OWNER_EMAIL", passwordEnv: "OWNER_PASSWORD", name: "Staging QA Owner" }),
  Object.freeze({ key: "admin", role: "ADMIN", emailEnv: "ADMIN_EMAIL", passwordEnv: "ADMIN_PASSWORD", name: "Staging QA Admin" }),
  Object.freeze({ key: "superAdmin", role: "SUPER_ADMIN", emailEnv: "SUPER_ADMIN_EMAIL", passwordEnv: "SUPER_ADMIN_PASSWORD", name: "Staging QA Super Admin" }),
]);

function required(env, name) {
  const value = String(env[name] || "");
  if (!value.trim()) throw new Error(`Staging QA account provisioning requires ${name}.`);
  return value;
}

function normalizedHostname(url) {
  const hostname = new URL(`http://${url.hostname}`).hostname.toLowerCase();
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

export function databaseTargetFingerprint(url) {
  const hostname = normalizedHostname(url);
  const identity = JSON.stringify([
    "postgresql",
    hostname,
    url.port || "5432",
    url.pathname.normalize("NFC"),
  ]);
  return createHash("sha256").update(identity).digest("hex");
}

export function isApprovedRenderStagingTarget(env, fingerprint) {
  return env.APP_ENV === "staging"
    && Object.entries(APPROVED_RENDER_STAGING_IDENTITY).every(([name, value]) => env[name] === value)
    && fingerprint === APPROVED_RENDER_STAGING_DATABASE_TARGET_FINGERPRINT;
}

function isForbiddenLocalHostname(hostname) {
  if (hostname === "localhost") return true;

  const version = isIP(hostname);
  if (version === 4) {
    return hostname === "0.0.0.0" || hostname.split(".")[0] === "127";
  }
  if (version === 6) {
    return hostname === "::" || hostname === "::1";
  }
  return false;
}

export function validateStagingQaProvisioningEnvironment(env = {}) {
  if (String(env.APP_ENV || "").trim().toLowerCase() !== "staging") {
    throw new Error("Staging QA account provisioning requires APP_ENV=staging.");
  }
  if (env.T48_PROVISION_STAGING_QA_ACCOUNTS !== STAGING_QA_CONFIRMATION) {
    throw new Error(`Staging QA account provisioning requires T48_PROVISION_STAGING_QA_ACCOUNTS=${STAGING_QA_CONFIRMATION}.`);
  }

  const databaseUrl = required(env, "DATABASE_URL");
  const confirmedDatabaseUrl = required(env, "T48_STAGING_DATABASE_URL_CONFIRMATION");
  if (databaseUrl !== confirmedDatabaseUrl) {
    throw new Error("DATABASE_URL does not match the separately supplied staging database confirmation.");
  }

  let database;
  try { database = new URL(databaseUrl); } catch { throw new Error("DATABASE_URL must be a valid PostgreSQL URL."); }
  if (!new Set(["postgres:", "postgresql:"]).has(database.protocol)) {
    throw new Error("DATABASE_URL must use PostgreSQL.");
  }
  const hostname = normalizedHostname(database);
  const targetLabel = `${hostname}/${database.pathname}`.toLowerCase();
  if (isForbiddenLocalHostname(hostname) || /(?:^|[._/-])prod(?:uction)?(?:$|[._/-])/.test(targetLabel)) {
    throw new Error("DATABASE_URL is not an allowed remote staging target.");
  }
  const hasExplicitStagingLabel = /(?:^|[._/-])stag(?:e|ing)(?:$|[._/-])/.test(targetLabel);
  const approvedRenderTarget = isApprovedRenderStagingTarget(env, databaseTargetFingerprint(database));
  if (!hasExplicitStagingLabel && !approvedRenderTarget) {
    throw new Error("DATABASE_URL must identify a staging-labeled database target.");
  }

  const accounts = STAGING_QA_ACCOUNTS.map((definition) => {
    const email = required(env, definition.emailEnv).trim().toLowerCase();
    const password = required(env, definition.passwordEnv);
    if (!email.includes("@")) throw new Error(`${definition.emailEnv} must be an email address.`);
    validatePassword(password, { email });
    return { ...definition, email, password };
  });
  if (new Set(accounts.map(({ email }) => email)).size !== accounts.length) {
    throw new Error("Each staging QA role requires a distinct email address.");
  }
  if (new Set(accounts.map(({ password }) => password)).size !== accounts.length) {
    throw new Error("Each staging QA role requires a distinct password.");
  }
  return { accounts, databaseHost: hostname };
}

export async function provisionStagingQaAccounts({ prisma, accounts, hashPassword = (value) => bcrypt.hash(value, 12), now = new Date() }) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findMany({ where: { email: { in: accounts.map(({ email }) => email) } } });
    const byEmail = new Map(existing.map((user) => [user.email.toLowerCase(), user]));
    for (const account of accounts) {
      const user = byEmail.get(account.email);
      if (user && user.role !== account.role) {
        throw new Error(`Refusing to change the role of an existing account for ${account.key}.`);
      }
    }

    const results = {};
    for (const account of accounts) {
      const current = byEmail.get(account.email);
      const password = await hashPassword(account.password);
      const data = { name: account.name, role: account.role, password, isActive: true, emailVerifiedAt: now, passwordChangedAt: now };
      results[account.key] = current
        ? { action: "updated", user: await tx.user.update({ where: { id: current.id }, data: { ...data, authVersion: { increment: 1 } } }) }
        : { action: "created", user: await tx.user.create({ data: { ...data, email: account.email } }) };
    }

    const owner = results.owner.user;
    const superAdmin = results.superAdmin.user;
    await tx.ownerApplication.upsert({
      where: { ownerId: owner.id },
      create: { ownerId: owner.id, status: "APPROVED", businessName: "T48 Staging QA Shop", businessEmail: owner.email, submittedAt: now, reviewedAt: now, reviewedById: superAdmin.id, decisionReason: "Staging QA account provisioning", adminNotes: "Managed by the T48 staging-only provisioner", statusChangedAt: now },
      update: { status: "APPROVED", businessName: "T48 Staging QA Shop", businessEmail: owner.email, reviewedAt: now, reviewedById: superAdmin.id, decisionReason: "Staging QA account provisioning", adminNotes: "Managed by the T48 staging-only provisioner", statusChangedAt: now },
    });
    const shop = await tx.pawnShop.findFirst({ where: { ownerId: owner.id, isDeleted: false }, select: { id: true } });
    if (!shop) {
      await tx.pawnShop.create({ data: { name: "T48 Staging QA Shop", ownerId: owner.id, description: "Staging-only shop for authenticated QA", isActive: true, isPublic: true, onboardingCompletedAt: now } });
    }
    return Object.fromEntries(Object.entries(results).map(([key, value]) => [key, value.action]));
  });
}
