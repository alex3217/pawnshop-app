import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("auth_token", "consumer-messaging-browser-token");
    localStorage.setItem("auth_role", "CONSUMER");
    localStorage.setItem("auth_user", JSON.stringify({ id: "buyer-1", name: "Buyer", email: "private@example.test", role: "CONSUMER" }));
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path === "/api/auth/me" ? { success: true, user: { id: "buyer-1", name: "Buyer", email: "private@example.test", role: "CONSUMER" } } : path === "/api/shop-conversations/seller" ? { success: true, conversations: [], pagination: { page: 1, limit: 25, total: 0, pages: 0 } } : path === "/api/shop-conversations/consumer-recipients" ? { success: true, recipients: [{ identifier: "shop-1", displayName: "Loop Pawn", detail: "Austin, TX", type: "SHOP" }] } : { success: true, notifications: [], unreadCount: 0 };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
});

test("consumer inbox defaults to Open and compose is accessible and responsive", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/messages");
  await expect(page.getByLabel("Inbox filter")).toHaveValue("OPEN");
  for (const option of ["Open", "Unread", "Closed", "Blocked", "Archived"]) await expect(page.getByRole("option", { name: option })).toBeAttached();
  await expect(page.getByRole("button", { name: "New Message" }).first()).toBeVisible();
  await page.goto("/messages?compose=1");
  await expect(page.getByRole("dialog", { name: "New message" })).toBeVisible();
  for (const mode of ["Pawnshop", "Marketplace seller", "Existing contact"]) await expect(page.getByLabel(mode)).toBeVisible();
  await expect(page.getByText("email and phone are not shared", { exact: false })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
  const results = await new AxeBuilder({ page }).include(".compose-dialog").analyze();
  expect(results.violations).toEqual([]);
});

test("messaging panel and compose dialog follow dark theme", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("pawnloop-theme-v2", "dark"));
  await page.goto("/messages?compose=1");
  await expect(page.getByRole("dialog", { name: "New message" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const scheme = await page.locator(".compose-dialog").evaluate((element) => getComputedStyle(element).colorScheme);
  expect(scheme).toContain("dark");
});
