import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

type Role = "CONSUMER" | "OWNER" | "SUPER_ADMIN";
const routes: Array<{ name: string; path: string; role?: Role }> = [
  { name: "Home", path: "/" },
  { name: "Marketplace", path: "/marketplace" },
  { name: "Item detail", path: "/items/axe-missing-item" },
  { name: "Login", path: "/login" },
  { name: "Registration", path: "/register" },
  { name: "Buyer Dashboard", path: "/buyer/dashboard", role: "CONSUMER" },
  { name: "My Activity", path: "/buyer/workspace", role: "CONSUMER" },
  { name: "Buyer Subscription", path: "/buyer/subscription", role: "CONSUMER" },
  { name: "Buyer Account Settings", path: "/buyer/settings", role: "CONSUMER" },
  { name: "Buyer Help Center", path: "/buyer/help", role: "CONSUMER" },
  { name: "Owner Dashboard", path: "/owner", role: "OWNER" },
  { name: "Owner Finance", path: "/owner/finance", role: "OWNER" },
  { name: "Owner Marketing Center", path: "/owner/marketing", role: "OWNER" },
  { name: "Super Admin Overview", path: "/super-admin", role: "SUPER_ADMIN" },
  { name: "Super Admin Revenue", path: "/super-admin/revenue", role: "SUPER_ADMIN" },
  { name: "Launch War Room", path: "/super-admin/launch-readiness", role: "SUPER_ADMIN" },
];

async function installState(page: Page, role?: Role, theme: "light" | "dark" = "light") {
  await page.addInitScript(({ activeRole, activeTheme }) => {
    localStorage.setItem("pawnloop-theme-v2", activeTheme);
    for (const roleName of ["GUEST", "CONSUMER", "OWNER", "ADMIN", "SUPER_ADMIN"]) {
      localStorage.setItem(`pawnloop-navigation-assistance-${roleName}-v2`, JSON.stringify({ automaticPrompts: false, completedTopics: ["full-tour"], dismissedGuidance: true, floatingButtonVisible: false }));
    }
    if (!activeRole) return;
    localStorage.setItem("auth_token", "axe-local-mock-token");
    localStorage.setItem("auth_role", activeRole);
    localStorage.setItem("auth_user", JSON.stringify({
      id: `axe-${activeRole.toLowerCase()}`,
      name: "Axe Test User",
      email: "axe@pawnloop.test",
      role: activeRole,
      ...(activeRole === "OWNER" ? { ownerApplication: { id: "axe-owner", status: "APPROVED", submittedAt: null, reviewedAt: null, decisionReason: null, statusChangedAt: null } } : {}),
    }));
  }, { activeRole: role, activeTheme: theme });
  await page.route("**/api/**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ success: false, error: "Mock service unavailable" }) }));
}

for (const route of routes) {
  for (const profile of [
    { theme: "light" as const, viewport: { width: 1280, height: 800 } },
    { theme: "dark" as const, viewport: { width: 390, height: 844 } },
  ]) {
    test(`${route.name} has no serious axe violations in ${profile.theme} ${profile.viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(profile.viewport);
      await installState(page, route.role, profile.theme);
      await page.goto(route.path);
      await expect(page.locator("body")).toBeVisible();
      const results = await new AxeBuilder({ page }).options({ resultTypes: ["violations"] }).analyze();
      const launchBlocking = results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact || ""));
      expect(launchBlocking, JSON.stringify(launchBlocking, null, 2)).toEqual([]);
    });
  }
}

test("Launch War Room rejects non-Super Admin access", async ({ page }) => {
  await installState(page, "CONSUMER");
  await page.goto("/super-admin/launch-readiness");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Launch War Room" })).toHaveCount(0);
});

test("Launch War Room exposes reviewed evidence and no unsupported PASS", async ({ page }) => {
  await installState(page, "SUPER_ADMIN");
  await page.goto("/super-admin/launch-readiness");
  await expect(page.getByRole("heading", { name: "Launch War Room" })).toBeVisible();
  await expect(page.getByText("No certified disposable target or clean replay evidence.")).toBeVisible();
  await expect(page.getByText("PASS", { exact: true })).toHaveCount(0);
  await expect(page.getByText("BLOCKED", { exact: true }).first()).toBeVisible();
});
