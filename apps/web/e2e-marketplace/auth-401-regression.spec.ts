import { expect, test, type Page } from "@playwright/test";

async function storedOwner(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("auth-test-seeded")) return;
    sessionStorage.setItem("auth-test-seeded", "1");
    localStorage.setItem("auth_token", "stale-owner-token");
    localStorage.setItem("auth_role", "OWNER");
    localStorage.setItem("auth_user", JSON.stringify({ id: "owner-1", name: "Owner", email: "owner@test", role: "OWNER" }));
  });
}

test("authenticated 401 clears stale session and redirects to login", async ({ page }) => {
  await storedOwner(page);
  await page.route("**/api/**", (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Unauthorized" }) }));
  await page.goto("/owner");
  await expect(page).toHaveURL(/\/login\?reason=session-expired&returnTo=/);
  expect(await page.evaluate(() => localStorage.getItem("auth_token"))).toBeNull();
});

test("incorrect login remains on login with useful error", async ({ page }) => {
  await page.route("**/api/auth/login", (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Invalid email or password." }) }));
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("wrong@example.com");
  await page.locator("#login-password").fill("WrongPassword123!");
  await page.getByRole("button", { name: /log in|sign in/i }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("alert")).toContainText("Invalid email or password");
});

test("registration failure remains on registration page", async ({ page }) => {
  await page.route("**/api/platform-settings/founding-shop-program", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ program: { enabled: false } }) }));
  await page.route("**/api/auth/register", (route) => route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "Registration could not be completed." }) }));
  await page.goto("/register");
  await page.locator("#register-name").fill("Test User");
  await page.locator("#register-email").fill("test@example.com");
  await page.locator("#register-password").fill("ValidPassword123!");
  await page.locator("#register-confirm-password").fill("ValidPassword123!");
  await page.locator("#register-legal-consent").check();
  await page.getByRole("button", { name: /register|create/i }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole("alert")).toContainText("Registration could not be completed");
});

test("ordinary 403 neither redirects nor clears authentication", async ({ page }) => {
  await storedOwner(page);
  await page.route("**/api/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: "owner-1", name: "Owner", email: "owner@test", role: "OWNER", ownerApplication: { id: "app-1", status: "APPROVED" } } }) }));
  await page.route("**/api/**", (route) => route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "Forbidden" }) }));
  await page.goto("/owner");
  await expect(page).toHaveURL(/\/owner$/);
  expect(await page.evaluate(() => localStorage.getItem("auth_token"))).toBe("stale-owner-token");
});
