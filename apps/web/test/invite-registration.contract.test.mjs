import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const registerPage = readFileSync(
  new URL("../src/pages/RegisterPage.tsx", import.meta.url),
  "utf8",
);
const authService = readFileSync(
  new URL("../src/services/auth.ts", import.meta.url),
  "utf8",
);

test("shared buyer and owner registration form collects a temporary invite code", () => {
  assert.match(registerPage, /useState\(""\).*inviteToken|inviteToken.*useState\(""\)/s);
  assert.match(registerPage, /id="register-invite-token"/);
  assert.match(registerPage, /value=\{inviteToken\}/);
  assert.match(registerPage, /autoComplete="off"/);
  assert.match(registerPage, /spellCheck=\{false\}/);
  assert.doesNotMatch(
    registerPage,
    /id="register-invite-token"[\s\S]{0,300}\brequired\b/,
  );
  assert.match(registerPage, /<option value="CONSUMER">/);
  assert.match(registerPage, /<option value="OWNER">/);
  assert.match(registerPage, /acceptedLegal,\s*trimmedInviteToken,/);
});

test("auth registration submits inviteToken for both public roles without persistence", () => {
  assert.match(
    authService,
    /role,\s*inviteToken: inviteToken\.trim\(\),\s*legalConsent:/,
  );
  const inviteStorageLines = `${registerPage}\n${authService}`
    .split("\n")
    .filter(
      (line) =>
        /inviteToken/i.test(line) &&
        /(localStorage|sessionStorage|document\.cookie)/.test(line),
    );
  assert.deepEqual(inviteStorageLines, []);

  for (const role of ["CONSUMER", "OWNER"]) {
    const payload = {
      name: "Test User",
      email: "person@example.test",
      password: "TestPassword123!",
      role,
      inviteToken: "temporary-invite",
    };
    assert.equal(payload.inviteToken, "temporary-invite");
    assert.equal(payload.role, role);
  }
});

test("owner entry links select the owner role without carrying an invite in the URL", () => {
  assert.match(
    registerPage,
    /searchParams\.get\("role"\).*=== "owner"[\s\S]*\? "OWNER"/,
  );
  assert.doesNotMatch(registerPage, /searchParams\.get\(["']invite/i);
});
