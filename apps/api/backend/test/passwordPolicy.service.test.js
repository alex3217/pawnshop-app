import assert from "node:assert/strict";
import test from "node:test";
import { PasswordPolicyError, validatePassword } from "../src/services/passwordPolicy.service.js";

function rejects(code, password, email = "person@example.test") {
  assert.throws(
    () => validatePassword(password, { email }),
    (error) => error instanceof PasswordPolicyError && error.code === code,
  );
}

test("password policy enforces minimum and maximum length", () => {
  rejects("PASSWORD_TOO_SHORT", "12345678901");
  assert.equal(validatePassword("x".repeat(12)), "x".repeat(12));
  assert.equal(validatePassword("x".repeat(128)), "x".repeat(128));
  rejects("PASSWORD_TOO_LONG", "x".repeat(129));
});

test("password policy permits spaces and Unicode", () => {
  const password = "  café 密碼 phrase  ";
  assert.equal(validatePassword(password), password);
});

test("password policy never silently trims", () => {
  const password = "  keep spaces  ";
  assert.equal(validatePassword(password), password);
  rejects("PASSWORD_TOO_SHORT", " 12345678  ");
  assert.equal(validatePassword("          ok"), "          ok");
});

test("password policy rejects known placeholder values", () => {
  rejects("PASSWORD_PLACEHOLDER", "password");
  rejects("PASSWORD_PLACEHOLDER", "Password123!");
  rejects("PASSWORD_PLACEHOLDER", "temporarypassword");
  rejects("PASSWORD_PLACEHOLDER", "  Password123!  ");
  rejects("PASSWORD_PLACEHOLDER", "SuperAdmin123!");
});

test("password policy rejects email-derived passwords", () => {
  rejects("PASSWORD_EMAIL_DERIVED", "PERSON@example.test", " Person@Example.Test ");
  rejects("PASSWORD_EMAIL_DERIVED", "prefix-person@example.test-suffix", "person@example.test");
});
