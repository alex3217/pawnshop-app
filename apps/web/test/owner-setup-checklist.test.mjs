import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { OWNER_SETUP_CHECKLIST, calculateOwnerSetupProgress } from "../../../shared/ownerSetupChecklist.mjs";

test("canonical owner checklist has unique editable routes and derives persisted progress", () => {
  assert.equal(OWNER_SETUP_CHECKLIST.length, 9);
  assert.equal(new Set(OWNER_SETUP_CHECKLIST.map((item) => item.id)).size, 9);
  assert.ok(OWNER_SETUP_CHECKLIST.every((item) => item.href.includes("/") && item.href.includes("#")));

  const facts = Object.fromEntries(OWNER_SETUP_CHECKLIST.map((item) => [item.completionKey, true]));
  const complete = calculateOwnerSetupProgress({ ...facts, launched: true });
  assert.equal(complete.completedCount, complete.totalCount);
  assert.equal(complete.readyToLaunch, true);
  assert.equal(complete.launched, true);

  const afterReload = calculateOwnerSetupProgress({ ...facts, inventory: false, launched: false });
  assert.equal(afterReload.completedCount, complete.totalCount - 1);
  assert.equal(afterReload.readyToLaunch, false);
});

test("owner setup surfaces use canonical API progress and action copy", async () => {
  const [floating, wizard, client] = await Promise.all([
    readFile(new URL("../src/components/onboarding/RoleSetupChecklist.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/onboarding/OwnerLaunchReadiness.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/services/apiClient.ts", import.meta.url), "utf8"),
  ]);
  assert.match(floating, /getShopOnboardingProgress/);
  assert.match(floating, /const version = \+\+refreshVersion/);
  assert.match(floating, /version !== refreshVersion/);
  assert.match(floating, /refreshVersion \+= 1;\s*controller\.abort\(\)/);
  assert.match(wizard, /item\.complete \? "Edit" : "Complete setup"/);
  assert.match(client, /res\.status === 401/);
  assert.match(client, /handleAuthenticationFailure/);
  assert.doesNotMatch(client, /res\.status === 403[\s\S]*handleAuthenticationFailure/);
});

test("owner onboarding stops loading and offers retry after an API failure", async () => {
  const page = await readFile(
    new URL("../src/pages/OwnerOnboardingPage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /finally\s*\{[\s\S]*setLoading\(false\)/);
  assert.match(page, />\s*Try again\s*</);
  assert.match(page, /setLoadAttempt\(\(attempt\) => attempt \+ 1\)/);
});
