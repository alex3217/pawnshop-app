import { expect, test, type Page } from "@playwright/test";

const portraitViewports = [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

async function prepareHomepage(page: Page, automaticPrompts = false) {
  await page.addInitScript((automatic) => {
    localStorage.setItem("pawnloop-navigation-assistance-GUEST-v2", JSON.stringify({
      automaticPrompts: automatic,
      completedTopics: [],
      dismissedGuidance: !automatic,
      floatingButtonVisible: true,
    }));
  }, automaticPrompts);
  await page.goto("/");
}

for (const viewport of [...portraitViewports, { width: 667, height: 375 }]) {
  test(`homepage tutorial stays operable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await prepareHomepage(page);

    const card = page.getByLabel("Setup and instructions tutorial");
    const instructions = page.getByRole("button", { name: "Click Here for Setup and Instructions" });
    const close = card.getByRole("button", { name: "Close tutorial" });
    await expect(card).toBeVisible();
    await expect(instructions).toBeVisible();
    await expect(close).toBeVisible();

    const geometry = await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>(".navigation-tour-floating")!;
      const close = document.querySelector<HTMLElement>(".navigation-tour-dismiss")!;
      const text = document.querySelector<HTMLElement>(".navigation-tour-restart > span:last-child")!;
      return {
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        card: card.getBoundingClientRect().toJSON(),
        close: close.getBoundingClientRect().toJSON(),
        text: text.getBoundingClientRect().toJSON(),
        closeInsideCard: card.contains(close),
      };
    });
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.card.left).toBeGreaterThanOrEqual(8);
    expect(geometry.card.right).toBeLessThanOrEqual(geometry.viewportWidth - 8);
    expect(geometry.close.left).toBeGreaterThanOrEqual(0);
    expect(geometry.close.right).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.close.top).toBeGreaterThanOrEqual(0);
    expect(geometry.close.bottom).toBeLessThanOrEqual(viewport.height);
    expect(geometry.close.width).toBeGreaterThanOrEqual(44);
    expect(geometry.close.height).toBeGreaterThanOrEqual(44);
    expect(geometry.text.width).toBeGreaterThan(0);
    expect(geometry.text.height).toBeGreaterThan(0);
    expect(geometry.closeInsideCard).toBe(true);

    const findItem = page.getByRole("link", { name: "Find an Item", exact: true }).first();
    const sellItem = page.getByRole("link", { name: "Sell / Pawn Item", exact: true }).first();
    await expect(findItem).toBeVisible();
    await expect(sellItem).toBeVisible();
    const coveredActions = await page.locator(".home2-hero-actions a").evaluateAll((actions) => {
      const card = document.querySelector(".navigation-tour-floating")!.getBoundingClientRect();
      return actions.filter((action) => {
        const bounds = action.getBoundingClientRect();
        return bounds.left < card.right && bounds.right > card.left &&
          bounds.top < card.bottom && bounds.bottom > card.top;
      }).length;
    });
    expect(coveredActions).toBe(0);
    await expect(page.getByRole("link", { name: "Login", exact: true }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Register", exact: true }).first()).toBeVisible();
    await expect(page.locator('summary[aria-label="Toggle navigation menu"]')).toBeVisible();

    await close.click();
    await expect(card).toBeHidden();
    await expect(page.locator(".navigation-assistance-backdrop")).toHaveCount(0);
    await findItem.click();
    await expect(page).toHaveURL(/\/login\?next=%2Fbuyer%2Fitem-locator$/);
  });
}

test("mobile automatic tour has content and no empty header callout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepareHomepage(page, true);
  const tooltip = page.getByRole("alertdialog");
  await expect(tooltip).toBeVisible();
  await expect(tooltip.getByRole("heading")).not.toBeEmpty();
  await expect(tooltip.locator("#joyride-tooltip-content")).not.toBeEmpty();
  await expect(page.locator('.react-joyride__tooltip:has(#joyride-tooltip-content:empty)')).toHaveCount(0);
  await expect(page.getByLabel("Setup and instructions tutorial")).toHaveCount(0);
  await tooltip.getByRole("button", { name: "Close", exact: true }).click();
  await expect(tooltip).toBeHidden();
  await expect(page.getByRole("link", { name: "Login", exact: true }).first()).toBeVisible();
});

test("desktop tutorial shortcut keeps its established floating treatment", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await prepareHomepage(page);
  const card = page.getByLabel("Setup and instructions tutorial");
  const close = card.getByRole("button", { name: "Close tutorial" });
  await expect(card).toBeVisible();
  await expect(close).toBeVisible();
  const positions = await Promise.all([card.boundingBox(), close.boundingBox()]);
  expect(positions[0]!.x + positions[0]!.width).toBeLessThanOrEqual(1440);
  await page.getByRole("button", { name: "Click Here for Setup and Instructions" }).click();
  const dialog = page.getByRole("dialog", { name: "Navigation Assistance" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).last().click();
  await expect(dialog).toBeHidden();
  await close.click();
  await expect(card).toBeHidden();
});
