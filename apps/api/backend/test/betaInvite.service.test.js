import assert from "node:assert/strict";
import test from "node:test";
import {
  assertInviteEligible,
  digestInviteToken,
  isInviteEnforcementEnabled,
  issueBetaInvite,
  safeInvite,
} from "../src/services/betaInvite.service.js";

test("invite enforcement requires an explicit boolean value", () => {
  assert.equal(isInviteEnforcementEnabled({ INVITE_ONLY_REGISTRATION_ENABLED: "true" }), true);
  assert.equal(isInviteEnforcementEnabled({ INVITE_ONLY_REGISTRATION_ENABLED: "false" }), false);
  assert.equal(isInviteEnforcementEnabled({}), false);
  assert.throws(
    () => isInviteEnforcementEnabled({ INVITE_ONLY_REGISTRATION_ENABLED: "yes" }),
    /must be explicitly true or false/,
  );
});

test("invite token digest is deterministic SHA-256 and safe responses omit it", () => {
  const token = "raw-private-invite-token";
  assert.match(digestInviteToken(token), /^[a-f0-9]{64}$/);
  assert.notEqual(digestInviteToken(token), token);
  const response = safeInvite({
    id: "invite_1",
    tokenDigest: digestInviteToken(token),
    email: null,
    intendedRole: null,
    cohort: "cohort-a",
    maxUses: 2,
    redeemedCount: 1,
    expiresAt: new Date(),
    revokedAt: null,
    revokedByUserId: null,
    issuedByUserId: "admin_1",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  assert.equal(response.remainingUses, 1);
  assert.equal("tokenDigest" in response, false);
  assert.equal(JSON.stringify(response).includes(token), false);
});

test("issuance stores only a digest and audits non-sensitive metadata", async () => {
  const writes = {};
  const prisma = {
    $transaction: async (callback) => callback({
      betaInvite: {
        create: async ({ data }) => {
          writes.invite = data;
          return { id: "invite_1", redeemedCount: 0, revokedAt: null, revokedByUserId: null, createdAt: new Date(), updatedAt: new Date(), ...data };
        },
      },
      superAdminAuditLog: {
        create: async ({ data }) => {
          writes.audit = data;
          return data;
        },
      },
    }),
  };
  const result = await issueBetaInvite(prisma, {
    cohort: "Founders",
    email: " PERSON@EXAMPLE.COM ",
    intendedRole: "OWNER",
    maxUses: 2,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }, {
    id: "admin_1",
    email: "admin@example.com",
    role: "SUPER_ADMIN",
  });

  assert.equal(typeof result.token, "string");
  assert.equal(writes.invite.email, "person@example.com");
  assert.equal(writes.invite.tokenDigest, digestInviteToken(result.token));
  assert.equal(JSON.stringify(writes).includes(result.token), false);
  assert.equal(writes.audit.action, "BETA_INVITE_ISSUED");
});

test("eligibility distinguishes expired, revoked, exhausted, email, and role failures", () => {
  const base = {
    email: null,
    intendedRole: null,
    maxUses: 1,
    redeemedCount: 0,
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
  };
  assert.doesNotThrow(() => assertInviteEligible(base, {
    email: "person@example.com",
    role: "CONSUMER",
  }));

  const cases = [
    [null, "INVALID_INVITE"],
    [{ ...base, revokedAt: new Date() }, "INVITE_REVOKED"],
    [{ ...base, expiresAt: new Date(Date.now() - 1) }, "INVITE_EXPIRED"],
    [{ ...base, redeemedCount: 1 }, "INVITE_EXHAUSTED"],
    [{ ...base, email: "other@example.com" }, "INVITE_EMAIL_MISMATCH"],
    [{ ...base, intendedRole: "OWNER" }, "INVITE_ROLE_MISMATCH"],
  ];
  for (const [invite, code] of cases) {
    assert.throws(
      () => assertInviteEligible(invite, {
        email: "person@example.com",
        role: "CONSUMER",
      }),
      (error) => error.code === code,
    );
  }
});
