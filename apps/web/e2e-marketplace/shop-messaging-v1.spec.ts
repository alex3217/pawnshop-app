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
    if (pathname === "/api/auth/shop-access") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access: { role: "OWNER", unrestricted: false, shopIds: [SHOP_ID], permissions: ["messages:read", "messages:write"], capabilities: { messagesRead: true, messagesWrite: true }, shops: [{ shopId: SHOP_ID, shopName: "Target Pawn", permissions: ["messages:read", "messages:write"] }] } }) });
    if (pathname === "/api/shops/mine") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ shops: [{ id: SHOP_ID, name: "Target Pawn" }] }) });
    if (pathname === "/api/shop-conversations/shops") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ conversations: [{ id: "target-conversation-1", subject: "Item opportunity: Camera", contactReason: "PAWN_ITEM", status: "OPEN", sellerUserId: "seller-1", seller: { id: "seller-1", name: "Seller One" }, shop: { id: SHOP_ID, name: "Target Pawn", city: "Austin", state: "TX" }, buyerItemSubmission: { id: "submission-1", title: "Camera" }, messages: [{ id: "message-1", senderUserId: "seller-1", body: "Is your shop interested?", readAt: null, createdAt: new Date().toISOString() }], updatedAt: new Date().toISOString() }] }) });
    if (pathname === "/api/notifications") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ notifications: [] }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
  });
}

test("owner composes an outbound customer message and sees the sent thread", async ({ page }) => {
  await installOwner(page, "light"); let posted = false;
  await page.route("**/api/shop-conversations/shop-recipients?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ recipients: [{ identifier: "member-alice", displayName: "Alice Seller", detail: "member-alice", type: "CUSTOMER" }] }) }));
  await page.route("**/api/shop-conversations/shop-compose", async (route) => { posted = true; expect(route.request().headers()["idempotency-key"]).toBeTruthy(); return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ conversation: { id: "outbound-1", subject: "Camera follow-up", contactReason: "OTHER", status: "OPEN", sellerUserId: "alice", seller: { id: "alice", name: "Alice Seller" }, shop: { id: SHOP_ID, name: "Target Pawn" }, messages: [{ id: "sent-1", senderUserId: "owner-1", body: "We have an update.", systemMetadata: { sentByShopId: SHOP_ID }, createdAt: new Date().toISOString() }], updatedAt: new Date().toISOString() } }) }); });
  await page.route("**/api/shop-conversations/outbound-1", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ side: "SHOP", conversation: { id: "outbound-1", subject: "Camera follow-up", contactReason: "OTHER", status: "OPEN", sellerUserId: "alice", seller: { id: "alice", name: "Alice Seller" }, shop: { id: SHOP_ID, name: "Target Pawn" }, messages: [{ id: "sent-1", senderUserId: "owner-1", body: "We have an update.", systemMetadata: { sentByShopId: SHOP_ID }, createdAt: new Date().toISOString() }], updatedAt: new Date().toISOString() } }) }));
  await page.goto("/owner/messages"); await page.getByRole("button", { name: "Compose message" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible(); await page.getByLabel("Recipient search").fill("Alice"); await page.getByRole("option", { name: /Alice Seller/ }).click(); await page.getByLabel("Subject or conversation topic").fill("Camera follow-up"); await page.getByRole("textbox", { name: "Message", exact: true }).fill("We have an update."); await expect(page.getByText("18 / 4000 characters")).toBeVisible(); await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => posted).toBe(true); await expect(page).toHaveURL(/\/owner\/messages\/outbound-1$/);
});

test("owner compose dialog is opaque, viewport-contained, and keeps recipient choices separated", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await installOwner(page, "light");
  await page.goto("/owner/messages");
  await page.getByRole("button", { name: "Compose message" }).first().click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Compose message" })).toBeVisible();

  const appearance = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      viewportHeight: window.innerHeight,
      backgroundColor: getComputedStyle(element).backgroundColor,
    };
  });
  expect(appearance.top).toBeGreaterThanOrEqual(8);
  expect(appearance.bottom).toBeLessThanOrEqual(appearance.viewportHeight - 8);
  expect(appearance.backgroundColor).toBe("rgb(255, 255, 255)");

  const options = dialog.locator("fieldset label");
  await expect(options).toHaveCount(2);
  const optionBoxes = await options.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    })
  );
  expect(optionBoxes[0].right).toBeLessThanOrEqual(optionBoxes[1].left);

  const cancel = dialog.getByRole("button", { name: "Cancel" });
  await cancel.scrollIntoViewIfNeeded();
  await expect(cancel).toBeInViewport();
});

test("multiple-shop selector is shown and read-only staff cannot compose", async ({ page }) => {
  await installOwner(page, "light");
  await page.route("**/api/shops/mine", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ shops: [{ id: SHOP_ID, name: "Target Pawn" }, { id: "shop-2", name: "Second Pawn" }] }) }));
  await page.route("**/api/auth/shop-access", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access: { role: "OWNER", shopIds: [SHOP_ID, "shop-2"], capabilities: { messagesRead: true, messagesWrite: true }, shops: [{ shopId: SHOP_ID, shopName: "Target Pawn", permissions: ["messages:write"] }, { shopId: "shop-2", shopName: "Second Pawn", permissions: ["messages:write"] }] } }) }));
  await page.goto("/owner/messages"); await page.getByRole("button", { name: "Compose message" }).first().click(); await expect(page.getByLabel("Sending shop")).toContainText("Second Pawn");
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.route("**/api/auth/shop-access", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access: { role: "STAFF", shopIds: [SHOP_ID], capabilities: { messagesRead: true, messagesWrite: false }, shops: [{ shopId: SHOP_ID, shopName: "Target Pawn", permissions: ["messages:read"] }] } }) })); await page.reload(); await expect(page.getByRole("button", { name: "Compose message" })).toHaveCount(0);
});

test("empty owner inbox offers compose", async ({ page }) => {
  await installOwner(page, "light"); await page.route("**/api/shop-conversations/shops?**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ conversations: [] }) })); await page.goto("/owner/messages");
  await expect(page.getByText("No conversations yet. Start a conversation or wait for a customer to contact your shop.")).toBeVisible(); await expect(page.locator(".messaging-empty").getByRole("button", { name: "Compose message" })).toBeEnabled();
});

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
