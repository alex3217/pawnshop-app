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
  const pendingEmptyResponses: Array<() => void> = [];
  const pendingResponses = new Map<string, Array<(response: {
    body?: unknown;
    status?: number;
  }) => void>>();

  await page.addInitScript(() => {
    localStorage.setItem("pawnloop-theme-v2", "light");
    localStorage.setItem("auth_token", "item-locator-empty-results-token");
    localStorage.setItem("auth_role", "CONSUMER");
    localStorage.setItem("auth_user", JSON.stringify({
      id: "item-locator-empty-results-buyer",
      name: "Item Locator Buyer",
      email: "item-locator-buyer@pawnloop.test",
      role: "CONSUMER",
    }));
    localStorage.setItem(
      "pawnloop-navigation-assistance-CONSUMER-v2",
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

    if (query?.startsWith("deferred ")) {
      const response = await new Promise<{ body?: unknown; status?: number }>((resolve) => {
        const resolvers = pendingResponses.get(query) || [];
        resolvers.push(resolve);
        pendingResponses.set(query, resolvers);
      });
      try {
        await route.fulfill({
          status: response.status || 200,
          contentType: "application/json",
          body: JSON.stringify(response.body ?? { items: [], total: 0 }),
        });
      } catch {
        // Clear and superseding searches intentionally abort these requests.
      }
      return;
    }

    if (query === "missing zeppelin") {
      emptyRequestCount += 1;
      await new Promise<void>((resolve) => pendingEmptyResponses.push(resolve));
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

  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "item-locator-empty-results-buyer",
          name: "Item Locator Buyer",
          email: "item-locator-buyer@pawnloop.test",
          role: "CONSUMER",
        },
      }),
    });
  });

  await page.route("**/api/notifications", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, notifications: [] }),
    });
  });

  await page.route("**/api/shop-conversations/unread-counts", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ seller: 0, shop: 0, total: 0 }),
    });
  });

  await page.route("**/api/capabilities", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, publicPreview: null }),
    });
  });

  await page.route("**/api/auth/shop-access", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access: {
          role: "CONSUMER",
          unrestricted: false,
          shopIds: [],
          permissions: [],
          capabilities: {},
          shops: [],
        },
      }),
    });
  });

  return {
    getEmptyRequestCount: () => emptyRequestCount,
    releaseEmptyResponse: () => pendingEmptyResponses.shift()?.(),
    releaseResponse: async (query: string, response: { body?: unknown; status?: number }) => {
      await expect.poll(() => pendingResponses.get(query)?.length || 0).toBeGreaterThan(0);
      const resolvers = pendingResponses.get(query) || [];
      const resolve = resolvers.shift();
      if (resolvers.length) pendingResponses.set(query, resolvers);
      else pendingResponses.delete(query);
      expect(resolve, `pending response for ${query}`).toBeDefined();
      resolve?.(response);
    },
  };
}

async function submitAndWait(page: Page, query: string) {
  const request = page.waitForRequest((candidate) => (
    new URL(candidate.url()).searchParams.get("q") === query
  ));
  const search = page.getByLabel("Search item keyword");
  await search.fill(query);
  await search.press("Enter");
  await request;
}

test("Clear invalidates every pending completion and superseded search", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      const location = message.location();
      consoleErrors.push(`${message.text()} ${location.url}:${location.lineNumber}`);
    }
  });
  const { releaseResponse } = await mockItemSearch(page);
  await page.goto("/buyer/item-locator?radius=50");

  const search = page.getByLabel("Search item keyword");
  const clear = page.getByRole("button", { name: "Clear search" });
  const status = page.getByRole("status");
  const initialHeading = page.getByRole("heading", { name: "Search for an item to locate it" });

  for (const scenario of [
    { query: "deferred success", response: { body: { items: [existingItem], total: 1 } } },
    { query: "deferred empty", response: { body: { items: [], total: 0 } } },
    { query: "deferred error", response: { status: 500, body: { message: "late failure" } } },
  ]) {
    await submitAndWait(page, scenario.query);
    await expect(status).toContainText("Searching PawnLoop inventory");
    await clear.click();
    await expect(status).toHaveCount(0);
    await expect(initialHeading).toBeVisible();
    await expect(page.locator(".locator-result-card")).toHaveCount(0);
    await expect(search).toHaveValue("");
    await expect(search).toBeFocused();
    await expect(clear).toBeDisabled();
    await releaseResponse(scenario.query, scenario.response);
    await expect(status).toHaveCount(0);
    await expect(initialHeading).toBeVisible();
  }

  await submitAndWait(page, "deferred before new search");
  await clear.click();
  await submitAndWait(page, "camera");
  await expect(page.locator(".locator-result-card")).toHaveCount(1);
  await releaseResponse("deferred before new search", { body: { items: [], total: 0 } });
  await expect(page.locator(".locator-result-card")).toHaveCount(1);
  await expect(status).toContainText("Found 1 matching item");

  await clear.click();
  await search.fill("temporary");
  await clear.click();
  await expect(initialHeading).toBeVisible();

  await submitAndWait(page, "deferred unmount");
  await page.setContent("<main>Item Locator unmounted</main>");
  await releaseResponse("deferred unmount", { body: { items: [existingItem], total: 1 } });
  await expect(page.getByText("Item Locator unmounted")).toBeVisible();
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 320, height: 760 },
]) {
  test(`empty Item Locator results are immediate and actionable on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const { getEmptyRequestCount, releaseEmptyResponse } = await mockItemSearch(page);

    await page.goto("/buyer/item-locator?radius=50");
    const search = page.getByLabel("Search item keyword");
    const clear = page.getByRole("button", { name: "Clear search" });

    await expect(clear).toBeVisible();
    await expect(clear).toBeDisabled();
    await expect(page.getByRole("button", { name: "Clear search" })).toHaveCount(1);

    await search.fill("draft search");
    await expect(clear).toBeEnabled();
    await clear.click();
    await expect(search).toHaveValue("");
    await expect(search).toBeFocused();
    await expect(page).toHaveURL(/\/buyer\/item-locator\?radius=50$/);
    await expect(clear).toBeDisabled();

    await search.fill("camera");
    await page.getByRole("button", { name: "Locate item" }).click();
    await expect(page.locator(".locator-result-card")).toHaveCount(1);

    await search.fill("missing zeppelin");
    const firstEmptyRequest = page.waitForRequest((request) => (
      new URL(request.url()).searchParams.get("q") === "missing zeppelin"
    ));
    await search.press("Enter");
    await firstEmptyRequest;

    const status = page.getByRole("status");
    await expect(status).toContainText(
      "Searching PawnLoop inventory for “missing zeppelin”…",
    );
    await expect(page.locator(".locator-result-card")).toHaveCount(0);
    await expect(clear).toBeEnabled();
    await clear.click();
    releaseEmptyResponse();
    await expect(status).toHaveCount(0);
    await expect(page.locator(".locator-result-card")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Search for an item to locate it" })).toBeVisible();
    await expect(search).toHaveValue("");
    await expect(search).toBeFocused();
    await expect(page).toHaveURL(/\/buyer\/item-locator\?radius=50$/);

    await search.fill("missing zeppelin");
    const secondEmptyRequest = page.waitForRequest((request) => (
      new URL(request.url()).searchParams.get("q") === "missing zeppelin"
    ));
    await search.press("Enter");
    await secondEmptyRequest;
    releaseEmptyResponse();
    await expect(status).toContainText(
      "No pawnshops currently have “missing zeppelin” available.",
    );
    await expect(status).toBeInViewport();
    expect(getEmptyRequestCount()).toBe(2);

    const marketplace = page.getByRole("link", { name: "Browse Marketplace" });
    const saveSearch = page.getByRole("link", { name: "Save this search" });
    await expect(page.getByRole("button", { name: "Increase radius" })).toHaveCount(0);
    await expect(marketplace).toHaveAttribute(
      "href",
      "/marketplace?q=missing+zeppelin&query=missing+zeppelin&radius=50",
    );
    await expect(saveSearch).toHaveAttribute(
      "href",
      "/saved-searches?q=missing+zeppelin&query=missing+zeppelin&radius=50",
    );

    const thirdEmptyRequest = page.waitForRequest((request) => (
      new URL(request.url()).searchParams.get("q") === "missing zeppelin"
    ));
    await search.press("Enter");
    await thirdEmptyRequest;
    await expect(status).toContainText(
      "Searching PawnLoop inventory for “missing zeppelin”…",
    );
    await expect.poll(getEmptyRequestCount).toBe(3);
    releaseEmptyResponse();
    await expect(status).toContainText(
      "No pawnshops currently have “missing zeppelin” available.",
    );
    await expect(page.locator(".locator-result-card")).toHaveCount(0);

    await clear.click();
    await expect(page.getByRole("heading", { name: "Search for an item to locate it" })).toBeVisible();
    await expect(status).toHaveCount(0);
    await expect(search).toHaveValue("");
    await expect(search).toBeFocused();
    await expect(page).toHaveURL(/\/buyer\/item-locator\?radius=50$/);
    const url = new URL(page.url());
    expect(url.searchParams.has("q")).toBe(false);
    expect(url.searchParams.has("query")).toBe(false);
    expect(url.searchParams.get("radius")).toBe("50");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });
}
