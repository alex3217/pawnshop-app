import { expect, test, type Locator, type Page } from "@playwright/test";

const supportedBuyerLinks = [
  ["Buyer Dashboard", "/buyer/dashboard"],
  ["My Bids", "/my-bids"],
  ["My Wins", "/my-wins"],
  ["My Purchases", "/marketplace/purchases"],
  ["Offers", "/offers"],
  ["Watchlist", "/watchlist"],
  ["Saved Searches", "/saved-searches"],
  ["My Listings", "/marketplace/listings/mine"],
  ["Create Listing", "/marketplace/listings/new"],
  ["Payment Methods", "/account/payment-methods"],
  ["Knowledge Center", "/knowledge"],
] as const;

async function installBuyer(page: Page, theme: "light" | "dark" = "light") {
  await page.addInitScript((activeTheme) => {
    localStorage.setItem("pawnloop-theme-v2", activeTheme);
    localStorage.setItem("auth_token", "buyer-parity-test-token");
    localStorage.setItem("auth_role", "CONSUMER");
    localStorage.setItem("auth_user", JSON.stringify({
      id: "buyer-parity", name: "Buyer Parity", email: "buyer@example.test", role: "CONSUMER",
    }));
    localStorage.setItem("pawnloop-navigation-assistance-CONSUMER-v2", JSON.stringify({
      automaticPrompts: false, completedTopics: [], dismissedGuidance: true, floatingButtonVisible: false,
    }));
  }, theme);
  await page.route("**/api/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true, items: [], rows: [], data: [], shops: [], capabilities: {},
      notifications: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 0 },
    }),
  }));
}

async function contrastRatio(locator: Locator) {
  return locator.evaluate((element) => {
    const parse = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    const luminance = (value: string) => {
      const channels = parse(value).map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const style = getComputedStyle(element);
    const foreground = luminance(style.color);
    const background = luminance(style.backgroundColor);
    return {
      foreground: style.color,
      background: style.backgroundColor,
      ratio: (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05),
    };
  });
}

test("CONSUMER Buyer Tools exposes every supported unchanged URL and no privileged control", async ({ page }) => {
  await installBuyer(page);
  await page.goto("/marketplace");
  const menu = page.locator(".site-workspace-menu");
  await menu.locator("summary").click();
  for (const [label, path] of supportedBuyerLinks) {
    await expect(menu.getByRole("link", { name: label, exact: true })).toHaveAttribute("href", path);
  }
  for (const privileged of ["Owner Tools", "Admin Tools", "Platform Tools", "Create Auction", "Staff", "Platform Settings"]) {
    await expect(page.getByText(privileged, { exact: true })).toHaveCount(0);
  }
});

test("Buyer Tools supports keyboard, Escape, outside click, focus return, and viewport containment", async ({ page }) => {
  await installBuyer(page);
  await page.goto("/marketplace");
  const menu = page.locator(".site-workspace-menu");
  const trigger = menu.locator("summary");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveAttribute("open", "");
  const box = await menu.locator(".site-workspace-panel").boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.keyboard.press("Escape");
  await expect(menu).not.toHaveAttribute("open", "");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.locator("main").click({ position: { x: 5, y: 5 } });
  await expect(menu).not.toHaveAttribute("open", "");
});

test("desktop header and mobile buyer navigation stay within the viewport", async ({ page }) => {
  await installBuyer(page);
  await page.goto("/marketplace");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
  await page.setViewportSize({ width: 375, height: 760 });
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.locator('summary[aria-label="Toggle navigation menu"]').click();
  const mobile = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(mobile).toBeVisible();
  for (const [label, path] of supportedBuyerLinks) {
    await expect(mobile.getByRole("link", { name: label, exact: true })).toHaveAttribute("href", path);
  }
});

for (const theme of ["light", "dark"] as const) {
  test(`Knowledge Center empty state and controls are readable in ${theme} mode`, async ({ page }) => {
    await installBuyer(page, theme);
    await page.goto("/knowledge");
    const empty = page.getByRole("status").filter({ hasText: "No lessons found" });
    await expect(empty).toBeVisible();
    await expect(empty.getByRole("heading", { name: "No lessons found" })).toBeVisible();
    await expect(empty).toContainText("No published lessons are available");
    const search = page.getByRole("button", { name: "Search", exact: true });
    await expect(search).toBeEnabled();
    const contrast = await contrastRatio(search);
    expect(contrast.ratio, `${contrast.foreground} on ${contrast.background}`).toBeGreaterThanOrEqual(4.5);
    await search.focus();
    await expect(search).toBeFocused();
    expect(await search.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  });
}
