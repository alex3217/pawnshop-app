import { expect, test, type Page, type Route } from "@playwright/test";

test.setTimeout(120_000);

const shops = [
  { id: "shop-a", name: "Alpha Pawn", address: "", phone: "", hours: "", description: "" },
  { id: "shop-b", name: "Bravo Pawn", address: "2 Main", phone: "555-0200", hours: "9-5", description: "Ready" },
];

const definitions = [
  ["shop-created", "/owner/onboarding", "shop-profile", "/owner/locations", "shop-name"],
  ["shop-name", "/owner/locations", "shop-name", "/owner/locations", "shop-name"],
  ["shop-address", "/owner/locations", "shop-address", "/owner/locations", "shop-address"],
  ["shop-phone", "/owner/locations", "shop-phone", "/owner/locations", "shop-phone"],
  ["shop-hours", "/owner/locations", "shop-hours", "/owner/locations", "shop-hours"],
  ["shop-description", "/owner/locations", "shop-description", "/owner/locations", "shop-description"],
  ["seller-plan", "/owner/subscription", "seller-plan", "/owner/subscription", "seller-plan"],
  ["staff", "/owner/staff", "invite-staff", "/owner/staff", "invite-staff"],
  ["inventory", "/owner/items/new", "item-details", "/owner/inventory", "inventory-list"],
] as const;

function progress(complete: boolean) {
  const items = definitions.map(([id, path, anchor, editPath, editAnchor], index) => ({
    id, label: `Setup ${id}`, description: `Configure ${id}`,
    href: `${path}${id === "shop-created" ? "?step=1" : ""}#${anchor}`,
    editHref: `${editPath}#${editAnchor}`, required: index !== 5 && index !== 7, complete,
  }));
  return { completedCount: complete ? 9 : 0, totalCount: 9, percentComplete: complete ? 100 : 0, readyToLaunch: complete, launched: false, items };
}

async function session(page: Page, activeShop = "shop-a") {
  await page.addInitScript(({ selectedShop }) => {
    if (sessionStorage.getItem("owner-session-seeded")) return;
    sessionStorage.setItem("owner-session-seeded", "1");
    localStorage.setItem("auth_token", "owner-token");
    localStorage.setItem("auth_role", "OWNER");
    localStorage.setItem("auth_user", JSON.stringify({ id: "owner-1", name: "Owner", email: "owner@test", role: "OWNER", ownerApplication: { id: "app-1", status: "APPROVED", submittedAt: null, reviewedAt: null, decisionReason: null, statusChangedAt: null } }));
    localStorage.setItem("pawnloop-owner-active-shop-owner-1", selectedShop);
    // This checklist-focused suite deliberately opts out of the supported
    // automatic navigation prompt while leaving assistance coverage untouched.
    localStorage.setItem("pawnloop-navigation-assistance-OWNER-v2", JSON.stringify({
      automaticPrompts: false,
      completedTopics: ["full-tour"],
      dismissedGuidance: true,
      floatingButtonVisible: false,
    }));
  }, { selectedShop: activeShop });
}

async function fulfill(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockOwnerApi(page: Page) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api/, "");
    if (path === "/auth/me") return fulfill(route, { user: { id: "owner-1", name: "Owner", email: "owner@test", role: "OWNER", ownerApplication: { id: "app-1", status: "APPROVED" } } });
    if (path === "/auth/shop-access") return fulfill(route, { access: { role: "OWNER", unrestricted: true, shopIds: shops.map((shop) => shop.id), permissions: ["*"], capabilities: { locationsRead: true }, shops: [] } });
    if (path === "/notifications") return fulfill(route, { success: true, notifications: [] });
    if (path === "/shops/mine") return fulfill(route, shops);
    const progressMatch = path.match(/^\/shops\/(shop-[ab])\/onboarding\/progress$/);
    if (progressMatch) return fulfill(route, progress(progressMatch[1] === "shop-b"));
    if (path === "/items/mine") return fulfill(route, []);
    if (path === "/buyer/item-submissions/owner") return fulfill(route, []);
    if (path.endsWith("/entitlements")) return fulfill(route, { entitlements: { shopId: path.includes("shop-b") ? "shop-b" : "shop-a", shopName: "Shop", subscription: { storedPlan: "FREE", effectivePlan: "FREE", status: "ACTIVE", cancelAtPeriodEnd: false }, billing: { commissionPercent: 0, monthlyPriceCents: 0, yearlyPriceCents: 0 }, usage: { activeListingCount: 0, remainingActiveListings: null, isUnlimitedListings: true }, features: { canCreateAuctions: false, canFeatureListings: false, analyticsLevel: "none" }, limits: { maxActiveListings: null, maxLocations: null, maxStaffUsers: null } } });
    if (path === "/platform-settings/founding-shop-program") return fulfill(route, { program: { enabled: false } });
    if (path === "/locations/mine") return fulfill(route, shops);
    if (path === "/staff/mine") return fulfill(route, { staff: [], pagination: { total: 0 } });
    if (path === "/staff/shops") return fulfill(route, shops);
    if (path === "/seller-plans") return fulfill(route, { plans: [{ code: "FREE", label: "Free", monthlyPriceCents: 0, yearlyPriceCents: 0, features: [] }] });
    return fulfill(route, { success: true, rows: [], items: [], data: [] });
  });
}

async function openChecklist(page: Page, complete: boolean) {
  const trigger = page.getByRole("button", { name: /Owner setup/ });
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(trigger).toContainText(complete ? "9/9" : "0/9");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const checklist = page.getByLabel("Pawn shop owner setup checklist");
  await expect(checklist).toBeVisible();
  await expect(checklist.getByLabel(`${complete ? 100 : 0}% complete`)).toBeVisible();
  await expect(checklist.getByText(`${complete ? 9 : 0} of 9 complete`, { exact: true })).toBeVisible();
}

async function expectActiveShop(page: Page, expectedShop: "shop-a" | "shop-b", complete: boolean) {
  await expect.poll(() => page.evaluate(() => localStorage.getItem("pawnloop-owner-active-shop-owner-1"))).toBe(expectedShop);
  await expect(page.locator("section").filter({ hasText: "Selected shop" }).locator("select").first()).toHaveValue(expectedShop);
  await expect(page.getByRole("button", { name: /Owner setup/ })).toContainText(complete ? "9/9" : "0/9");
}

test("all nine actions render correct route, anchor, and completion copy", async ({ page }) => {
  await session(page);
  await mockOwnerApi(page);
  for (const complete of [false, true]) {
    const expectedShop = complete ? "shop-b" : "shop-a";
    if (complete) {
      await page.goto("/owner");
      const shopSelector = page.locator("section").filter({ hasText: "Selected shop" }).locator("select").first();
      await shopSelector.selectOption("shop-b");
      await expectActiveShop(page, "shop-b", true);
    }
    for (const [id, path, anchor, editPath, editAnchor] of definitions) {
      await page.goto("/owner");
      await expectActiveShop(page, expectedShop, complete);
      await openChecklist(page, complete);
      const item = page.locator(".role-checklist-item").filter({ hasText: `Setup ${id}` });
      await expect(item).toHaveClass(complete ? /\bcomplete\b/ : /^(?!.*\bcomplete\b)/);
      const action = item.getByRole("link", { name: complete ? "Edit" : "Complete setup" });
      await expect(action).toBeVisible();
      await action.click();
      const expectedPath = complete ? editPath : path;
      const expectedAnchor = complete ? editAnchor : anchor;
      await expect(page).toHaveURL(new RegExp(`${expectedPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\?[^#]*shopId=${expectedShop}(?:&[^#]*)?#${expectedAnchor}$`));
      expect(new URL(page.url()).searchParams.get("shopId")).toBe(expectedShop);
      expect(new URL(page.url()).hash).toBe(`#${expectedAnchor}`);
      await expect(page.locator(`#${expectedAnchor}`)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
    }
  }
});

test("active shop synchronizes dashboard and floating progress across switching and reload", async ({ page }) => {
  await session(page, "shop-b");
  await mockOwnerApi(page);
  await page.goto("/owner");
  const shopSelector = page.locator("section").filter({ hasText: "Selected shop" }).locator("select").first();
  await expectActiveShop(page, "shop-b", true);
  await openChecklist(page, true);
  await page.getByRole("button", { name: "Close setup" }).click();
  await shopSelector.selectOption("shop-a");
  await expectActiveShop(page, "shop-a", false);
  await openChecklist(page, false);
  await page.getByRole("button", { name: "Close setup" }).click();
  await page.reload();
  await expectActiveShop(page, "shop-a", false);
  await openChecklist(page, false);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("rapid shop switching keeps onboarding actions bound to the user's latest selection", async ({ page }) => {
  await session(page, "shop-a");
  await mockOwnerApi(page);
  await page.goto("/owner");
  const shopSelector = page.locator("section").filter({ hasText: "Selected shop" }).locator("select").first();
  await shopSelector.selectOption("shop-b");
  await openChecklist(page, true);
  const action = page.locator(".role-checklist-item").filter({ hasText: "Setup shop-name" }).getByRole("link", { name: "Edit" });
  await action.click();
  await expect(page).toHaveURL(/\/owner\/locations\?shopId=shop-b#shop-name$/);
  expect(new URL(page.url()).searchParams.get("shopId")).toBe("shop-b");
  await page.goto("/owner");
  await expectActiveShop(page, "shop-b", true);
  await page.reload();
  await expectActiveShop(page, "shop-b", true);
});

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 900, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`deep-linked setup fields remain below the header at ${viewport.name} size`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await session(page);
    await mockOwnerApi(page);
    for (const [, path, anchor] of definitions) {
      await page.goto(`${path}?shopId=shop-a#${anchor}`);
      const target = page.locator(`#${anchor}`);
      await expect(target).toBeVisible({ timeout: 30_000 });
      const positions = await page.evaluate((id) => {
        const header = document.querySelector(".site-header")?.getBoundingClientRect();
        const field = document.getElementById(id)?.getBoundingClientRect();
        return { headerBottom: header?.bottom || 0, fieldTop: field?.top || 0 };
      }, anchor);
      expect(positions.fieldTop).toBeGreaterThanOrEqual(positions.headerBottom - 1);
    }
  });
}
