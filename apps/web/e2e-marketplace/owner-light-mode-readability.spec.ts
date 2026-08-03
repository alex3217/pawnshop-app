import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

const routes = [
  { path: "/owner/items/new", heading: "Create Item", sample: "Back to Inventory", role: "link" },
  { path: "/owner/shops/new", heading: "Create Your First Shop", sample: "Create Shop", role: "button" },
  { path: "/owner/marketing", heading: "Marketing Center", sample: "Create shop", role: "link" },
  { path: "/owner/finance", heading: "Finance dashboard", sample: "Refresh finance", role: "button" },
  { path: "/owner/auctions", heading: "Shop Auctions", sample: "Export CSV", role: "button" },
  { path: "/marketplace/listings/mine", heading: "My Marketplace Listings", sample: "Create listing", role: "link" },
  { path: "/items/cms4rzoke002pxxvw3q0rwfwm", heading: "Readability Test Item", sample: "Buyer protection help", role: "link" },
  { path: "/owner/business-growth", heading: "Business Growth", sample: "Try again", role: "button" },
  { path: "/marketplace/listings/new", heading: "Create Marketplace Listing", sample: "My Listings", role: "link" },
  { path: "/shops/owner-one-pawn-8na0d0", heading: "Owner One Pawn", sample: "View Item", role: "link" },
] as const;

async function installOwner(page: Page, theme: "light" | "dark") {
  await page.addInitScript((activeTheme) => {
    localStorage.setItem("pawnloop-theme-v2", activeTheme);
    localStorage.setItem("auth_token", "owner-readability-token");
    localStorage.setItem("auth_role", "OWNER");
    localStorage.setItem("auth_user", JSON.stringify({
      id: "owner-readability", name: "Owner Readability", email: "owner@example.test", role: "OWNER",
      ownerApplication: { id: "application-readability", status: "APPROVED" },
    }));
    localStorage.setItem("pawnloop-navigation-assistance-OWNER-v2", JSON.stringify({ automaticPrompts: false, completedTopics: ["full-tour"], dismissedGuidance: true, floatingButtonVisible: false }));
  }, theme);
  await page.route("**/api/**", (route) => {
    if (new URL(route.request().url()).pathname.endsWith("/auth/me")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: {
        id: "owner-readability", name: "Owner Readability", email: "owner@example.test", role: "OWNER",
        ownerApplication: { id: "application-readability", status: "APPROVED", submittedAt: null, reviewedAt: null, decisionReason: null, statusChangedAt: null },
      } }) });
    }
    if (new URL(route.request().url()).pathname.endsWith("/auth/shop-access")) {
      const capabilities = { inventoryRead: true, inventoryWrite: true, auctionsRead: true, auctionsWrite: true, offersRead: true, offersWrite: true, locationsRead: true, locationsWrite: true, staffRead: true, staffWrite: true, settlementsRead: true, marketingRead: true, marketingWrite: true };
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ access: { role: "OWNER", unrestricted: true, shopIds: [], permissions: [], capabilities, shops: [] } }) });
    }
    if (new URL(route.request().url()).pathname.endsWith("/marketplace-listings/mine")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [], pagination: { page: 1, limit: 24, total: 0, totalPages: 0 } }) });
    }
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/shops/owner-one-pawn-8na0d0/items")) {
      const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        shop: { id: "owner-one-pawn-8na0d0", name: "Owner One Pawn", address: null, phone: "713-555-0188", hours: null, description: "A neighborhood shop with clear, honest inventory details." },
        items: [
          { id: "storefront-available", pawnShopId: "owner-one-pawn-8na0d0", title: "Alpha Camera", description: "A long but readable description for a tested camera with enough detail to wrap naturally on narrow storefront cards without creating horizontal overflow.", price: "125", images: ["not-an-image", pixel], category: "Electronics", condition: "Good", status: "AVAILABLE" },
          { id: "storefront-pending", pawnShopId: "owner-one-pawn-8na0d0", title: "Beta Guitar", description: "Created by check:app-flow-full", price: "275", images: [], category: "Music", condition: "Very Good", status: "PENDING" },
          { id: "storefront-sold", pawnShopId: "owner-one-pawn-8na0d0", title: "Gamma Tool Set", description: null, price: "80", images: [], category: "Tools", condition: "Fair", status: "SOLD" },
        ],
      }) });
    }
    if (pathname.endsWith("/items/cms4rzoke002pxxvw3q0rwfwm")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "cms4rzoke002pxxvw3q0rwfwm", pawnShopId: "shop-readability", title: "Readability Test Item", description: "A complete item used for confidence-action readability.", price: "125", currency: "USD", images: [], category: "Tools", condition: "Good", status: "AVAILABLE", shop: { id: "shop-readability", name: "Readability Shop", address: "1 Main St", phone: "555-0100" } }) });
    }
    if (pathname.endsWith("/shops/mine")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [{ id: "shop-readability", name: "Readability Shop" }] }) });
    }
    if (pathname.endsWith("/items/mine")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ rows: [] }) });
    }
    if (pathname.endsWith("/shops/shop-readability/entitlements")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ entitlements: { limits: { maxItemPhotos: 8 } } }) });
    }
    if (pathname.endsWith("/shops/shop-readability/business-growth")) {
      const usage = { used: 1, limit: 10, unlimited: false, remaining: 9, atLimit: false, nearLimit: false };
      const growth = { generatedAt: "2026-08-03T15:30:00.000Z", shop: { id: "shop-readability", name: "Readability Shop" }, overview: { activeListings: 4, inventoryAddedRecently: 3, soldInventory: 2, orders: 3, completedSales: 2, pendingOffers: 1, auctions: 1, inquiries: 5, activeQrCampaigns: 1, qrScans: 12 }, health: { score: 78, maximum: 100, calculationVersion: "v1", disclaimer: "Operational guidance only.", components: [{ id: "storefront", label: "Storefront completeness", score: 25, maximum: 30, checks: [{ id: "profile", label: "Shop profile", complete: true, evidence: "Profile present", recommendedAction: null }] }, { id: "inventory", label: "Inventory quality", score: 28, maximum: 35, checks: [{ id: "photos", label: "Item photos", complete: false, evidence: "2 active listings have no photos", recommendedAction: "Add photos" }] }, { id: "customers", label: "Customer readiness", score: 25, maximum: 35, checks: [] }] }, marketingChecklist: [{ id: "campaign", label: "Create a campaign", complete: false, route: "/owner/marketing" }], inventoryInsights: { activeListings: 4, withoutPhotos: 2 }, customerInsights: { inquiries: 5, uniqueCompletedBuyers: 2 }, revenueSummary: { source: "orders", currency: "USD", completedSales: 2, grossSalesCents: 25000, platformFeesCents: 1250, note: "Completed activity only." }, opportunities: [{ id: "photos", reason: "2 active listings have no photos.", action: "Add listing photos", route: "/owner/inventory", priority: "HIGH", complete: false, supportingMetric: 2 }], businessCoach: { mode: "RULE_BASED", calculationVersion: "v1", recommendations: [{ statement: "Add complete photos.", action: "Review inventory", route: "/owner/inventory", priority: "HIGH" }] }, planUsage: { displayName: "Core", sellerPlan: "CORE", status: "ACTIVE", usage: { listings: usage }, commission: { commissionBps: 500 }, featureLevels: {}, implementation: { implemented: ["Listings"], planned: ["Advanced analytics"] } }, marketplaceIntelligence: { version: "v1", aggregateOnly: true, access: { level: "CORE", planLimited: false, limitation: null }, inventory: { activeListings: 4 }, sales: { completedSales: 2 }, categoryPerformance: [{ category: "Tools", activeListings: 4, completedSales: 2 }], fastMovingCategories: ["Tools"], slowMovingCategories: [], inventoryOpportunities: [], limitations: ["Aggregate data only."] }, unavailable: ["followers", "generalPageViews", "benchmarking", "persistentGoals"] };
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, growth }) });
    }
    return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ success: false, error: "Readability fixture" }) });
  });
}

async function expectReadable(locator: Locator) {
  await expect(locator).toBeVisible();
  const colors = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return { foreground: style.color, background: style.backgroundColor, opacity: Number(style.opacity) };
  });
  expect(colors.opacity).toBeGreaterThanOrEqual(0.65);
  expect(colors.foreground).not.toBe(colors.background);
}

for (const theme of ["light", "dark"] as const) {
  for (const route of routes) {
    test(`${route.heading} is readable in ${theme} mode`, async ({ page }) => {
      await page.setViewportSize({ width: theme === "light" ? 1280 : 320, height: 800 });
      await installOwner(page, theme);
      await page.goto(route.path);

      await expectReadable(page.getByRole("heading", { name: route.heading }).first());
      const sample = page.getByRole(route.role, { name: route.sample }).first();
      if (await sample.count()) await expectReadable(sample);

      if (route.path === "/owner/shops/new") {
        await expectReadable(page.getByText("Shop Name", { exact: true }));
        await expectReadable(page.getByPlaceholder("Downtown Pawn"));
      }
      if (route.path === "/owner/finance") {
        await expectReadable(page.getByRole("button", { name: "Ledger activity" }));
        await expectReadable(page.getByText("Payout setup", { exact: true }));
      }
      if (route.path === "/owner/auctions") {
        await expectReadable(page.getByRole("heading", { name: "Daily Auction Controls" }));
      }
      if (route.path === "/marketplace/listings/mine") {
        const createListing = page.locator(".seller-listings-hero-actions .seller-listings-primary-action");
        await expect(createListing).toHaveCSS("color", "rgb(255, 255, 255)");
        await expect(createListing).toHaveCSS("-webkit-text-fill-color", "rgb(255, 255, 255)");
        await createListing.hover();
        await expect(createListing).toHaveCSS("color", "rgb(255, 255, 255)");
        await createListing.focus();
        await expect(createListing).toBeFocused();
        expect(await createListing.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
      }
      if (route.path.startsWith("/items/")) {
        const actions = page.locator(".item-detail-confidence-actions");
        for (const name of ["Ask about condition", "Save to watchlist", "Discuss pickup", "Buyer protection help"]) {
          const action = actions.getByRole(name === "Buyer protection help" ? "link" : "button", { name });
          await expectReadable(action);
          await expect(action).toHaveCSS("-webkit-text-fill-color", theme === "light" ? "rgb(49, 46, 129)" : "rgb(248, 250, 252)");
        }
        const save = actions.getByRole("button", { name: "Save to watchlist" });
        await save.evaluate((element) => element.setAttribute("disabled", ""));
        await expect(save).toHaveCSS("opacity", "1");
        await expectReadable(save);
      }
      if (route.path === "/owner/business-growth") {
        await expectReadable(page.getByRole("heading", { name: "Growth overview" }));
        await expectReadable(page.getByText("Active listings", { exact: true }));
        await expect(page.getByRole("heading", { name: "Business Growth controls" })).toBeVisible();
        await expect(page.getByText("Readability Shop", { exact: true }).first()).toBeVisible();
        await expect(page.getByText("Current authorized snapshot", { exact: true }).first()).toBeVisible();
        await expect(page.getByRole("combobox", { name: "Date range" })).toHaveCount(0);
        const compare = page.getByRole("combobox", { name: "Compare" });
        await expect(compare).toHaveValue("Unavailable");
        await expect(compare).toBeDisabled();
        await expectReadable(compare);
        await expect(page.getByRole("button", { name: "Refresh Insights" })).toBeEnabled();
        await page.getByRole("button", { name: "Refresh Insights" }).click();
        await expect(page.getByText(/Last updated:/)).not.toContainText("Not yet loaded");
        for (const [name, href] of [["Add Inventory", "/owner/items/new"], ["Manage Inventory", "/owner/inventory"], ["Review Pending Offers", "/offers"], ["Create Auction", "/owner/auctions/new"], ["Manage Auctions", "/owner/auctions"], ["View Sales", "/marketplace/sales"], ["Open Marketing Center", "/owner/marketing"]] as const) await expect(page.getByRole("link", { name }).first()).toHaveAttribute("href", href);
        await expect(page.getByText("Inventory added", { exact: true })).toBeVisible();
        await expect(page.getByText("Items marked sold", { exact: true })).toBeVisible();
        await expect(page.getByText("Completed marketplace sales", { exact: true }).first()).toBeVisible();
        await expect(page.getByText("Active QR campaigns", { exact: true })).toBeVisible();
        await expect(page.getByText("QR scans", { exact: true })).toBeVisible();
        await expect(page.getByText("Trailing 30 days", { exact: true })).toBeVisible();
        await expect(page.getByText("Current", { exact: true }).first()).toBeVisible();
        await expect(page.getByText("All recorded activity", { exact: true }).first()).toBeVisible();
        await expect(page.getByText(/\bQr\b/)).toHaveCount(0);
        await expectReadable(page.getByRole("heading", { name: /Shop Health/ }));
        await expect(page.getByRole("progressbar", { name: /Overall Shop Health/ })).toHaveAttribute("value", "78");
        await expect(page.getByText("Evidence: 2 active listings have no photos")).toBeVisible();
        await expect(page.getByRole("heading", { name: "Recommended Next Actions" })).toBeVisible();
        await expect(page.getByRole("link", { name: "Take Action" })).toHaveAttribute("href", "/owner/inventory");
        await page.getByText("Learn Why").click();
        await expect(page.getByText(/This action appears because/)).toBeVisible();
        await expect(page.getByText("Benchmarking", { exact: true })).toBeVisible();
        await expect(page.getByRole("table")).toBeVisible();
        if (theme === "light") {
          const downloadPromise = page.waitForEvent("download");
          await page.getByRole("button", { name: "Export Report" }).click();
          const download = await downloadPromise;
          const stream = await download.createReadStream();
          const chunks: Buffer[] = [];
          for await (const chunk of stream) chunks.push(Buffer.from(chunk));
          const csv = Buffer.concat(chunks).toString("utf8");
          expect(csv).toContain("Active listings");
          expect(csv).toContain("Current authorized snapshot");
          expect(csv).toContain("Trailing 30 days");
          expect(csv).toContain("All recorded activity");
          expect(csv).not.toContain("selectedPeriod");
          expect(csv).toContain("Readability Shop");
        }
      }
      if (route.path === "/marketplace/listings/new") {
        for (const heading of ["Listing destination", "Item details", "Pricing and quantity", "Photos", "Purchase options"]) await expectReadable(page.getByRole("heading", { name: heading }));
        const imageLimitStatus = page.getByText("Loading seller image limit…");
        if (await imageLimitStatus.count()) await expectReadable(imageLimitStatus);
        await expectReadable(page.getByText("Listing title", { exact: true }));
      }
      if (route.path.startsWith("/shops/")) {
        await expectReadable(page.getByText("No address provided", { exact: true }));
        await expectReadable(page.getByRole("link", { name: "713-555-0188" }));
        await expect(page.getByRole("link", { name: "713-555-0188" })).toHaveAttribute("href", "tel:713-555-0188");
        await expectReadable(page.getByText("Hours not listed", { exact: true }));
        await expectReadable(page.getByText("A neighborhood shop with clear, honest inventory details."));

        const search = page.getByRole("textbox", { name: "Search" });
        await expect(search).toHaveAttribute("placeholder", "Search items in this shop...");
        await expectReadable(search);
        for (const label of ["Search", "Category", "Condition", "Status", "Sort By"]) await expectReadable(page.getByText(label, { exact: true }).first());
        const clear = page.getByRole("button", { name: "Clear Filters" });
        await expect(clear).toBeDisabled();
        await expectReadable(clear);

        const summary = page.locator(".shop-detail-stats");
        await expect(summary.getByText("All items", { exact: true })).toBeVisible();
        await expect(summary.getByText("Matching items", { exact: true })).toBeVisible();
        await expect(summary.getByText("Visible inventory value", { exact: true })).toBeVisible();
        await expect(summary.getByText("3", { exact: true }).first()).toBeVisible();
        await expect(summary.getByText("$480.00", { exact: true })).toBeVisible();

        for (const title of ["Alpha Camera", "Beta Guitar", "Gamma Tool Set"]) await expectReadable(page.getByRole("heading", { name: title }));
        const cards = page.locator(".shop-detail-item-card");
        for (const value of ["$125.00", "$275.00", "$80.00", "AVAILABLE", "PENDING", "SOLD", "Electronics", "Good", "Created by check:app-flow-full", "No description provided."]) await expectReadable(cards.getByText(value, { exact: true }).first());
        await expect(page.getByRole("img", { name: "Alpha Camera" })).toBeVisible();
        await expect(page.getByRole("img", { name: "No image available for Beta Guitar" })).toBeVisible();

        const viewItem = page.getByRole("link", { name: "View Item" }).first();
        await expect(viewItem).toHaveCSS("color", "rgb(255, 255, 255)");
        await expect(viewItem).toHaveCSS("-webkit-text-fill-color", "rgb(255, 255, 255)");
        await viewItem.hover();
        await expect(viewItem).toHaveCSS("color", "rgb(255, 255, 255)");
        await viewItem.focus();
        expect(await viewItem.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");

        await search.fill("guitar");
        await expect(page.getByRole("heading", { name: "Beta Guitar" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Alpha Camera" })).toHaveCount(0);
        await expect(summary.getByText("1", { exact: true })).toBeVisible();
        await clear.click();
        await expect(page.getByRole("heading", { name: "Alpha Camera" })).toBeVisible();
        await page.getByRole("combobox", { name: "Status" }).selectOption("SOLD");
        await expect(page.getByRole("heading", { name: "Gamma Tool Set" })).toBeVisible();
        await clear.click();
        await page.getByRole("combobox", { name: "Sort By" }).selectOption("PRICE_HIGH_LOW");
        await expect(page.locator(".shop-detail-item-card h3").first()).toHaveText("Beta Guitar");
        await clear.click();
      }

      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      const serious = (await new AxeBuilder({ page }).analyze()).violations.filter((violation) => ["serious", "critical"].includes(violation.impact || ""));
      expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);

      const setup = page.getByRole("button", { name: /Owner setup/ });
      if (await setup.count() && await sample.count()) {
        const [setupBox, sampleBox] = await Promise.all([setup.boundingBox(), sample.boundingBox()]);
        if (setupBox && sampleBox) {
          const overlaps = setupBox.x < sampleBox.x + sampleBox.width && setupBox.x + setupBox.width > sampleBox.x && setupBox.y < sampleBox.y + sampleBox.height && setupBox.y + setupBox.height > sampleBox.y;
          expect(overlaps).toBe(false);
        }
      }
      if (theme === "light") {
        await page.evaluate(() => { document.body.style.zoom = "2"; });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
        await page.evaluate(() => { document.body.style.zoom = ""; });
      }
      if (route.path === "/marketplace/listings/mine") {
        await page.locator(".seller-listings-hero-actions .seller-listings-primary-action").press("Enter");
        await expect(page).toHaveURL(/\/marketplace\/listings\/new$/);
      }
    });
  }
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
  test(`Business Growth visual QA at ${profile.name}`, async ({ page }) => {
    await page.setViewportSize({ width: profile.width, height: 900 });
    await installOwner(page, profile.theme);
    await page.goto("/owner/business-growth");
    await expect(page.getByRole("heading", { name: "Business Growth Center" })).toBeVisible();
    if (profile.zoom) await page.evaluate(() => { document.body.style.zoom = "2"; });

    const heroHeight = await page.locator(".growth-hero").evaluate((element) => element.getBoundingClientRect().height);
    expect(heroHeight / (profile.zoom ? 2 : 1)).toBeLessThan(260);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(page.getByText("Current authorized snapshot", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("progressbar", { name: /Overall Shop Health/ })).toBeVisible();
    await expect(page.getByText("Evidence: 2 active listings have no photos")).toBeVisible();

    const refresh = page.getByRole("button", { name: "Refresh Insights" });
    await refresh.focus();
    await refresh.press("Tab");
    const exportButton = page.getByRole("button", { name: "Export Report" });
    await expect(exportButton).toBeFocused();
    expect(await exportButton.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");

    const setup = page.getByRole("button", { name: /Owner setup/ });
    const action = page.getByRole("link", { name: "Manage Inventory" });
    if (await setup.count()) {
      const [setupBox, actionBox] = await Promise.all([setup.boundingBox(), action.boundingBox()]);
      if (setupBox && actionBox) {
        const overlaps = setupBox.x < actionBox.x + actionBox.width && setupBox.x + setupBox.width > actionBox.x && setupBox.y < actionBox.y + actionBox.height && setupBox.y + setupBox.height > actionBox.y;
        expect(overlaps).toBe(false);
      }
    }
    const serious = (await new AxeBuilder({ page }).analyze()).violations.filter((violation) => ["serious", "critical"].includes(violation.impact || ""));
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
}
