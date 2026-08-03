import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

const OWNER_ID = "seller-readability-owner";
const SHOP_ID = "seller-readability-shop";
const ITEM_ID = "seller-readability-item";

const listing = {
  id: "seller-readability-listing",
  itemId: ITEM_ID,
  sellerUserId: OWNER_ID,
  sellerShopId: SHOP_ID,
  listingType: "SHOP_TO_CUSTOMER",
  status: "DRAFT",
  title: "Seller readability listing",
  description: "A current-main listing fixture.",
  category: "Electronics",
  condition: "Good",
  price: "150.00",
  currency: "USD",
  quantity: 1,
  images: [],
  allowOffers: true,
  pickupAvailable: true,
  shippingAvailable: false,
  expiresAt: null,
  featuredUntil: null,
  publishedAt: null,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
  seller: { id: OWNER_ID, name: "Seller Readability", role: "OWNER" },
  sellerShop: { id: SHOP_ID, name: "Readable Pawn", ownerId: OWNER_ID },
  item: { id: ITEM_ID, title: "Seller readability listing", status: "AVAILABLE", pawnShopId: SHOP_ID },
};

const shopItems = [
  {
    id: "available-item",
    pawnShopId: SHOP_ID,
    title: "Readable camera",
    description: "A detailed storefront description that remains readable.",
    price: "240.00",
    images: ["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="],
    category: "Electronics",
    condition: "Good",
    status: "AVAILABLE",
  },
  {
    id: "pending-item",
    pawnShopId: SHOP_ID,
    title: "Pending guitar",
    description: null,
    price: "125.00",
    images: [],
    category: "Music",
    condition: "Used",
    status: "PENDING",
  },
  {
    id: "sold-item",
    pawnShopId: SHOP_ID,
    title: "Sold watch",
    description: "Previously sold inventory.",
    price: "80.00",
    images: [],
    category: "Jewelry",
    condition: "Fair",
    status: "SOLD",
  },
];

async function installSeller(page: Page, theme: "light" | "dark") {
  await page.addInitScript(({ activeTheme, ownerId }) => {
    localStorage.setItem("pawnloop-theme-v2", activeTheme);
    localStorage.setItem("auth_token", "seller-shop-readability-token");
    localStorage.setItem("auth_role", "OWNER");
    localStorage.setItem("auth_user", JSON.stringify({
      id: ownerId,
      name: "Seller Readability",
      email: "seller-readability@example.test",
      role: "OWNER",
      ownerApplication: { id: "seller-readability-application", status: "APPROVED" },
    }));
    localStorage.setItem("pawnloop-navigation-assistance-OWNER-v2", JSON.stringify({
      automaticPrompts: false,
      completedTopics: ["full-tour"],
      dismissedGuidance: true,
      floatingButtonVisible: false,
    }));
  }, { activeTheme: theme, ownerId: OWNER_ID });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (pathname === "/api/auth/me") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: {
        id: OWNER_ID,
        name: "Seller Readability",
        email: "seller-readability@example.test",
        role: "OWNER",
        ownerApplication: { id: "seller-readability-application", status: "APPROVED" },
      } }) });
    }

    if (pathname === "/api/auth/shop-access") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access: {
        role: "OWNER",
        unrestricted: true,
        shopIds: [SHOP_ID],
        permissions: [],
        capabilities: { inventoryRead: true, inventoryWrite: true },
        shops: [{ id: SHOP_ID, name: "Readable Pawn" }],
      } }) });
    }

    if (pathname === "/api/marketplace-listings/mine") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, rows: [listing] }) });
    }

    if (pathname === "/api/shops/mine") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [{ id: SHOP_ID, name: "Readable Pawn", ownerId: OWNER_ID }] }) });
    }

    if (pathname === "/api/items/mine") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [{
        id: ITEM_ID,
        pawnShopId: SHOP_ID,
        title: "Seller readability listing",
        description: "A current-main item fixture.",
        price: "150.00",
        category: "Electronics",
        condition: "Good",
        status: "AVAILABLE",
        images: [],
      }] }) });
    }

    if (pathname === `/api/shops/${SHOP_ID}/items`) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        shop: {
          id: SHOP_ID,
          name: "Readable Pawn",
          address: null,
          phone: "713-555-0142",
          hours: null,
          description: "A public storefront description that remains readable in both themes.",
        },
        items: shopItems,
      }) });
    }

    return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "No fixture for this request." }) });
  });
}

async function expectReadable(locator: Locator) {
  await expect(locator).toBeVisible();
  const style = await locator.evaluate((element) => {
    const computed = getComputedStyle(element);
    return { color: computed.color, background: computed.backgroundColor, opacity: Number(computed.opacity) };
  });
  expect(style.opacity).toBeGreaterThanOrEqual(0.65);
  expect(style.color).not.toBe(style.background);
}

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

async function expectNoSeriousAxeViolations(page: Page) {
  const serious = (await new AxeBuilder({ page }).analyze()).violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

for (const theme of ["light", "dark"] as const) {
  test(`seller listing actions and setup are readable in ${theme} mode`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await installSeller(page, theme);

    await page.goto("/marketplace/listings/mine");
    await expect(page.getByRole("heading", { name: "My Marketplace Listings" })).toBeVisible();
    const primaryAction = page.getByRole("link", { name: "Create listing" }).first();
    await expectReadable(primaryAction);
    await expect(primaryAction).toHaveClass(/seller-listings-primary-action/);
    await primaryAction.focus();
    await expect(primaryAction).toBeFocused();
    expect(await primaryAction.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
    await expectNoOverflow(page);
    await expectNoSeriousAxeViolations(page);

    await page.goto("/marketplace/listings/new");
    await expect(page.getByRole("heading", { name: "Create Marketplace Listing" })).toBeVisible();
    await expectReadable(page.getByText("Item details", { exact: true }));
    await expectReadable(page.getByRole("button", { name: "Save draft" }));
    await expectNoOverflow(page);
    await expectNoSeriousAxeViolations(page);
  });

  test(`public storefront is readable in ${theme} mode`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await installSeller(page, theme);
    await page.goto(`/shops/${SHOP_ID}`);

    await expect(page.getByRole("heading", { name: "Readable Pawn" })).toBeVisible();
    await expectReadable(page.getByText("No address provided", { exact: true }));
    await expect(page.getByRole("link", { name: "713-555-0142" })).toHaveAttribute("href", "tel:713-555-0142");
    await expectReadable(page.getByText("Hours not listed", { exact: true }));
    await expectReadable(page.getByText("A public storefront description that remains readable in both themes."));
    await expect(page.getByRole("button", { name: "Clear Filters" })).toBeDisabled();
    await expectReadable(page.getByRole("button", { name: "Clear Filters" }));
    await expect(page.getByRole("link", { name: "Follow Shop" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Follow Shop" })).toHaveCount(0);

    const viewItem = page.getByRole("link", { name: "View Item" }).first();
    await viewItem.focus();
    await expect(viewItem).toBeFocused();
    expect(await viewItem.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
    await expect(page.getByRole("img", { name: "Readable camera" })).toBeVisible();
    await expect(page.getByRole("img", { name: "No image available for Pending guitar" })).toBeVisible();
    await expectNoOverflow(page);
    await expectNoSeriousAxeViolations(page);
  });
}

for (const profile of [
  { name: "desktop", width: 1440, zoom: false },
  { name: "tablet", width: 768, zoom: false },
  { name: "mobile", width: 320, zoom: false },
  { name: "desktop at 200 percent zoom", width: 1440, zoom: true },
] as const) {
  test(`seller and storefront routes reflow at ${profile.name}`, async ({ page }) => {
    await page.setViewportSize({ width: profile.width, height: 900 });
    await installSeller(page, "light");

    for (const route of ["/marketplace/listings/mine", "/marketplace/listings/new", `/shops/${SHOP_ID}`]) {
      await page.goto(route);
      if (profile.zoom) await page.evaluate(() => { document.body.style.zoom = "2"; });
      await expect(page.locator("main").first()).toBeVisible();
      await expectNoOverflow(page);
      if (profile.zoom) await page.evaluate(() => { document.body.style.zoom = ""; });
    }
  });
}
