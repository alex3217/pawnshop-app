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

async function openChecklist(page: Page) {
  await page.getByRole("button", { name: /Owner setup/ }).click();
  await expect(page.getByLabel("Pawn shop owner setup checklist")).toBeVisible();
}

test("all nine actions render correct route, anchor, and completion copy", async ({ page }) => {
  await session(page);
  await mockOwnerApi(page);
  for (const complete of [false, true]) {
    await page.addInitScript((selectedShop) => localStorage.setItem("pawnloop-owner-active-shop-owner-1", selectedShop), complete ? "shop-b" : "shop-a");
    for (const [id, path, anchor, editPath, editAnchor] of definitions) {
      await page.goto("/owner");
      await openChecklist(page);
      const item = page.locator(".role-checklist-item").filter({ hasText: `Setup ${id}` });
      const action = item.getByRole("link", { name: complete ? "Edit" : "Complete setup" });
      await expect(action).toBeVisible();
      await action.click();
      await expect(page).toHaveURL(new RegExp(`${complete ? editPath : path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\?[^#]*shopId=shop-[ab][^#]*#${complete ? editAnchor : anchor}$`));
    }
  }
});

test("active shop synchronizes dashboard and floating progress across switching and reload", async ({ page }) => {
  await session(page, "shop-b");
  await mockOwnerApi(page);
  await page.goto("/owner");
  const shopSelector = page.locator("section").filter({ hasText: "Selected shop" }).locator("select").first();
  await expect(shopSelector).toHaveValue("shop-b", { timeout: 30_000 });
  await expect(page.getByRole("button", { name: /Owner setup/ })).toContainText("9/9");
  await shopSelector.selectOption("shop-a");
  await expect(page.getByRole("button", { name: /Owner setup/ })).toContainText("0/9");
  await page.reload();
  await expect(page.locator("section").filter({ hasText: "Selected shop" }).locator("select").first()).toHaveValue("shop-a");
  await expect(page.getByRole("button", { name: /Owner setup/ })).toContainText("0/9");
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
