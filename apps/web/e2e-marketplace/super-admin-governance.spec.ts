import { expect, test } from "@playwright/test";

const user = { publicDisplayName: "Taylor", pawnLoopIdentifier: "pl_taylor", privateEmail: "taylor@example.test", internalId: "user-1", accountStatus: "ACTIVE", role: "CONSUMER", messagingRestricted: false, shopInitiatedContactDisabled: false, discoverabilityRestricted: false, messagingEligibility: { allowed: false, policy: "MOST_RESTRICTIVE", factors: { accountState: true, userConsent: false, blocking: true, administrativeRestriction: true, messagingContextAuthorization: true } }, publicDiscoverability: { effective: true }, firstContactConsent: { state: "DISABLED" }, administrativeRestrictions: null, shops: [], memberships: [], blockingAndReports: { blockedConversationCount: 0, reportCount: 0 }, governanceHistory: [] };
const conversation = { id: "conversation-1", subject: "Listing question", status: "OPEN", moderationState: "NONE", shopId: "shop-1", sellerUserId: "user-1", recipientShopId: "shop-2", contextType: "LISTING", contextReferenceId: "listing-1", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), messageCount: 2, reportCount: 1, participantAuthorization: { seller: true, primaryShop: true, recipientShop: true, contextAuthorized: true }, messageBodiesIncluded: false };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem("auth_token", "super-admin-token"); localStorage.setItem("auth_role", "SUPER_ADMIN"); localStorage.setItem("auth_user", JSON.stringify({ id: "sa-1", name: "Super Admin", email: "sa@example.test", role: "SUPER_ADMIN" })); });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url()); const method = route.request().method();
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname.endsWith("/messaging/analytics")) return json({ success: true, analytics: { conversations: 1, messages: 2, reports: 1, blocks: 0, suspensions: 0, rateLimitEvents: 0, deliveryFailures: 0 } });
    if (url.pathname.endsWith("/messaging/settings/defaults")) return json({ success: true, defaults: { "messaging.maxMessageLength": 4000, "messaging.discoverabilityDefault": false } });
    if (url.pathname.endsWith("/system")) return json({ success: true, generatedAt: new Date().toISOString(), providers: { stripe: { secretKey: { configured: true, preview: "must-not-render" } } } });
    if (url.pathname.endsWith("/users/lookup")) return json({ success: true, users: [user], pagination: { page: 1, limit: 10, total: 1, totalPages: 1 } });
    if (url.pathname.endsWith("/users/user-1/governance")) return json({ success: true, user });
    if (url.pathname.endsWith("/users/user-1/governance-actions") && method === "POST") return json({ success: true, governance: {} });
    if (url.pathname.endsWith("/messaging/conversations")) return json({ success: true, conversations: [conversation], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } });
    if (url.pathname.endsWith("/messaging/conversations/conversation-1/content")) return json({ success: true, messages: [{ id: "message-1", senderUserId: "user-1", body: "Protected body", createdAt: new Date().toISOString() }], correlationId: "correlation-1" });
    if (url.pathname.endsWith("/messaging/conversations/conversation-1/moderation")) return json({ success: true, conversation: { ...conversation, moderationState: "REVIEW" } });
    if (url.pathname.endsWith("/messaging/reports")) return json({ success: true, reports: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 1 } });
    if (url.pathname.endsWith("/audit")) return json({ rows: [], page: 1, limit: 100, total: 0 });
    return json({ success: true });
  });
});

test("lookup and suspension require accessible typed confirmation", async ({ page }) => {
  await page.goto("/super-admin/governance");
  await page.getByLabel("Lookup type").selectOption("EMAIL"); await page.getByLabel("User lookup query").fill("taylor@example.test"); await page.getByRole("button", { name: "Protected lookup" }).click(); await page.getByRole("button", { name: /Taylor/ }).click();
  await expect(page.getByText("Messaging denied")).toBeVisible(); await expect(page.getByText("User consent")).toBeVisible();
  await page.getByRole("button", { name: "Suspend account" }).click(); const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible(); await dialog.getByLabel("Governance reason").fill("Confirmed policy violation"); await dialog.getByLabel("Typed suspension confirmation").fill("SUSPEND"); await dialog.getByRole("checkbox").check(); await expect(dialog.getByRole("button", { name: "Confirm" })).toBeEnabled(); await page.keyboard.press("Escape"); await expect(dialog).toBeHidden();
});

test("moderation content is separately confirmed, audited, and cleared on close", async ({ page }) => {
  await page.goto("/super-admin/governance"); await page.getByRole("tab", { name: "Conversations" }).click(); await page.getByRole("button", { name: "Listing question" }).click();
  await expect(page.getByText("Protected body")).toHaveCount(0); await page.getByRole("button", { name: "Access protected content" }).click(); const dialog = page.getByRole("dialog"); await dialog.getByLabel("Governance reason").fill("Investigating abuse report"); await dialog.getByRole("checkbox").check(); await dialog.getByRole("button", { name: "Confirm" }).click(); await expect(dialog.getByText("Protected body")).toBeVisible(); await expect(dialog.getByText(/correlation-1/)).toBeVisible(); await dialog.getByRole("button", { name: "Close" }).click(); await expect(page.getByText("Protected body")).toHaveCount(0);
});

test("renders API errors and keeps provider secrets hidden", async ({ page }) => {
  await page.route("**/api/super-admin/users/lookup**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Governance service unavailable" }) }));
  await page.goto("/super-admin/governance"); await page.getByLabel("User lookup query").fill("Taylor"); await page.getByRole("button", { name: "Protected lookup" }).click(); await expect(page.getByRole("alert")).toContainText("Governance service unavailable"); await page.getByRole("tab", { name: "Policy" }).click(); await expect(page.getByText("Configured")).toBeVisible(); await expect(page.getByText("must-not-render")).toHaveCount(0);
});

test("five-tab control center remains usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 }); await page.goto("/super-admin/governance");
  for (const name of ["Users", "Conversations", "Abuse Reports", "Policy", "Activity & Audit"]) await expect(page.getByRole("tab", { name })).toBeVisible();
  await page.getByRole("tab", { name: "Abuse Reports" }).focus(); await page.keyboard.press("Enter"); await expect(page.getByText(/Queue is read-only/)).toBeVisible();
});
