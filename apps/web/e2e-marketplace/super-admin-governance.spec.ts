import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem("auth_token", "super-admin-token"); localStorage.setItem("auth_role", "SUPER_ADMIN"); localStorage.setItem("auth_user", JSON.stringify({ id: "sa-1", name: "Super Admin", email: "sa@example.test", role: "SUPER_ADMIN" })); });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/users/lookup")) return route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, users: [{ publicDisplayName: "Taylor", pawnLoopIdentifier: "pl_taylor", privateEmail: "taylor@example.test", internalId: "user-1", accountStatus: "ACTIVE", role: "CONSUMER" }] }) });
    if (url.pathname.endsWith("/users/user-1/governance")) return route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, user: { publicDisplayName: "Taylor", pawnLoopIdentifier: "pl_taylor", privateEmail: "taylor@example.test", internalId: "user-1", accountStatus: "ACTIVE", role: "CONSUMER", messagingRestricted: false, shopInitiatedContactDisabled: false, discoverabilityRestricted: false, messagingEligibility: { allowed: false, policy: "MOST_RESTRICTIVE", factors: { userConsent: false } }, publicDiscoverability: { effective: true }, firstContactConsent: { state: "DEPENDENCY_PENDING" }, shops: [], memberships: [], blockingAndReports: { blockedConversationCount: 0, reportCount: 0 } } }) });
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true }) });
  });
});

test("protected lookup exposes governance detail without loading message bodies", async ({ page }) => {
  await page.goto("/super-admin/governance");
  await expect(page.getByRole("heading", { name: "Messaging & User Governance" })).toBeVisible();
  await page.getByLabel("Lookup type").selectOption("EMAIL");
  await page.getByLabel("User lookup query").fill("taylor@example.test");
  await page.getByRole("button", { name: "Protected lookup" }).click();
  await page.getByRole("button", { name: /Taylor/ }).click();
  await expect(page.getByText("DEPENDENCY_PENDING")).toBeVisible();
  await page.getByText("Effective permission factors").click();
  await expect(page.getByText("MOST_RESTRICTIVE")).toBeVisible();
  await expect(page.getByText("message body", { exact: false })).toHaveCount(0);
});
