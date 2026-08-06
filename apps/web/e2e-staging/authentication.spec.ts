import { expect, test } from "@playwright/test";

import { installReadOnlyMutationGuard } from "./fixtures/destructive-action-guard";
import { performBuyerLogin, verifyBuyerSession } from "./fixtures/staging-auth";

test.describe("@readonly buyer authentication", () => {
  test("login page loads", async ({ baseURL, browser }) => {
    const context = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    const guard = await installReadOnlyMutationGuard(page);

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /welcome back to pawnloop/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();

    guard.assertNoBlockedMutations();
    await context.close();
  });

  test("missing session redirects a protected buyer route to login", async ({ baseURL, browser }) => {
    const context = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    const guard = await installReadOnlyMutationGuard(page);

    await page.goto("/watchlist", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login(?:[/?#]|$)/);

    guard.assertNoBlockedMutations();
    await context.close();
  });

  test("expired session redirects a protected buyer route to login", async ({ baseURL, browser }) => {
    const context = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    await context.addInitScript(() => {
      const encode = (value: object) =>
        window.btoa(JSON.stringify(value)).replaceAll("=", "");
      const expiredToken = `${encode({ alg: "none", typ: "JWT" })}.${encode({ role: "CONSUMER", exp: 1 })}.unsigned`;
      window.localStorage.setItem("auth_token", expiredToken);
      window.localStorage.setItem("auth_role", "CONSUMER");
    });
    const page = await context.newPage();
    const guard = await installReadOnlyMutationGuard(page);

    await page.goto("/watchlist", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login(?:[/?#]|$)/);

    guard.assertNoBlockedMutations();
    await context.close();
  });

  test("buyer can log in and reach the buyer dashboard", async ({ baseURL, browser }) => {
    const context = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    const guard = await installReadOnlyMutationGuard(page, {
      allowAuthenticationLogin: true,
    });

    await performBuyerLogin(page);
    await verifyBuyerSession(page);

    guard.assertNoBlockedMutations();
    await context.close();
  });

  test("logout clears the browser session", async ({ page }) => {
    const guard = await installReadOnlyMutationGuard(page);

    await page.goto("/buyer/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/\/login(?:[/?#]|$)/);
    await page.getByRole("button", { name: /^logout$/i }).first().click();
    await expect(page).toHaveURL(/\/login\/?$/);

    await page.goto("/watchlist", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login(?:[/?#]|$)/);

    guard.assertNoBlockedMutations();
  });
});
