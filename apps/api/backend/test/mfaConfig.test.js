import assert from "node:assert/strict";
import test from "node:test";
import { loadMfaConfig } from "../src/config/mfa.js";

const key = Buffer.alloc(32, 7).toString("base64");

test("MFA configuration defaults to dormant and never falls back to auth secrets", () => {
  const config = loadMfaConfig({ MFA_ENCRYPTION_KEY: key });
  assert.equal(config.rolloutMode, "disabled");
  assert.equal(config.challengeTtlSeconds, 300);
  assert.equal(config.challengeAttempts, 5);
  assert.equal(config.encryptionKey.length, 32);
  const dormant = loadMfaConfig({ JWT_SECRET: key });
  assert.equal(dormant.rolloutMode, "disabled");
  assert.equal(dormant.encryptionKey, null);
  assert.throws(
    () => loadMfaConfig({ JWT_SECRET: key, MFA_MODE: "optional" }),
    /MFA_ENCRYPTION_KEY is required/,
  );
});

test("MFA configuration rejects malformed keys and rollout modes", () => {
  assert.throws(
    () => loadMfaConfig({ MFA_ENCRYPTION_KEY: "not-base64" }),
    /exactly 32 bytes/,
  );
  assert.throws(
    () => loadMfaConfig({
      MFA_ENCRYPTION_KEY: key,
      MFA_MODE: "enforced-ish",
    }),
    /disabled, optional, or required/,
  );
  assert.throws(
    () => loadMfaConfig({
      MFA_ENCRYPTION_KEY: key,
      MFA_CHALLENGE_TTL_SECONDS: "301",
    }),
    /must not exceed 300/,
  );
  assert.throws(
    () => loadMfaConfig({
      MFA_ENCRYPTION_KEY: key,
      MFA_CHALLENGE_ATTEMPTS: "6",
    }),
    /must not exceed 5/,
  );
});
