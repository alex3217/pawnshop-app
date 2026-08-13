import { expect, test } from "@playwright/test";

test("privileged MFA challenge completes and preserves next", async ({ page }) => {
  await page.route("**/api/auth/login", (route) => route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ success: true, mfaRequired: true, challenge: "opaque-test-challenge", expiresInSeconds: 300 }) }));
  await page.route("**/api/auth/mfa/challenge", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, token: "header.eyJyb2xlIjoiQURNSU4iLCJleHAiOjQxMDI0NDQ4MDB9.signature", user: { id: "admin-1", role: "ADMIN", email: "admin@example.test", name: "Admin" } }) }));
  await page.goto("/login?next=%2Fadmin%2Fshops");
  await page.locator("#login-email").fill("admin@example.test");
  await page.locator("#login-password").fill("ValidPassword123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login\/mfa\?next=%2Fadmin%2Fshops$/);
  await page.locator("#mfa-code").fill("123456");
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page).toHaveURL(/\/admin\/shops$/);
});

test("challenge failures remain generic and expose no sensitive response detail", async ({ page }) => {
  await page.route("**/api/auth/mfa/challenge", (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Unable to complete authentication", code: "MFA_AUTHENTICATION_FAILED" }) }));
  await page.goto("/login/mfa", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/login$/);
});
