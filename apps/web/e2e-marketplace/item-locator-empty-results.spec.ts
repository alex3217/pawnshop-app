import { expect, test, type Page } from "@playwright/test";

const existingItem = {
  id: "existing-camera",
  pawnShopId: "shop-1",
  title: "Vintage Camera",
  price: "175",
  status: "AVAILABLE",
  category: "Electronics",
  condition: "Good",
  images: [],
  shop: { id: "shop-1", name: "Main Street Pawn" },
};

async function mockItemSearch(page: Page) {
  let emptyRequestCount = 0;

  await page.addInitScript(() => {
    localStorage.setItem("pawnloop-theme-v2", "light");
    localStorage.setItem(
      "pawnloop-navigation-assistance-GUEST-v2",
      JSON.stringify({
        automaticPrompts: false,
        completedTopics: ["full-tour"],
        dismissedGuidance: true,
        floatingButtonVisible: false,
      }),
    );
  });

  await page.route("**/api/items?**", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("q");

    if (query === "missing zeppelin") {
      emptyRequestCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 250));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], total: 0 }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [existingItem], total: 1 }),
    });
  });

  return () => emptyRequestCount;
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 320, height: 760 },
]) {
  test(`empty Item Locator results are immediate and actionable on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const getEmptyRequestCount = await mockItemSearch(page);

    await page.goto("/buyer/item-locator?q=camera&query=camera&radius=25");
    await expect(page.locator(".locator-result-card")).toHaveCount(1);

    const search = page.getByLabel("Search item keyword");
    await search.fill("missing zeppelin");
    await page.getByRole("button", { name: "Locate item" }).click();

    const status = page.getByRole("status");
    await expect(status).toContainText(
      "Searching PawnLoop inventory for “missing zeppelin”…",
    );
    await expect(page.locator(".locator-result-card")).toHaveCount(0);
    await expect(status).toContainText(
      "No pawnshops currently have “missing zeppelin” available.",
    );
    await expect(status).toBeInViewport();
    expect(getEmptyRequestCount()).toBe(1);

    const marketplace = page.getByRole("link", { name: "Browse Marketplace" });
    const saveSearch = page.getByRole("link", { name: "Save this search" });
    await expect(page.getByRole("button", { name: "Increase radius" })).toHaveCount(0);
    await expect(marketplace).toHaveAttribute(
      "href",
      "/marketplace?q=missing+zeppelin&query=missing+zeppelin&radius=25",
    );
    await expect(saveSearch).toHaveAttribute(
      "href",
      "/saved-searches?q=missing+zeppelin&query=missing+zeppelin&radius=25",
    );

    await page.getByRole("button", { name: "Locate item" }).click();
    await expect(status).toContainText(
      "Searching PawnLoop inventory for “missing zeppelin”…",
    );
    await expect.poll(getEmptyRequestCount).toBe(2);
    await expect(status).toContainText(
      "No pawnshops currently have “missing zeppelin” available.",
    );
    await expect(page.locator(".locator-result-card")).toHaveCount(0);

    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(page.getByRole("heading", { name: "Search for an item to locate it" })).toBeVisible();
    await expect(status).toHaveCount(0);
    await expect(search).toHaveValue("");
    await expect(search).toBeFocused();
    await expect(page).toHaveURL(/\/buyer\/item-locator$/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });
}
