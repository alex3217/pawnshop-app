import assert from "node:assert/strict";
import test from "node:test";
import { classifyDatabaseTarget } from "./lib/database-target-safety.mjs";

const confirmed = { NODE_ENV: "test", APP_ENV: "test", CONFIRM_DISPOSABLE_DATABASE: "YES_DELETE_TEST_DATA" };

test("accepts an explicitly confirmed loopback disposable database", () => {
  assert.equal(classifyDatabaseTarget("postgresql://example-user:test-only-password@127.0.0.1:5432/pawnshop_test", confirmed).safe, true);
});

for (const [name, url, env = confirmed] of [
  ["missing URL", ""],
  ["production name", "postgresql://example-user:test-only-password@127.0.0.1/pawnshop_production"],
  ["staging host", "postgresql://example-user:test-only-password@staging.db/pawnshop_test"],
  ["unapproved remote host", "postgresql://example-user:test-only-password@example.com/pawnshop_test"],
  ["non-test database", "postgresql://example-user:test-only-password@127.0.0.1/pawnshop"],
  ["missing confirmation", "postgresql://example-user:test-only-password@127.0.0.1/pawnshop_test", { NODE_ENV: "test", APP_ENV: "test" }],
]) {
  test(`rejects ${name}`, () => assert.equal(classifyDatabaseTarget(url, env).safe, false));
}
