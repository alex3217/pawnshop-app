import { expect, test, type Page } from "@playwright/test";

const SHOP_ID = "message-shop-1";
async function installBuyer(page: Page, theme: "light" | "dark") {
  await page.addInitScript((activeTheme) => {
    localStorage.setItem("pawnloop-theme-v2", activeTheme);
    localStorage.setItem("auth_token", "messaging-buyer-token");
    localStorage.setItem("auth_role", "CONSUMER");
    localStorage.setItem("auth_user", JSON.stringify({ id: "seller-1", name: "Seller One", email: "seller@example.test", role: "CONSUMER" }));
  }, theme);
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/auth/shop-access") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access: { role: "CONSUMER", unrestricted: false, shopIds: [], permissions: [], capabilities: {}, shops: [] } }) });
    if (pathname === "/api/notifications") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ notifications: [] }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
  });
}

for (const theme of ["light", "dark"] as const) test(`seller composer supports ${theme} theme and mobile layout`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await installBuyer(page, theme); await page.goto(`/shops/${SHOP_ID}/message`);
  await expect(page.getByRole("heading", { name: "Message this pawnshop" })).toBeVisible();
  await expect(page.getByLabel("Contact reason")).toContainText("Pawn an item");
  await expect(page.locator(".messaging-panel").getByRole("link", { name: "Sell / Pawn Item" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const colors = await page.locator(".messaging-panel").evaluate((element) => { const style = getComputedStyle(element); return [style.color, style.backgroundColor]; });
  expect(colors[0]).not.toBe(colors[1]);
});

test("signed-out message action preserves the intended destination", async ({ page }) => {
  await page.goto(`/shops/${SHOP_ID}/message`);
  await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(`/shops/${SHOP_ID}/message`)}`));
});
