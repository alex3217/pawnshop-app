import { expect, test, type Page } from "@playwright/test";

const item = {
  id: "map-item-1", pawnShopId: "shop-1", title: "Map Test Watch", description: "Verified local item", price: "125.00", status: "AVAILABLE", category: "Watches", condition: "GOOD", images: [],
  shop: { id: "shop-1", name: "Loop Pawn", address: "123 Main St", city: "Chicago", state: "IL", zip: "60601", phone: "312-555-0100", latitude: 41.881832, longitude: -87.623177 },
};

async function mockItem(page: Page) {
  await page.route("https://maps.googleapis.com/**", (route) => route.abort());
  await page.route("**/api/items/map-item-1/price-comparison", (route) => route.fulfill({ json: { success: true, itemId: item.id, radiusMiles: 25, freshnessDays: 90, perShopCap: 3, reason: "NO_COMPARABLES", comparison: { score: null, dealScore: null, scoreRuleVersion: "v1", confidence: 0, benchmark: null, statistics: null, sampleCount: 0, shopCount: 0, comparables: [] } } }));
  await page.route("**/api/items/map-item-1", (route) => route.fulfill({ json: item }));
}

test("marketplace action labels remain visible on hover, focus, themes, and mobile", async ({ page }) => {
  await page.route("**/api/items**", (route) => route.fulfill({ json: [item] }));
  await page.goto("/marketplace");
  for (const label of ["View item", "Make offer", "Directions", "Watch"]) {
    const action = label === "Watch" ? page.getByRole("button", { name: label, exact: true }).first() : page.getByRole("link", { name: label, exact: true }).first();
    await expect(action).toBeVisible();
    await action.hover();
    await expect(action).toContainText(label);
    await action.focus();
    await expect(action).toBeFocused();
    await expect(action).toContainText(label);
  }
  await page.evaluate(() => document.documentElement.dataset.theme = "dark");
  await expect(page.getByRole("link", { name: "View item", exact: true }).first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Watch", exact: true }).first()).toBeVisible();
});

test("item detail renders map fallback, directions, distance, and location states", async ({ page }) => {
  await mockItem(page);
  await page.goto("/items/map-item-1");
  await expect(page.getByText("Shop map unavailable")).toBeVisible();
  await expect(page.locator(".item-detail-map-fallback").getByText("123 Main St Chicago, IL 60601")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open in Google Maps" })).toHaveAttribute("href", /google\.com\/maps/);
  await expect(page.getByRole("link", { name: "Directions", exact: true })).toBeVisible();

  await page.evaluate(() => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition(success: PositionCallback) { success({ coords: { latitude: 41.89, longitude: -87.62, accuracy: 10 }, timestamp: Date.now() } as GeolocationPosition); } } });
  });
  await page.getByRole("button", { name: "Use my location" }).click();
  await expect(page.getByText(/mi away/)).toBeVisible();
});

test("browser key loads an interactive labeled marker at verified coordinates", async ({ page }) => {
  await page.route("https://maps.googleapis.com/**", (route) => route.fulfill({ contentType: "application/javascript", body: `window.__mapCalls=[]; window.google={maps:{Map:class{constructor(_el, options){window.__mapCalls.push(['map',options.center]);}setCenter(point){window.__mapCalls.push(['center',point]);}},Marker:class{constructor(options){window.__mapCalls.push(['marker',options.position,options.title]);}setMap(){}setPosition(point){window.__mapCalls.push(['position',point]);}setTitle(title){window.__mapCalls.push(['title',title]);}}}};` }));
  await page.route("**/api/items/map-item-1/price-comparison", (route) => route.fulfill({ json: { success: true, itemId: item.id, reason: "NO_COMPARABLES", comparison: { comparables: [] } } }));
  await page.route("**/api/items/map-item-1", (route) => route.fulfill({ json: item }));
  await page.goto("/items/map-item-1");
  await expect(page.locator('[data-map-status="ready"]')).toBeVisible();
  const calls = await page.evaluate(() => (window as typeof window & { __mapCalls: unknown[] }).__mapCalls);
  expect(calls).toContainEqual(["marker", { lat: 41.881832, lng: -87.623177 }, "Loop Pawn"]);
});

for (const scenario of [
  { name: "denial", code: 1, message: "permission was denied" },
  { name: "unavailable", code: 2, message: "location is unavailable" },
  { name: "timeout", code: 3, message: "timed out" },
]) {
  test(`location ${scenario.name} offers retry`, async ({ page }) => {
    await mockItem(page);
    await page.goto("/items/map-item-1");
    await page.evaluate((code) => {
      Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition(_success: PositionCallback, error: PositionErrorCallback) { error({ code, message: "test", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError); } } });
    }, scenario.code);
    await page.getByRole("button", { name: "Use my location" }).click();
    await expect(page.getByText(new RegExp(scenario.message, "i"))).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry location" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Directions", exact: true })).toBeVisible();
  });
}

test("missing shop coordinates keeps address fallback and location action safe", async ({ page }) => {
  await page.route("**/api/items/map-item-1/price-comparison", (route) => route.fulfill({ json: { success: true, itemId: item.id, reason: "SHOP_LOCATION_UNAVAILABLE", comparison: { comparables: [] } } }));
  await page.route("**/api/items/map-item-1", (route) => route.fulfill({ json: { ...item, shop: { ...item.shop, latitude: null, longitude: null } } }));
  await page.goto("/items/map-item-1");
  await expect(page.getByText("Shop map unavailable")).toBeVisible();
  await expect(page.getByText("Ask the shop for directions before visiting.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Use my location" })).toBeVisible();
});
