import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const listings = [
  { id: "mapped-item", pawnShopId: "mapped-shop", title: "Mapped Camera", description: "A listing with a verified saved shop location.", price: "125", status: "AVAILABLE", category: "Electronics", condition: "Good", images: [], shop: { id: "mapped-shop", name: "Mapped Pawn", latitude: "29.7604", longitude: "-95.3698" } },
  { id: "missing-location", pawnShopId: "missing-shop", title: "Unmapped Guitar", description: "Still discoverable without coordinates.", price: "275", status: "AVAILABLE", category: "Music", condition: "Good", images: [], shop: { id: "missing-shop", name: "Location Pending Pawn", latitude: null, longitude: null } },
  { id: "invalid-location", pawnShopId: "invalid-shop", title: "Invalid Location Tool", description: "Invalid coordinates must never become a marker.", price: "80", status: "AVAILABLE", category: "Tools", condition: "Fair", images: [], shop: { id: "invalid-shop", name: "Invalid Location Pawn", latitude: "not-a-number", longitude: "500" } },
];

async function installMarketplace(page: Page, theme: "light" | "dark", rows = listings) {
  await page.addInitScript((activeTheme) => {
    localStorage.setItem("pawnloop-theme-v2", activeTheme);
    localStorage.setItem("pawnloop-navigation-assistance-GUEST-v2", JSON.stringify({ automaticPrompts: false, completedTopics: ["full-tour"], dismissedGuidance: true, floatingButtonVisible: false }));
  }, theme);
  await page.route("**/api/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/items")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: rows, total: rows.length }) });
    return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ success: false, error: "Map fixture unavailable" }) });
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`marketplace map keeps unmappable listings discoverable in ${theme} mode`, async ({ page }) => {
    await page.setViewportSize({ width: theme === "light" ? 1280 : 320, height: 900 });
    await installMarketplace(page, theme);
    await page.goto("/marketplace");
    await page.getByRole("button", { name: "map", exact: true }).click();

    const markers = page.locator(".mp2-map-pin");
    await expect(markers).toHaveCount(1);
    const selected = markers.first();
    await expect(selected).toHaveClass(/selected/);
    await expect(selected).toContainText("$125");
    await expect(selected).toContainText("Mapped Camera");
    await expect(selected).toContainText("Mapped Pawn");
    await selected.focus();
    await expect(selected).toBeFocused();
    expect(await selected.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");

    const rows = page.locator(".mp2-map-row");
    await expect(rows).toHaveCount(3);
    await expect(rows.filter({ hasText: "Unmapped Guitar" })).toContainText("Location unavailable");
    await expect(rows.filter({ hasText: "Invalid Location Tool" })).toContainText("Location unavailable");
    await expect(page.getByText("Distance unavailable", { exact: true })).toHaveCount(0);

    const header = page.locator(".site-header");
    const [headerBox, focusedBox] = await Promise.all([header.boundingBox(), selected.boundingBox()]);
    if (headerBox && focusedBox) {
      const overlaps = headerBox.x < focusedBox.x + focusedBox.width && headerBox.x + headerBox.width > focusedBox.x && headerBox.y < focusedBox.y + focusedBox.height && headerBox.y + headerBox.height > focusedBox.y;
      expect(overlaps).toBe(false);
    }

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    const serious = (await new AxeBuilder({ page }).analyze()).violations.filter((violation) => ["serious", "critical"].includes(violation.impact || ""));
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
    if (theme === "light") {
      await page.evaluate(() => { document.body.style.zoom = "2"; });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
  });

  test(`marketplace map explains when no results can be mapped in ${theme} mode`, async ({ page }) => {
    await page.setViewportSize({ width: theme === "light" ? 768 : 320, height: 900 });
    await installMarketplace(page, theme, listings.slice(1));
    await page.goto("/marketplace");
    await page.getByRole("button", { name: "map", exact: true }).click();
    await expect(page.locator(".mp2-map-pin")).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "Mapped results unavailable" })).toBeVisible();
    await expect(page.locator(".mp2-map-row")).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}

for (const profile of [
  { name: "light desktop", theme: "light" as const, width: 1440, zoom: false },
  { name: "dark desktop", theme: "dark" as const, width: 1440, zoom: false },
  { name: "light tablet", theme: "light" as const, width: 768, zoom: false },
  { name: "dark tablet", theme: "dark" as const, width: 768, zoom: false },
  { name: "light mobile", theme: "light" as const, width: 320, zoom: false },
  { name: "dark mobile", theme: "dark" as const, width: 320, zoom: false },
  { name: "light desktop at 200 percent zoom", theme: "light" as const, width: 1440, zoom: true },
]) {
  test(`marketplace map visual QA at ${profile.name}`, async ({ page }) => {
    await page.setViewportSize({ width: profile.width, height: 900 });
    await installMarketplace(page, profile.theme);
    await page.goto("/marketplace");
    await page.getByRole("button", { name: "map", exact: true }).click();
    if (profile.zoom) await page.evaluate(() => { document.body.style.zoom = "2"; });

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(page.locator(".mp2-map-pin")).toHaveCount(1);
    await expect(page.locator(".mp2-map-row")).toHaveCount(3);
    await expect(page.locator(".mp2-map-row").filter({ hasText: "Unmapped Guitar" })).toContainText("Location unavailable");
    await expect(page.getByText("Distance unavailable", { exact: true })).toHaveCount(0);

    const marker = page.locator(".mp2-map-pin");
    await marker.focus();
    await expect(marker).toBeFocused();
    expect(await marker.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
    const header = page.locator(".site-header");
    const [headerBox, markerBox] = await Promise.all([header.boundingBox(), marker.boundingBox()]);
    if (headerBox && markerBox) {
      const overlaps = headerBox.x < markerBox.x + markerBox.width && headerBox.x + headerBox.width > markerBox.x && headerBox.y < markerBox.y + markerBox.height && headerBox.y + headerBox.height > markerBox.y;
      expect(overlaps).toBe(false);
    }
    const serious = (await new AxeBuilder({ page }).analyze()).violations.filter((violation) => ["serious", "critical"].includes(violation.impact || ""));
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
}
