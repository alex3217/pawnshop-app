import { expect, test, type Page } from "@playwright/test";

type TestRole = "CONSUMER" | "OWNER" | "ADMIN" | "SUPER_ADMIN";

async function installSession(page: Page, role: TestRole) {
  await page.goto("/terms");
  await page.evaluate((activeRole) => {
    localStorage.setItem("auth_token", `${activeRole.toLowerCase()}-route-guard-token`);
    localStorage.setItem("auth_role", activeRole);
    localStorage.setItem("auth_user", JSON.stringify({
      id: `${activeRole.toLowerCase()}-route-guard-user`,
      name: "Route Guard User",
      email: `${activeRole.toLowerCase()}@example.test`,
      role: activeRole,
    }));
    localStorage.setItem(
      `${activeRole.toLowerCase()}_token`,
      `${activeRole.toLowerCase()}-route-guard-token`,
    );
  }, role);
}

async function mockApi(page: Page) {
  await page.route("**/api/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      success: true,
      items: [],
      rows: [],
      data: [],
      shops: [],
      capabilities: {},
      notifications: [],
      pagination: { page: 1, limit: 25, total: 0, totalPages: 0 },
    }),
  }));
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test("authenticated CONSUMER can access the Buyer dashboard", async ({ page }) => {
  await installSession(page, "CONSUMER");
  await page.goto("/buyer/dashboard");

  await expect(page).toHaveURL(/\/buyer\/dashboard$/);
  await expect(page.locator(".buyer-dashboard")).toBeVisible();
});

test("refresh preserves a valid Buyer session", async ({ page }) => {
  await installSession(page, "CONSUMER");
  await page.goto("/buyer/dashboard");
  await page.reload();

  await expect(page).toHaveURL(/\/buyer\/dashboard$/);
  await expect(page.locator(".buyer-dashboard")).toBeVisible();
});

test("logout clears authentication state", async ({ page }) => {
  await installSession(page, "CONSUMER");
  await page.goto("/buyer/dashboard");
  await page.getByRole("button", { name: "Logout", exact: true }).first().click();

  await expect(page).toHaveURL(/\/login$/);
  await expect.poll(() => page.evaluate(() => ({
    token: localStorage.getItem("auth_token"),
    role: localStorage.getItem("auth_role"),
    user: localStorage.getItem("auth_user"),
    consumerToken: localStorage.getItem("consumer_token"),
  }))).toEqual({ token: null, role: null, user: null, consumerToken: null });
});

test("direct Buyer dashboard access after logout redirects with next", async ({ page }) => {
  await installSession(page, "CONSUMER");
  await page.goto("/buyer/dashboard");
  await page.getByRole("button", { name: "Logout", exact: true }).first().click();
  await page.goto("/buyer/dashboard");

  await expect(page).toHaveURL(/\/login\?next=%2Fbuyer%2Fdashboard$/);
  await expect(page.locator(".buyer-dashboard")).toHaveCount(0);
});

test("fresh unauthenticated Buyer dashboard access redirects with next", async ({ page }) => {
  await page.goto("/buyer/dashboard");

  await expect(page).toHaveURL(/\/login\?next=%2Fbuyer%2Fdashboard$/);
  await expect(page.locator(".buyer-dashboard")).toHaveCount(0);
});

test("Buyer cannot access Owner or Admin routes", async ({ page }) => {
  await installSession(page, "CONSUMER");

  await page.goto("/owner");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".owner-dashboard, .admin-layout")).toHaveCount(0);

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".admin-layout")).toHaveCount(0);
});

test("wrong-role users cannot render another role's protected shell", async ({ page }) => {
  await installSession(page, "OWNER");
  await page.goto("/buyer/dashboard");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".buyer-dashboard")).toHaveCount(0);

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".admin-layout")).toHaveCount(0);

  await installSession(page, "ADMIN");
  for (const path of ["/buyer/dashboard", "/owner", "/super-admin"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator(".buyer-dashboard, .owner-dashboard, .admin-layout")).toHaveCount(0);
  }

  await installSession(page, "SUPER_ADMIN");
  for (const path of ["/buyer/dashboard", "/owner", "/admin"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator(".buyer-dashboard, .owner-dashboard, .admin-layout")).toHaveCount(0);
  }
});

test("public routes remain accessible without authentication", async ({ page }) => {
  await page.goto("/terms");
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.getByRole("heading", { name: /terms/i }).first()).toBeVisible();

  await page.goto("/login");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
