import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { selectRuntimeEnvFile } from "../src/config/runtimeEnvSelection.js";

const root = "/example/backend";
const developmentFile = path.resolve(root, ".env.development");
const genericFile = path.resolve(root, ".env");

function select(
  appEnv,
  { available = [], explicitPath, realpaths = new Map() } = {},
) {
  const files = new Set(available);

  return selectRuntimeEnvFile({
    backendRoot: root,
    appEnv,
    explicitPath,
    exists: (file) => files.has(file),
    realpath: (file) => realpaths.get(file) ?? file,
  });
}

test("development selects only .env.development", () => {
  assert.equal(
    select("development", { available: [genericFile, developmentFile] }),
    developmentFile,
  );
});

test("generic .env is ignored for automatic selection", () => {
  for (const environment of ["test", "staging", "production"]) {
    assert.equal(select(environment, { available: [genericFile] }), null);
  }
});

test("missing .env.development throws even when generic .env exists", () => {
  assert.throws(
    () => select("development", { available: [genericFile] }),
    /Development environment file does not exist/,
  );
});

for (const environment of ["test", "staging", "production"]) {
  test(`${environment} does not auto-select an environment file`, () => {
    assert.equal(select(environment), null);
  });
}

for (const environment of [
  "development",
  "test",
  "staging",
  "production",
]) {
  test(`correct explicit filename works for ${environment}`, () => {
    const explicit = path.resolve(root, `.env.${environment}`);
    assert.equal(
      select(environment, { available: [explicit], explicitPath: explicit }),
      explicit,
    );
  });

  test(`missing explicit path throws for ${environment}`, () => {
    assert.throws(
      () => select(environment, { explicitPath: `.env.${environment}` }),
      /Explicit environment file does not exist/,
    );
  });
}

test("explicit generic .env is rejected", () => {
  assert.throws(
    () =>
      select("development", {
        available: [genericFile],
        explicitPath: genericFile,
      }),
    /must be \.env\.development directly inside/,
  );
});

for (const [environment, filename] of [
  ["development", ".env.production"],
  ["development", ".env.staging"],
  ["development", ".env.test"],
  ["development", ".env.custom"],
  ["staging", ".env.production"],
  ["production", ".env.staging"],
]) {
  test(`${environment} rejects explicit ${filename}`, () => {
    const candidate = path.resolve(root, filename);
    assert.throws(
      () =>
        select(environment, {
          available: [candidate],
          explicitPath: candidate,
        }),
      /directly inside the backend root/,
    );
  });
}

test("path traversal outside backend root is rejected", () => {
  const outside = path.resolve(root, "../.env.development");
  assert.throws(
    () =>
      select("development", {
        available: [outside],
        explicitPath: "../.env.development",
      }),
    /directly inside the backend root/,
  );
});

test("absolute path outside backend root is rejected", () => {
  const outside = "/outside/.env.production";
  assert.throws(
    () =>
      select("production", {
        available: [outside],
        explicitPath: outside,
      }),
    /directly inside the backend root/,
  );
});

test("symlink escaping backend root is rejected", () => {
  const link = path.resolve(root, ".env.staging");
  assert.throws(
    () =>
      select("staging", {
        available: [link],
        explicitPath: link,
        realpaths: new Map([[link, "/outside/.env.staging"]]),
      }),
    /directly inside the backend root/,
  );
});

test("correct real path directly inside backend root is accepted", () => {
  const link = path.resolve(root, "staging-link");
  const realFile = path.resolve(root, ".env.staging");
  assert.equal(
    select("staging", {
      available: [link],
      explicitPath: link,
      realpaths: new Map([[link, realFile]]),
    }),
    realFile,
  );
});

for (const environment of [undefined, "", "   ", "preview", "dev"]) {
  test(`unsupported APP_ENV ${JSON.stringify(environment)} throws`, () => {
    assert.throws(() => select(environment), /APP_ENV must be one of/);
  });
}
