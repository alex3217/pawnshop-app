import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveBuildEnvironment } from "../scripts/build.mjs";

const viteConfig = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");

test("bare local builds fail closed without an explicit contract", () => {
  assert.throws(
    () => resolveBuildEnvironment({ PATH: "/test" }),
    /deployEnv must be preview, staging, or production/,
  );
});

test("generic CI builds fail closed without an explicit contract", () => {
  assert.throws(
    () => resolveBuildEnvironment({ CI: "true" }),
    /deployEnv must be preview, staging, or production/,
  );
});

test("Cloudflare Pages builds fail closed without an explicit contract", () => {
  assert.throws(
    () => resolveBuildEnvironment({ CI: "true", CF_PAGES: "1" }),
    /deployEnv must be preview, staging, or production/,
  );
});

test("partial provider contracts fail before build execution", () => {
  assert.throws(
    () => resolveBuildEnvironment({ VITE_DEPLOY_ENV: "preview" }),
    /apiOrigin is required/,
  );
});

test("complete explicit Preview contracts are preserved", () => {
  const input = {
    VITE_DEPLOY_ENV: "preview",
    VITE_API_ORIGIN: "https://pawnshop-staging-api.onrender.com",
    VITE_API_BASE: "/api",
    VITE_SOCKET_URL: "https://pawnshop-staging-api.onrender.com",
    VITE_SOCKET_PATH: "/socket.io",
  };
  assert.deepEqual(resolveBuildEnvironment(input), input);
});

test("complete explicit Production and staging contracts are preserved", () => {
  for (const [deployEnv, origin] of [
    ["production", "https://api.pawnloop.com"],
    ["staging", "https://pawnshop-staging-api.onrender.com"],
  ]) {
    const input = {
      VITE_DEPLOY_ENV: deployEnv,
      VITE_API_ORIGIN: origin,
      VITE_API_BASE: "/api",
      VITE_SOCKET_URL: origin,
      VITE_SOCKET_PATH: "/socket.io",
    };
    assert.deepEqual(resolveBuildEnvironment(input), input);
  }
});

test("frontend release artifact is bounded and binds the immutable build SHA", () => {
  assert.match(
    viteConfig,
    /CF_PAGES_COMMIT_SHA[\s\S]*env\.GITHUB_SHA[\s\S]*env\.RENDER_GIT_COMMIT[\s\S]*env\.VITE_RELEASE_SHA/,
  );
  assert.match(viteConfig, /fileName: "release\.json"/);
  assert.match(viteConfig, /JSON\.stringify\(\{ revision, generatedAt:/);
  assert.match(viteConfig, /Buffer\.byteLength\(artifact\) > 1024/);
});

test("frontend release artifact rejects mutable or missing revisions", () => {
  assert.match(viteConfig, /const SHA = \/\^\[0-9a-f\]\{40\}\$\//);
  assert.match(viteConfig, /Frontend builds require an exact lowercase 40-character release SHA/);
});
