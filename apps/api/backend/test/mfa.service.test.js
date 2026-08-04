import assert from "node:assert/strict";
import test from "node:test";
import {
  allowlistedMfaAuditMetadata,
  createMfaAuditEvent,
} from "../src/services/mfaAudit.service.js";

test("MFA audit metadata is allowlisted and drops nested or secret-bearing input", () => {
  const metadata = allowlistedMfaAuditMetadata({
    outcome: "failed",
    purpose: "LOGIN",
    attemptsRemaining: 2,
    token: "challenge-secret",
    code: "123456",
    password: "hidden",
    requestBody: { authorization: "Bearer hidden" },
    recoveryCodes: ["hidden"],
  });
  assert.deepEqual(metadata, {
    outcome: "failed",
    purpose: "LOGIN",
    attemptsRemaining: 2,
  });
  assert.doesNotMatch(JSON.stringify(metadata), /challenge-secret|123456|Bearer|hidden/);
  assert.throws(
    () => allowlistedMfaAuditMetadata({ outcome: "submitted-code-123456" }),
    /Unsafe MFA audit metadata/,
  );
});

test("MFA audit helper persists only stable identity, action, and safe metadata", async () => {
  let data;
  await createMfaAuditEvent(
    { superAdminAuditLog: { create: async (input) => { data = input.data; return input.data; } } },
    {
      event: "CHALLENGE_FAILED",
      actorId: "actor",
      actorRole: "ADMIN",
      targetUserId: "target",
      success: false,
      metadata: { reason: "invalid_code", code: "654321" },
    },
  );
  assert.equal(data.action, "MFA_CHALLENGE_FAILED");
  assert.equal(data.targetId, "target");
  assert.equal(data.actorRole, "ADMIN");
  assert.deepEqual(data.metadata, { reason: "invalid_code" });
  assert.doesNotMatch(JSON.stringify(data), /654321/);
});
