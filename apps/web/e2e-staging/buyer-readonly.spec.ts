import { expect, test, type Page } from "@playwright/test";

import {
  buyerForbiddenRoutes,
  buyerReadOnlyRoutes,
} from "./fixtures/buyer-routes";
import { installReadOnlyMutationGuard } from "./fixtures/destructive-action-guard";

const LOGIN_URL = /\/login(?:[/?#]|$)/;
const FATAL_STATE = /(?:access denied|not authorized|unauthorized|forbidden|unexpected error|something went wrong|application error)/i;

async function expectHealthyAuthenticatedPage(page: Page) {
  await expect(page).not.toHaveURL(LOGIN_URL);
  await expect(page.locator("body")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(FATAL_STATE);
}

test.describe("@readonly buyer route smoke", () => {
  for (const route of buyerReadOnlyRoutes) {
    test(`${route.label} loads without mutation`, async ({ page }) => {
      const guard = await installReadOnlyMutationGuard(page);

      await page.goto(route.path, { waitUntil: "domcontentloaded" });
      await expectHealthyAuthenticatedPage(page);

      guard.assertNoBlockedMutations();
    });
  }

  test("an existing marketplace item detail is readable when discoverable", async ({ page }) => {
    const guard = await installReadOnlyMutationGuard(page);

    await page.goto("/marketplace", { waitUntil: "domcontentloaded" });
    await expectHealthyAuthenticatedPage(page);

    const itemLinks = page.locator('a[href^="/items/"]');
    if ((await itemLinks.count()) > 0) {
      const href = await itemLinks.first().getAttribute("href");
      if (href && /^\/items\/[^/?#]+$/.test(href)) {
        await page.goto(href, { waitUntil: "domcontentloaded" });
        await expectHealthyAuthenticatedPage(page);
      }
    }

    guard.assertNoBlockedMutations();
  });

  for (const forbiddenPath of buyerForbiddenRoutes) {
    test(`buyer cannot enter ${forbiddenPath}`, async ({ page }) => {
      const guard = await installReadOnlyMutationGuard(page);

      await page.goto(forbiddenPath, { waitUntil: "domcontentloaded" });
      await expect(page).not.toHaveURL(new RegExp(`${forbiddenPath}/?$`));
      await expect(page).not.toHaveURL(LOGIN_URL);

      guard.assertNoBlockedMutations();
    });
  }
});
