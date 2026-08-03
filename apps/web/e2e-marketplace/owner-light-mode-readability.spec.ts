import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

const SHOP_ID = "owner-readability-shop";

const ownerRoutes = [
  { path: "/owner/items/new", heading: "Create Item", control: "Back to Inventory", role: "link" },
  { path: "/owner/shops/new", heading: "Create Your First Shop", control: "Create Shop", role: "button" },
  { path: "/owner/finance", heading: "Finance dashboard", control: "Refresh finance", role: "button" },
  { path: "/owner/auctions", heading: "Shop Auctions", control: "Export CSV", role: "button" },
] as const;

const pagination = { page: 1, limit: 25, total: 0, totalPages: 0 };

async function installOwner(page: Page, theme: "light" | "dark") {
  await page.addInitScript((activeTheme) => {
    localStorage.setItem("pawnloop-theme-v2", activeTheme);
    localStorage.setItem("auth_token", "owner-core-readability-token");
    localStorage.setItem("auth_role", "OWNER");
    localStorage.setItem("auth_user", JSON.stringify({
      id: "owner-core-readability",
      name: "Owner Readability",
      email: "owner-readability@example.test",
      role: "OWNER",
      ownerApplication: { id: "owner-application", status: "APPROVED" },
    }));
    localStorage.setItem("pawnloop-navigation-assistance-OWNER-v2", JSON.stringify({
      automaticPrompts: false,
      completedTopics: ["full-tour"],
      dismissedGuidance: true,
      floatingButtonVisible: false,
    }));
  }, theme);

  await page.route("**/api/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;

    if (pathname.endsWith("/auth/me")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: {
        id: "owner-core-readability",
        name: "Owner Readability",
        email: "owner-readability@example.test",
        role: "OWNER",
        ownerApplication: { id: "owner-application", status: "APPROVED" },
      } }) });
    }

    if (pathname.endsWith("/auth/shop-access")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access: {
        role: "OWNER",
        unrestricted: true,
        shopIds: [SHOP_ID],
        permissions: [],
        capabilities: {
          inventoryRead: true,
          inventoryWrite: true,
          auctionsRead: true,
          auctionsWrite: true,
          offersRead: true,
          offersWrite: true,
          locationsRead: true,
          locationsWrite: true,
          staffRead: true,
          staffWrite: true,
          settlementsRead: true,
        },
        shops: [{ id: SHOP_ID, name: "Owner Readability Shop" }],
      } }) });
    }

    if (pathname.endsWith("/shops/mine")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [{ id: SHOP_ID, name: "Owner Readability Shop" }] }) });
    }
    if (pathname.endsWith("/items/mine")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [] }) });
    }
    if (pathname.endsWith("/auctions/mine")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ auctions: [] }) });
    }
    if (pathname.endsWith(`/shops/${SHOP_ID}/finance/balance`)) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        success: true,
        shop: { id: SHOP_ID, name: "Owner Readability Shop", ownerId: "owner-core-readability" },
        balance: { sellerUserId: "owner-core-readability", shopId: SHOP_ID, currency: "USD", pendingCents: 2500, availableCents: 5000, heldCents: 0, paidCents: 10000, reversedCents: 0, totalCents: 17500, entryCount: 2 },
        minimumPayoutCents: 1000,
      }) });
    }
    if (pathname.endsWith(`/shops/${SHOP_ID}/finance/ledger`)) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, rows: [], pagination, filters: { type: null, status: null, from: null, to: null } }) });
    }
    if (pathname.endsWith(`/shops/${SHOP_ID}/finance/payouts`)) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, rows: [], bankPayouts: [], pagination, filters: { status: null, from: null, to: null } }) });
    }
    if (pathname.endsWith(`/shops/${SHOP_ID}/finance/connect/status`)) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, connect: {
        enabled: true,
        state: "SETUP_INCOMPLETE",
        hasAccount: true,
        detailsSubmitted: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        onboardingCompletedAt: null,
        statusUpdatedAt: null,
        requirements: { currentlyDue: ["external_account"], eventuallyDue: [], pastDue: [], disabledReason: null },
        payoutSchedule: null,
        externalAccount: null,
      } }) });
    }

    return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ success: false, error: "Owner readability fixture has no response for this request." }) });
  });
}

async function expectReadable(locator: Locator) {
  await expect(locator).toBeVisible();
  const presentation = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return { color: style.color, background: style.backgroundColor, opacity: Number(style.opacity) };
  });
  expect(presentation.opacity).toBeGreaterThanOrEqual(0.65);
  expect(presentation.color).not.toBe(presentation.background);
}

async function expectNoPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

async function expectNoSeriousAxeViolations(page: Page) {
  const serious = (await new AxeBuilder({ page }).analyze()).violations.filter((violation) =>
    violation.impact === "serious" || violation.impact === "critical");
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

for (const theme of ["light", "dark"] as const) {
  for (const ownerRoute of ownerRoutes) {
    test(`${ownerRoute.heading} is readable and keyboard accessible in ${theme} mode`, async ({ page }) => {
      await page.setViewportSize({ width: theme === "light" ? 1280 : 320, height: 900 });
      await installOwner(page, theme);
      await page.goto(ownerRoute.path);

      await expectReadable(page.getByRole("heading", { name: ownerRoute.heading }).first());
      const control = page.getByRole(ownerRoute.role, { name: ownerRoute.control }).first();
      await expectReadable(control);
      await control.focus();
      await expect(control).toBeFocused();
      expect(await control.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");

      if (ownerRoute.path === "/owner/items/new") {
        await expectReadable(page.getByText("Add inventory to your pawnshop marketplace.", { exact: true }));
        await expectReadable(page.getByText("Title", { exact: true }));
      }

      if (ownerRoute.path === "/owner/shops/new") {
        await expectReadable(page.getByText("Shop Name", { exact: true }));
        await expectReadable(page.getByPlaceholder("Downtown Pawn"));
        await page.getByPlaceholder("Downtown Pawn").fill("   ");
        await control.click();
        await expectReadable(page.getByRole("alert"));
      }

      if (ownerRoute.path === "/owner/finance") {
        await expectReadable(page.getByText("Payout setup", { exact: true }));
        const ledger = page.locator(
          '.owner-finance-table-wrap[aria-label="Ledger activity table"]',
        );
        await ledger.focus();
        await expect(ledger).toBeFocused();
        expect(await ledger.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
      }

      if (ownerRoute.path === "/owner/auctions") {
        await expectReadable(page.getByRole("heading", { name: "Daily Auction Controls" }));
      }

      const setup = page.getByRole("button", { name: /Owner setup/ });
      if (await setup.count()) {
        const [setupBox, controlBox] = await Promise.all([setup.boundingBox(), control.boundingBox()]);
        if (setupBox && controlBox) {
          const overlaps = setupBox.x < controlBox.x + controlBox.width
            && setupBox.x + setupBox.width > controlBox.x
            && setupBox.y < controlBox.y + controlBox.height
            && setupBox.y + setupBox.height > controlBox.y;
          expect(overlaps).toBe(false);
        }
      }

      await expectNoPageOverflow(page);
      await expectNoSeriousAxeViolations(page);
    });
  }
}

for (const profile of [
  { name: "desktop", width: 1440, zoom: false },
  { name: "tablet", width: 768, zoom: false },
  { name: "mobile", width: 320, zoom: false },
  { name: "desktop at 200 percent zoom", width: 1440, zoom: true },
] as const) {
  test(`Owner core routes reflow at ${profile.name}`, async ({ page }) => {
    await page.setViewportSize({ width: profile.width, height: 900 });
    await installOwner(page, "light");

    for (const ownerRoute of ownerRoutes) {
      await page.goto(ownerRoute.path);
      if (profile.zoom) await page.evaluate(() => { document.body.style.zoom = "2"; });
      await expect(page.getByRole("heading", { name: ownerRoute.heading }).first()).toBeVisible();
      await expectNoPageOverflow(page);
      if (profile.zoom) await page.evaluate(() => { document.body.style.zoom = ""; });
    }
  });
}
