import { expect, test } from "@playwright/test";

test("all seven platform settings controls are wired to useful actions", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("auth_token", "super-admin-token");
    localStorage.setItem("auth_role", "SUPER_ADMIN");
    localStorage.setItem("auth_user", JSON.stringify({ id: "super-1", name: "Super Admin", email: "super@example.test", role: "SUPER_ADMIN" }));
  });
  await page.route("**/api/super-admin/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/pricing-rules")) return route.fulfill({ contentType: "application/json", body: JSON.stringify({ pricingRules: [] }) });
    if (path.includes("/platform-settings/configurations/")) return route.fulfill({ contentType: "application/json", body: JSON.stringify({ rows: [] }) });
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ settings: [] }) });
  });
  await page.goto("/super-admin/platform-settings");
  await expect(page.getByRole("button", { name: "Add Setting" })).toBeVisible();
  await page.getByRole("button", { name: "Add Setting" }).click();
  await expect(page.getByRole("form", { name: "Add platform setting" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export Settings" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View Audit" })).toHaveAttribute("href", "/super-admin/audit?q=PLATFORM_SETTING");
  for (const name of ["Feature Flags", "Commission Rules", "Listing Rules", "Auction Rules"]) {
    await page.getByRole("button", { name: `Manage ${name}` }).click();
    await expect(page).toHaveURL(new RegExp(`section=${name.toLowerCase().replaceAll(" ", "-")}`));
    await expect(page.getByRole("heading", { name, exact: true }).last()).toBeVisible();
  }
});
