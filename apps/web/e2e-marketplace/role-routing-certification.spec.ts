import { expect, test, type Page } from "@playwright/test";

async function storeSession(page: Page, role: "CONSUMER" | "SUPER_ADMIN") {
  await page.addInitScript((selectedRole) => {
    localStorage.setItem("auth_token", "redacted-browser-routing-token");
    localStorage.setItem("auth_role", selectedRole);
    localStorage.setItem("auth_user", JSON.stringify({
      id: `routing-${selectedRole.toLowerCase()}`,
      name: "Role Routing Certification",
      email: "redacted@role-routing.test",
      role: selectedRole,
    }));
  }, role);
}

test("unauthenticated browser routing sends protected users to login", async ({ page }) => {
  await page.goto("/buyer/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});

test("consumer browser routing rejects the Super Admin area", async ({ page }) => {
  await storeSession(page, "CONSUMER");
  await page.goto("/super-admin");
  await expect(page).toHaveURL(/\/$/);
});

test("Super Administrator browser routing enters the platform area", async ({ page }) => {
  await storeSession(page, "SUPER_ADMIN");
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.goto("/super-admin");
  await expect(page).toHaveURL(/\/super-admin$/);
  await expect(page.getByRole("heading", { name: "Platform Control", exact: true })).toBeVisible();
});
