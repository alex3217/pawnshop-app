import assert from "node:assert/strict";
import test from "node:test";

import { assertSafeDatabaseTargetForRuntime } from "../src/config/databaseRuntimeGuard.js";

const databaseUrl = (host, name) => {
  const urlHost = host.includes(":") ? `[${host}]` : host;
  return `postgresql://example-user:test-only-password@${urlHost}:5432/${name}?sslmode=require`;
};

function assertRejected(env, pattern) {
  assert.throws(() => assertSafeDatabaseTargetForRuntime(env), pattern);
}

test("development accepts exact local identity", () => {
  const result = assertSafeDatabaseTargetForRuntime({
    APP_ENV: "development",
    PORT: "6002",
    DATABASE_URL: databaseUrl("127.0.0.1", "pawnshop_dev"),
  });
  assert.equal(result.database, "pawnshop_dev");
});

test("development rejects a production-like remote database", () => {
  assertRejected(
    {
      APP_ENV: "development",
      PORT: "6002",
      DATABASE_URL: databaseUrl("production.db.internal", "pawnshop"),
    },
    /loopback PostgreSQL host/,
  );
});

test("development rejects pawnshop instead of pawnshop_dev", () => {
  assertRejected(
    {
      APP_ENV: "development",
      PORT: "6002",
      DATABASE_URL: databaseUrl("localhost", "pawnshop"),
    },
    /pawnshop_dev/,
  );
});

test("development rejects the wrong port", () => {
  assertRejected(
    {
      APP_ENV: "development",
      PORT: "6003",
      DATABASE_URL: databaseUrl("localhost", "pawnshop_dev"),
    },
    /Development must use port 6002/,
  );
});

for (const name of ["pawnshop_test", "pawnshop_ci"]) {
  test(`test accepts local ${name}`, () => {
    const result = assertSafeDatabaseTargetForRuntime({
      APP_ENV: "test",
      DATABASE_URL: databaseUrl("::1", name),
    });
    assert.equal(result.database, name);
  });
}

test("test rejects a remote database", () => {
  assertRejected(
    {
      APP_ENV: "test",
      DATABASE_URL: databaseUrl("test.db.internal", "pawnshop_test"),
    },
    /loopback PostgreSQL host/,
  );
});

test("test rejects a non-test database name", () => {
  assertRejected(
    {
      APP_ENV: "test",
      DATABASE_URL: databaseUrl("localhost", "pawnshop"),
    },
    /must end in _test or _ci/,
  );
});

test("exact staging identity is accepted", () => {
  const result = assertSafeDatabaseTargetForRuntime({
    APP_ENV: "staging",
    PORT: "6003",
    EXPECTED_DATABASE_HOST: "staging.db.internal",
    EXPECTED_DATABASE_NAME: "pawnshop_staging",
    DATABASE_URL: databaseUrl("staging.db.internal", "pawnshop_staging"),
  });
  assert.equal(result.environment, "staging");
});

test("staging rejects a production host", () => {
  assertRejected(
    {
      APP_ENV: "staging",
      PORT: "6003",
      EXPECTED_DATABASE_HOST: "staging.db.internal",
      EXPECTED_DATABASE_NAME: "pawnshop_staging",
      DATABASE_URL: databaseUrl("production.db.internal", "pawnshop_staging"),
    },
    /does not match EXPECTED_DATABASE_HOST exactly/,
  );
});

test("staging rejects missing expected identity", () => {
  assertRejected(
    {
      APP_ENV: "staging",
      PORT: "6003",
      DATABASE_URL: databaseUrl("staging.db.internal", "pawnshop_staging"),
    },
    /EXPECTED_DATABASE_HOST must be configured/,
  );
});

for (const name of ["pawnshop_dev", "pawnshop_test", "pawnshop_ci"]) {
  test(`staging rejects ${name}`, () => {
    assertRejected(
      {
        APP_ENV: "staging",
        PORT: "6003",
        EXPECTED_DATABASE_HOST: "staging.db.internal",
        EXPECTED_DATABASE_NAME: name,
        DATABASE_URL: databaseUrl("staging.db.internal", name),
      },
      /must not use a development, test, or CI database/,
    );
  });
}

test("staging rejects loopback", () => {
  assertRejected(
    {
      APP_ENV: "staging",
      PORT: "6003",
      EXPECTED_DATABASE_HOST: "localhost",
      EXPECTED_DATABASE_NAME: "pawnshop_staging",
      DATABASE_URL: databaseUrl("localhost", "pawnshop_staging"),
    },
    /must not use a loopback/,
  );
});

test("exact production identity is accepted", () => {
  const result = assertSafeDatabaseTargetForRuntime({
    APP_ENV: "production",
    PORT: "6001",
    EXPECTED_DATABASE_HOST: "production.db.internal",
    EXPECTED_DATABASE_NAME: "pawnshop",
    DATABASE_URL: databaseUrl("production.db.internal", "pawnshop"),
  });
  assert.equal(result.environment, "production");
});

test("production rejects a staging host", () => {
  assertRejected(
    {
      APP_ENV: "production",
      PORT: "6001",
      EXPECTED_DATABASE_HOST: "production.db.internal",
      EXPECTED_DATABASE_NAME: "pawnshop",
      DATABASE_URL: databaseUrl("staging.db.internal", "pawnshop"),
    },
    /does not match EXPECTED_DATABASE_HOST exactly/,
  );
});

test("production rejects pawnshop_dev", () => {
  assertRejected(
    {
      APP_ENV: "production",
      PORT: "6001",
      EXPECTED_DATABASE_HOST: "production.db.internal",
      EXPECTED_DATABASE_NAME: "pawnshop_dev",
      DATABASE_URL: databaseUrl("production.db.internal", "pawnshop_dev"),
    },
    /must not use a development, test, CI, staging, or placeholder database/,
  );
});

test("production rejects missing expected identity", () => {
  assertRejected(
    {
      APP_ENV: "production",
      PORT: "6001",
      DATABASE_URL: databaseUrl("production.db.internal", "pawnshop"),
    },
    /EXPECTED_DATABASE_HOST must be configured/,
  );
});

for (const [host, name] of [
  ["db.example.com", "pawnshop"],
  ["production.db.internal", "placeholder"],
]) {
  test("production rejects placeholder expected identity", () => {
    assertRejected(
      {
        APP_ENV: "production",
        PORT: "6001",
        EXPECTED_DATABASE_HOST: host,
        EXPECTED_DATABASE_NAME: name,
        DATABASE_URL: databaseUrl(host, name),
      },
      /placeholder/,
    );
  });
}

for (const environment of ["staging", "production"]) {
  test(`${environment} rejects unchanged .env.example identity placeholders`, () => {
    const host = "replace-with-exact-database-host.invalid";
    const name = "replace-with-exact-database-name";
    assertRejected(
      {
        APP_ENV: environment,
        PORT: environment === "staging" ? "6003" : "6001",
        EXPECTED_DATABASE_HOST: host,
        EXPECTED_DATABASE_NAME: name,
        DATABASE_URL: databaseUrl(host, name),
      },
      /placeholder/,
    );
  });
}

test("blank and unsupported APP_ENV values are rejected", () => {
  for (const APP_ENV of ["", "preview"]) {
    assertRejected(
      { APP_ENV, DATABASE_URL: databaseUrl("localhost", "pawnshop_test") },
      /APP_ENV must be development, test, staging, or production/,
    );
  }
});

test("runtime port and environment must agree", () => {
  assertRejected(
    {
      APP_ENV: "production",
      PORT: "6002",
      EXPECTED_DATABASE_HOST: "production.db.internal",
      EXPECTED_DATABASE_NAME: "pawnshop",
      DATABASE_URL: databaseUrl("production.db.internal", "pawnshop"),
    },
    /requires APP_ENV=development/,
  );
});

test("safe startup log excludes host, credentials, and connection options", () => {
  const messages = [];
  const originalLog = console.log;
  console.log = (message) => messages.push(message);

  try {
    assertSafeDatabaseTargetForRuntime({
      APP_ENV: "production",
      PORT: "6001",
      EXPECTED_DATABASE_HOST: "production.db.internal",
      EXPECTED_DATABASE_NAME: "pawnshop",
      DATABASE_URL: databaseUrl("production.db.internal", "pawnshop"),
    });
  } finally {
    console.log = originalLog;
  }

  assert.equal(messages.length, 1);
  assert.match(messages[0], /environment=production/);
  assert.match(messages[0], /runtimePort=6001/);
  assert.match(messages[0], /location=remote/);
  assert.match(messages[0], /database=pawnshop/);
  assert.doesNotMatch(messages[0], /production\.db\.internal|user|password|sslmode/);
});
