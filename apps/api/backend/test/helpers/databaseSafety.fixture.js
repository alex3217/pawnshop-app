import assert from "node:assert/strict";

import { validateTestDatabaseEnvironment } from "../../scripts/assert-test-database.mjs";

export function validateIntegrationTestDatabase(env = process.env) {
  return validateTestDatabaseEnvironment(env);
}

export async function verifyConnectedIntegrationTestDatabase(prisma, target = validateIntegrationTestDatabase()) {
  const rows = await prisma.$queryRaw`SELECT current_database() AS database_name`;
  assert.equal(
    rows[0]?.database_name,
    target.database,
    "Connected PostgreSQL database must match the validated isolated test database",
  );
  return target;
}
