import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { test as setup } from "@playwright/test";

import {
  buyerStorageStatePath,
  performBuyerLogin,
  verifyBuyerSession,
} from "./fixtures/staging-auth";
import { installReadOnlyMutationGuard } from "./fixtures/destructive-action-guard";

setup("authenticate buyer", async ({ page }) => {
  const guard = await installReadOnlyMutationGuard(page, {
    allowAuthenticationLogin: true,
  });

  await performBuyerLogin(page);
  await verifyBuyerSession(page);
  await mkdir(dirname(buyerStorageStatePath), { recursive: true });
  await page.context().storageState({ path: buyerStorageStatePath });

  guard.assertNoBlockedMutations();
});
