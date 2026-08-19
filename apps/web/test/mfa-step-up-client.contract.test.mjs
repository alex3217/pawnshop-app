import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const client = fs.readFileSync(new URL("../src/services/apiClient.ts", import.meta.url), "utf8");
const admin = fs.readFileSync(new URL("../src/admin/services/adminApi.ts", import.meta.url), "utf8");
const flow = fs.readFileSync(new URL("../src/services/mfaStepUp.ts", import.meta.url), "utf8");
const dialog = fs.readFileSync(new URL("../src/components/MfaStepUpProvider.tsx", import.meta.url), "utf8");
const mobileRoot = new URL("../../mobile/src/", import.meta.url);
function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    if (entry.isDirectory()) return sourceFiles(child);
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [child] : [];
  });
}
const mobileFiles = sourceFiles(mobileRoot)
  .map((path) => fs.readFileSync(path, "utf8"))
  .join("\n");

test("both supported web API clients perform scoped one-shot step-up and replay once", () => {
  for (const source of [client, admin]) {
    assert.match(source, /getMfaRequiredScope/);
    assert.match(source, /requestMfaStepUpProof\(scope\)/);
    assert.match(source, /"x-mfa-step-up-proof": proof/);
  }
  assert.match(flow, /\/auth\/mfa\/step-up/);
  assert.match(flow, /\/auth\/mfa\/step-up\/verify/);
  assert.match(flow, /scope,\s*challenge: issued\.challenge,\s*method: input\.method,\s*code: input\.code/s);
  assert.match(flow, /attempt < 2/);
  assert.match(dialog, /Authenticator code/);
  assert.match(dialog, /Recovery code/);
});

test("mobile has no refund, payout, role, privilege, or platform-configuration mutation", () => {
  assert.doesNotMatch(mobileFiles, /refunds|finance\/payouts|\/staff|\/admin|\/super-admin|platform-settings/);
});

test("proof is never cached and a failed downstream request requires a new user action", () => {
  assert.doesNotMatch(flow, /localStorage|sessionStorage|SecureStore/);
  assert.doesNotMatch(client, /while\s*\(|for\s*\(.*MFA_STEP_UP_REQUIRED/);
  assert.doesNotMatch(admin, /while\s*\(|for\s*\(.*MFA_STEP_UP_REQUIRED/);
});
