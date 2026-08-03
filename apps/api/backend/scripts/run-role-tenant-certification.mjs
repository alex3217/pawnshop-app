import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

import { classifyDatabaseTarget } from "../../../../scripts/lib/database-target-safety.mjs";

const env = {
  ...process.env,
  NODE_ENV: "test",
  APP_ENV: "test",
  ROLE_TENANT_CERT_PASSWORD: randomBytes(32).toString("base64url"),
};
const safety = classifyDatabaseTarget(env.DATABASE_URL, env);

if (!safety.safe || safety.target?.database !== "pawnshop_test") {
  console.error("Refusing role/tenant certification: disposable pawnshop_test is required.");
  for (const error of safety.errors || []) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Database safety passed: ${safety.target.host}:${safety.target.port}/${safety.target.database}`);

const commands = [
  ["npx", ["prisma", "migrate", "deploy"]],
  ["npx", ["prisma", "generate"]],
  [process.execPath, ["scripts/seed-role-tenant-certification.mjs"]],
  [process.execPath, ["--test", "--test-concurrency=1", "test/roleTenantCertification.certification.test.js"]],
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { cwd: process.cwd(), env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
