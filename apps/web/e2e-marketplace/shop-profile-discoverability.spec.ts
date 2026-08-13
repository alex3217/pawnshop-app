import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

const shops = [
  { id: "shop-a", name: "Alpha Pawn", address: "1 Main St", addressLine2: "Suite 2", city: "Chicago", state: "IL", zip: "60601", country: "US", latitude: 41.88, longitude: -87.63, mapVerificationRequired: false, phone: "312-555-0100", hours: "Mon–Fri 9–5", description: "Neighborhood pawnshop", staffCount: 2, inventoryCount: 8, status: "ACTIVE" },
  { id: "shop-b", name: "Bravo Pawn", address: "2 Oak St", addressLine2: "", city: "Chicago", state: "IL", zip: "60602", country: "US", latitude: null, longitude: null, mapVerificationRequired: false, phone: "312-555-0200", hours: "Daily 10–6", description: "Second location", staffCount: 1, inventoryCount: 3, status: "ACTIVE" },
];

async function fulfill(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function seed(page: Page, writable = true) {
  await page.addInitScript(() => {
    localStorage.setItem("auth_token", "staff-token");
    localStorage.setItem("auth_role", "CONSUMER");
    localStorage.setItem("auth_user", JSON.stringify({ id: "staff-1", name: "Staff", email: "staff@test", role: "CONSUMER" }));
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, "");
    if (path === "/auth/shop-access") return fulfill(route, { success: true, access: { role: "CONSUMER", unrestricted: false, capabilities: { locationsRead: true, locationsWrite: writable }, shops: shops.map((shop) => ({ shopId: shop.id, shopName: shop.name, source: "STAFF", staffRole: writable ? "SHOP_ADMIN" : "SHOP_VIEWER", permissions: writable ? ["locations:read", "locations:write"] : ["locations:read"] })) } });
    if (path === "/locations/mine" || path === "/shops/mine") return fulfill(route, shops);
    if (path === "/messages/unread-counts") return fulfill(route, { seller: 0, shop: 0 });
    if (path === "/notifications") return fulfill(route, { notifications: [] });
    if (path === "/locations/shop-a" && route.request().method() === "PATCH") return fulfill(route, { ...shops[0], ...route.request().postDataJSON(), mapVerificationRequired: true });
    return fulfill(route, { success: true });
  });
}

test("shop profile actions support multiple locations, mobile layout, labels, and focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page, true);
  await page.goto("/owner/locations");
  await expect(page.getByRole("heading", { name: "Shop Profile & Locations" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit shop profile for Alpha Pawn" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit shop profile for Bravo Pawn" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View public profile for Alpha Pawn" })).toHaveAttribute("href", "/shops/shop-a");
  await page.getByRole("button", { name: "Edit shop profile for Bravo Pawn" }).click();
  await expect(page.getByRole("heading", { name: "Edit Shop Profile" })).toBeFocused();
  await expect(page.getByLabel("Shop name")).toHaveValue("Bravo Pawn");
  await expect(page.getByRole("link", { name: "View inventory" }).nth(1)).toHaveAttribute("href", "/owner/inventory?shopId=shop-b");
  const results = await new AxeBuilder({ page }).include(".owner-locations-page").analyze();
  expect(results.violations).toEqual([]);
});

test("staff without profile-management permission has read-only access", async ({ page }) => {
  await seed(page, false);
  await page.goto("/owner/locations");
  await expect(page.getByText("Alpha Pawn")).toBeVisible();
  await expect(page.getByRole("button", { name: /Edit shop profile/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /map location for/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "View public profile for Alpha Pawn" })).toBeVisible();
});
