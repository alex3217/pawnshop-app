import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const registerPage = readFileSync(
  new URL("../src/pages/RegisterPage.tsx", import.meta.url),
  "utf8",
);
const verificationPendingPage = readFileSync(
  new URL("../src/pages/VerificationPendingPage.tsx", import.meta.url),
  "utf8",
);
const authService = readFileSync(
  new URL("../src/services/auth.ts", import.meta.url),
  "utf8",
);

test("registration loading clears after success", () => {
  assert.match(registerPage, /setSubmitting\(true\)[\s\S]*try\s*\{/);
  assert.match(
    registerPage,
    /await register\([\s\S]*nav\("\/verification-pending"[\s\S]*finally\s*\{\s*setSubmitting\(false\)/,
  );
  assert.match(registerPage, /submitting\s*\?\s*"Creating account…"/);
});

test("registration loading clears after API failure", () => {
  assert.match(
    registerPage,
    /catch\s*\([^)]*\)\s*\{[\s\S]*setError[\s\S]*\}\s*finally\s*\{\s*setSubmitting\(false\)/,
  );
});

test("emailDelivery FAILED presents the account-created resend message", () => {
  assert.match(authService, /emailDelivery:\s*"SENT"\s*\|\s*"FAILED"/);
  assert.match(authService, /VERIFICATION_EMAIL_DELIVERY_FAILED/);
  assert.match(registerPage, /emailDelivery:\s*result\.emailDelivery/);
  assert.match(
    verificationPendingPage,
    /Your account was created, but we could not send the verification email\. Please request another verification email\./,
  );
});

test("resend-verification success presents the API message and stops loading", () => {
  assert.match(
    verificationPendingPage,
    /import\s*\{\s*resendVerification\s*\}\s*from\s*"\.\.\/services\/auth"/,
  );
  assert.match(verificationPendingPage, /await resendVerification\(email\)/);
  assert.match(verificationPendingPage, /setMessage\(String\(result\.message/);
  assert.match(verificationPendingPage, /"Resend verification"/);
  assert.match(verificationPendingPage, /finally\s*\{\s*setLoading\(false\)/);
});

test("resend-verification failure presents a useful error and stops loading", () => {
  assert.match(
    verificationPendingPage,
    /catch\s*\(cause\)\s*\{\s*setError\(cause instanceof Error \? cause\.message : "Unable to resend verification\."\)/,
  );
  assert.match(
    verificationPendingPage,
    /finally\s*\{\s*setLoading\(false\)/,
  );
});
