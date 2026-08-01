import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("auth_token", "super-admin-token");
    localStorage.setItem("auth_role", "SUPER_ADMIN");
    localStorage.setItem("auth_user", JSON.stringify({ id: "super-1", name: "Super Admin", email: "super@example.test", role: "SUPER_ADMIN" }));
  });
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/plans/seller")) return route.fulfill({ contentType: "application/json", body: JSON.stringify({ plans: [
      { code: "FREE", label: "Free", monthlyPriceCents: 0, yearlyPriceCents: 0, maxActiveListings: 25, trialMaxActiveListings: 50, status: "ACTIVE", stripeSyncStatus: "NOT_REQUIRED" },
      { code: "PRO", label: "Pro", monthlyPriceCents: 4900, yearlyPriceCents: 49000, status: "ACTIVE", stripeSyncStatus: "CONFIGURED" },
      { code: "PREMIUM", label: "Premium", monthlyPriceCents: 14900, yearlyPriceCents: 149000, status: "ACTIVE", stripeSyncStatus: "CONFIGURED" },
      { code: "ULTRA", label: "Ultra", monthlyPriceCents: 29900, yearlyPriceCents: 299000, status: "ACTIVE", stripeSyncStatus: "CONFIGURED" },
    ] }) });
    if (path.endsWith("/plans/buyer")) return route.fulfill({ contentType: "application/json", body: JSON.stringify({ plans: [] }) });
    if (path.includes("buyer-subscriptions")) return route.fulfill({ contentType: "application/json", body: JSON.stringify({ rows: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false } }) });
    if (path.includes("/super-admin/shops")) return route.fulfill({ contentType: "application/json", body: JSON.stringify({ shops: [], pagination: { page: 1, limit: 250, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false } }) });
    return route.fulfill({ contentType: "application/json", body: "{}" });
  });
});

test("four distinct seller/buyer plan and subscription routes render the correct workflow", async ({ page }) => {
  await page.goto("/super-admin/plans/seller"); await expect(page.getByRole("heading", { name: "Seller Plan Control" })).toBeVisible(); await expect(page.getByText("$49.00/month")).toBeVisible(); await expect(page.getByText("25").first()).toBeVisible();
  await page.goto("/super-admin/seller-subscriptions"); await expect(page.getByRole("heading", { name: "Seller Subscriptions" })).toBeVisible();
  await page.goto("/super-admin/plans/buyer"); await expect(page.getByRole("heading", { name: "Buyer Plan Control" })).toBeVisible();
  await page.goto("/super-admin/buyer-subscriptions"); await expect(page.getByRole("heading", { name: "Buyer Subscriptions" })).toBeVisible();
});

test("seller-plan visible actions work and pricing toggle preserves yearly prices", async ({ page }) => {
  await page.goto("/super-admin/plans/seller");
  for (const name of ["Compare plans", "Export plans", "View audit history"]) await expect(page.getByRole(name.includes("history") ? "link" : "button", { name })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Seller Subscriptions" })).toBeVisible();
  await page.getByRole("button", { name: "Compare plans" }).click(); await expect(page.getByRole("heading", { name: "Seller plan comparison" })).toBeVisible();
  await page.getByRole("button", { name: "Show yearly pricing" }).click(); await expect(page.getByText("$490.00/year")).toBeVisible();
  await page.getByRole("button", { name: "View details" }).first().click(); await expect(page.getByRole("dialog")).toBeVisible();
});
