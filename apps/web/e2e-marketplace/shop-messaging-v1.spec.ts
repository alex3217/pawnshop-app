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

async function installOwner(page: Page, theme: "light" | "dark") {
  await page.addInitScript((activeTheme) => {
    localStorage.setItem("pawnloop-theme-v2", activeTheme);
    localStorage.setItem("auth_token", "messaging-owner-token");
    localStorage.setItem("auth_role", "OWNER");
    localStorage.setItem("auth_user", JSON.stringify({ id: "owner-1", name: "Owner One", email: "owner@example.test", role: "OWNER", ownerApplication: { id: "application-1", status: "APPROVED" } }));
    localStorage.setItem("pawnloop-navigation-assistance-OWNER-v2", JSON.stringify({ automaticPrompts: false, completedTopics: ["full-tour"], dismissedGuidance: true, floatingButtonVisible: false }));
  }, theme);
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/api/auth/shop-access") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access: { role: "OWNER", unrestricted: false, shopIds: [SHOP_ID], permissions: ["messages:read", "messages:write"], capabilities: { messagesRead: true, messagesWrite: true }, shops: [{ id: SHOP_ID, name: "Target Pawn" }] } }) });
    if (pathname === "/api/shops/mine") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ shops: [{ id: SHOP_ID, name: "Target Pawn" }] }) });
    if (pathname === "/api/shop-conversations/shops") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ conversations: [{ id: "target-conversation-1", subject: "Item opportunity: Camera", contactReason: "PAWN_ITEM", status: "OPEN", sellerUserId: "seller-1", seller: { id: "seller-1", name: "Seller One" }, shop: { id: SHOP_ID, name: "Target Pawn", city: "Austin", state: "TX" }, buyerItemSubmission: { id: "submission-1", title: "Camera" }, messages: [{ id: "message-1", senderUserId: "seller-1", body: "Is your shop interested?", readAt: null, createdAt: new Date().toISOString() }], updatedAt: new Date().toISOString() }] }) });
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

for (const theme of ["light", "dark"] as const) test(`targeted opportunity appears in the owner inbox in ${theme} theme on mobile`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await installOwner(page, theme); await page.goto("/owner/messages");
  await expect(page.getByRole("heading", { name: "Shop Messages" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Seller One Item opportunity: Camera/ })).toBeVisible();
  await expect(page.getByText("Is your shop interested?")).toBeVisible();
  await expect(page.locator(".unread-badge")).toHaveText("Unread");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
});
