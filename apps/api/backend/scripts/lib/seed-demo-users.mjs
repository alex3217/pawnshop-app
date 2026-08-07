import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { validatePassword } from "../../src/services/passwordPolicy.service.js";

const defaultBackendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export const DEMO_USERS = Object.freeze([
  Object.freeze({
    key: "buyer",
    emailEnv: "BUYER_EMAIL",
    email: "buyer@pawn.local",
    name: "Dev Buyer",
    role: "CONSUMER",
    passwordEnv: "BUYER_PASSWORD",
    defaultPassword: "PawnLoop-Dev-Buyer-2026!",
  }),
  Object.freeze({
    key: "owner",
    emailEnv: "OWNER_EMAIL",
    email: "owner1@pawn.local",
    name: "Dev Owner",
    role: "OWNER",
    passwordEnv: "OWNER_PASSWORD",
    defaultPassword: "PawnLoop-Dev-Owner-2026!",
  }),
  Object.freeze({
    key: "admin",
    emailEnv: "ADMIN_EMAIL",
    email: "admin1@example.com",
    name: "Dev Admin",
    role: "ADMIN",
    passwordEnv: "ADMIN_PASSWORD",
    defaultPassword: "PawnLoop-Dev-Admin-2026!",
  }),
  Object.freeze({
    key: "superAdmin",
    emailEnv: "SUPER_ADMIN_EMAIL",
    email: "superadmin1@example.com",
    name: "Dev Super Admin",
    role: "SUPER_ADMIN",
    passwordEnv: "SUPER_ADMIN_PASSWORD",
    defaultPassword: "PawnLoop-Dev-SuperAdmin-2026!",
  }),
]);

export function configuredDemoUsers(env = {}) {
  return DEMO_USERS.map(({ emailEnv, passwordEnv, defaultPassword, ...user }) => ({
    ...user,
    email: env[emailEnv] || user.email,
    password: env[passwordEnv] || defaultPassword,
  }));
}

export function loadDemoEnvironment({
  env = process.env,
  backendRoot = defaultBackendRoot,
} = {}) {
  const environment = String(env.APP_ENV || env.NODE_ENV || "development").trim();
  const candidates = [
    env.DOTENV_CONFIG_PATH,
    path.resolve(backendRoot, `.env.${environment}`),
    path.resolve(backendRoot, ".env"),
  ].filter(Boolean);

  for (const file of new Set(candidates)) {
    if (fs.existsSync(file)) {
      dotenv.config({ path: file, processEnv: env, override: false, quiet: true });
    }
  }
  return env;
}

export function loadConfiguredDemoUsers(options = {}) {
  return configuredDemoUsers(loadDemoEnvironment(options));
}

export async function upsertDemoUser({ prisma, user, buildData, hasField }) {
  validatePassword(user.password, { email: user.email });
  const password = await bcrypt.hash(user.password, 10);
  const data = buildData("User", {
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: true,
    emailVerifiedAt: new Date(),
    password,
  });
  const existing = await prisma.user.findUnique({ where: { email: user.email } });

  if (!existing) return prisma.user.create({ data });

  const update = hasField("User", "authVersion")
    ? { ...data, authVersion: { increment: 1 } }
    : data;
  return prisma.user.update({ where: { id: existing.id }, data: update });
}
