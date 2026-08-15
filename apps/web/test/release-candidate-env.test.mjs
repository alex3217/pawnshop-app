import assert from "node:assert/strict";
import test from "node:test";

import { createReleaseCandidateChildEnv } from "../scripts/release-candidate-env.mjs";

test("release-candidate child env rejects poisoned parent credentials and deployments", () => {
  const child = createReleaseCandidateChildEnv({
    PATH: "/test/bin",
    HOME: "/test/home",
    DATABASE_URL: "postgresql://production.invalid/live",
    DIRECT_URL: "postgresql://production.invalid/direct",
    STRIPE_SECRET_KEY: "sk_live_poison",
    STRIPE_WEBHOOK_SECRET: "whsec_poison",
    AWS_ACCESS_KEY_ID: "poison",
    AWS_SECRET_ACCESS_KEY: "poison",
    CLOUDINARY_URL: "cloudinary://poison",
    REDIS_URL: "rediss://production.invalid",
    RENDER_API_KEY: "poison",
    VITE_API_BASE: "https://production.invalid/api",
    VITE_API_BASE_URL: "/conflicting-api",
    VITE_API_TARGET: "https://production.invalid",
  });

  assert.equal(child.PATH, "/test/bin");
  assert.equal(child.HOME, "/test/home");
  assert.equal(child.NODE_ENV, "test");
  assert.equal(child.VITE_API_BASE, "/api");
  assert.equal(child.VITE_API_BASE_URL, "/api");
  assert.equal(child.VITE_API_TARGET, "http://127.0.0.1:6002");

  for (const key of [
    "DATABASE_URL", "DIRECT_URL", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
    "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "CLOUDINARY_URL", "REDIS_URL",
    "RENDER_API_KEY",
  ]) {
    assert.equal(child[key], undefined, `${key} must not reach the test child`);
  }
});

test("release-candidate child env does not copy arbitrary parent values", () => {
  const child = createReleaseCandidateChildEnv({ PATH: "/test/bin", UNRELATED_SECRET: "poison" });
  assert.deepEqual(Object.hasOwn(child, "UNRELATED_SECRET"), false);
});
