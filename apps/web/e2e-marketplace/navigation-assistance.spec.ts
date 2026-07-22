import { expect, test, type Page } from "@playwright/test";

type TestRole = "CONSUMER" | "OWNER" | null;

const TOPICS = {
  GUEST: ["Browse the Marketplace", "Account Access"],
  CONSUMER: [
    "Buying", "Selling or Pawning", "Marketplace Listings",
    "Purchases and Payments", "Sales and Fulfillment", "Auctions and Offers",
  ],
  OWNER: [
    "Owner Setup", "Shop Profile", "Inventory", "Scanner", "Item Intake Review",
    "Marketplace Listings", "Auctions", "Offers", "Sales and Fulfillment",
    "Finance and Payouts", "Locations", "Staff and Permissions", "Subscription",
    "Integrations",
  ],
} as const;

async function prepare(page: Page, role: TestRole = null, completedTopics: string[] = []) {
  await page.route("**/api/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [], shops: [] }) });
  });
  await page.addInitScript(({ selectedRole, completed }) => {
    if (selectedRole) {
      localStorage.setItem("auth_token", "navigation-assistance-test-token");
      localStorage.setItem("auth_role", selectedRole);
      localStorage.setItem("auth_user", JSON.stringify({
        id: `navigation-${selectedRole.toLowerCase()}`,
        name: "Navigation Test User",
        email: "navigation@pawnloop.test",
        role: selectedRole,
      }));
    }
    const audience = selectedRole || "GUEST";
    localStorage.setItem(`pawnloop-navigation-assistance-${audience}-v2`, JSON.stringify({
      automaticPrompts: true,
      completedTopics: completed,
      dismissedGuidance: true,
      floatingButtonVisible: true,
    }));
  }, { selectedRole: role, completed: completedTopics });
  await page.goto("/marketplace");
}

async function openCenter(page: Page) {
  await page.getByRole("button", { name: "Click Here for Setup and Instructions" }).click();
  await expect(page.getByRole("dialog", { name: "Navigation Assistance" })).toBeVisible();
}

async function expectLaunch(page: Page, buttonName: string | RegExp, title: string) {
  const dialog = page.getByRole("dialog", { name: "Navigation Assistance" });
  await dialog.getByRole("button", { name: buttonName, exact: typeof buttonName === "string" }).click();
  await expect(dialog).toBeHidden();
  const tooltip = page.getByRole("alertdialog");
  await expect(tooltip).toBeVisible();
  await expect(tooltip.getByRole("heading")).toContainText(title);
  await tooltip.getByRole("button", { name: "Close", exact: true }).click();
  await expect(tooltip).toBeHidden();
}

test("guest launches full, route-specific, current-page, and every topic tour", async ({ page }) => {
  await prepare(page);
  await openCenter(page);
  await expectLaunch(page, "Start Full Tour", "Full Tour");

  await openCenter(page);
  await expectLaunch(page, "Help With This Page", "Marketplace");

  await openCenter(page);
  await expectLaunch(page, "Start Current Page Help Instructions", "Marketplace");

  for (const topic of TOPICS.GUEST) {
    await openCenter(page);
    await expectLaunch(page, `Start ${topic} Instructions`, topic);
  }
});

for (const role of ["CONSUMER", "OWNER"] as const) {
  test(`${role} can launch every role topic as a fresh tour`, async ({ page }) => {
    await prepare(page, role);
    for (const topic of TOPICS[role]) {
      await openCenter(page);
      await expectLaunch(page, `Start ${topic} Instructions`, topic);
    }
  });
}

test("preferences, floating recovery, reset, and defaults are observable", async ({ page }) => {
  await prepare(page, null, ["browse-marketplace"]);
  await openCenter(page);
  const dialog = page.getByRole("dialog", { name: "Navigation Assistance" });
  const automatic = dialog.getByRole("checkbox", { name: "Show Tips Automatically" });

  await automatic.uncheck();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("pawnloop-navigation-assistance-GUEST-v2") || "{}").automaticPrompts)).toBe(false);
  await automatic.check();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("pawnloop-navigation-assistance-GUEST-v2") || "{}").automaticPrompts)).toBe(true);

  await dialog.getByRole("button", { name: "Stop Automatic Prompts" }).click();
  await expect(automatic).not.toBeChecked();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("pawnloop-navigation-assistance-GUEST-v2") || "{}").automaticPrompts)).toBe(false);

  await expect(dialog.getByLabel("Completed").first()).toBeVisible();
  await dialog.getByRole("button", { name: "Reset Completed Instructions" }).click();
  await expect(dialog.getByLabel("Completed")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("pawnloop-navigation-assistance-GUEST-v2") || "{}").completedTopics)).toEqual([]);

  await dialog.getByRole("button", { name: "Hide Floating Help Button" }).click();
  await dialog.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(page.getByRole("button", { name: "Click Here for Setup and Instructions" })).toBeHidden();

  await page.getByRole("button", { name: "Navigation Assistance" }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Restore Floating Help Button" }).click();
  await dialog.getByRole("button", { name: "Stop Automatic Prompts" }).click();
  await dialog.getByRole("button", { name: "Hide Floating Help Button" }).click();
  await dialog.getByRole("button", { name: "Restore All Help Defaults" }).click();
  await expect(automatic).toBeChecked();
  await expect(dialog.getByRole("button", { name: "Hide Floating Help Button" })).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(page.getByRole("button", { name: "Click Here for Setup and Instructions" })).toBeVisible();
});

test("header and footer Close, Escape, and backdrop each close the center", async ({ page }) => {
  await prepare(page);
  const dialog = page.getByRole("dialog", { name: "Navigation Assistance" });

  await openCenter(page);
  await dialog.getByRole("button", { name: "Close", exact: true }).first().click();
  await expect(dialog).toBeHidden();
  await openCenter(page);
  await dialog.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(dialog).toBeHidden();
  await openCenter(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await openCenter(page);
  await page.locator(".navigation-assistance-backdrop").click({ position: { x: 3, y: 3 } });
  await expect(dialog).toBeHidden();
});
