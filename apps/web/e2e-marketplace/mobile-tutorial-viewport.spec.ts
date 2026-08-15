import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const portraitViewports = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 412, height: 915 },
  { width: 430, height: 932 },
];

function contrastRatio(foreground: string, background: string) {
  const parse = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
  const luminance = (color: string) => parse(color)
    .map((channel) => channel / 255)
    .map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

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

const publicRoutes = [
  "/marketplace",
  "/shops",
  "/auctions",
  "/terms",
  "/privacy",
];

for (const viewport of [...portraitViewports, { width: 667, height: 375 }]) {
  test(`public pages keep the tutorial in flow at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      localStorage.setItem("pawnloop-navigation-assistance-GUEST-v2", JSON.stringify({
        automaticPrompts: false,
        completedTopics: [],
        dismissedGuidance: true,
        floatingButtonVisible: true,
      }));
    });

    for (const route of publicRoutes) {
      await page.goto(route);
      const card = page.getByLabel("Setup and instructions tutorial");
      await expect(card).toBeVisible();
      await expect(page.locator("main")).toHaveCount(1);

      const geometry = await page.evaluate(() => {
        const launcher = document.querySelector<HTMLElement>(".navigation-tour-floating")!;
        const bounds = launcher.getBoundingClientRect();
        const content = Array.from(document.querySelectorAll<HTMLElement>(
          "main article, main section, main button, main a, footer",
        )).filter((element) => {
          if (!element.offsetParent) return false;
          const box = element.getBoundingClientRect();
          return box.width > 0 && box.height > 0 &&
            box.left < bounds.right && box.right > bounds.left &&
            box.top < bounds.bottom && box.bottom > bounds.top;
        });

        return {
          position: getComputedStyle(launcher).position,
          intersections: content.length,
          scrollWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          bounds: bounds.toJSON(),
        };
      });

      expect(geometry.position).toBe("relative");
      expect(geometry.intersections).toBe(0);
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth);
      expect(geometry.bounds.left).toBeGreaterThanOrEqual(0);
      expect(geometry.bounds.right).toBeLessThanOrEqual(geometry.viewportWidth);

      const close = card.getByRole("button", { name: "Close tutorial" });
      const closeBox = await close.boundingBox();
      expect(closeBox!.width).toBeGreaterThanOrEqual(44);
      expect(closeBox!.height).toBeGreaterThanOrEqual(44);
      expect(closeBox!.x).toBeGreaterThanOrEqual(0);
      expect(closeBox!.x + closeBox!.width).toBeLessThanOrEqual(viewport.width);
      await close.click();
      await expect(card).toBeHidden();
      await expect(page.locator(".navigation-assistance-backdrop")).toHaveCount(0);
    }
  });
}

test("audited public mobile routes have no serious accessibility violations", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript(() => {
    localStorage.setItem("pawnloop-navigation-assistance-GUEST-v2", JSON.stringify({
      automaticPrompts: false,
      completedTopics: [],
      dismissedGuidance: true,
      floatingButtonVisible: false,
    }));
  });

  for (const route of publicRoutes) {
    await page.goto(route);
    const serious = (await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze()).violations.filter(({ impact }) =>
      impact === "serious" || impact === "critical"
    );
    expect(serious, `${route}: ${JSON.stringify(serious, null, 2)}`).toEqual([]);
  }
});

test("marketplace keeps one usable Clear filters action across result states", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("pawnloop-navigation-assistance-GUEST-v2", JSON.stringify({
      automaticPrompts: false,
      completedTopics: [],
      dismissedGuidance: true,
      floatingButtonVisible: false,
    }));
  });

  const assertSingleClear = async () => {
    const clear = page.getByRole("button", { name: "Clear filters", exact: true });
    await expect(clear).toHaveCount(1);
    await expect(clear).toBeVisible();
    await expect(clear).toBeEnabled();
  };

  let releaseLoading: (() => void) | undefined;
  const loadingGate = new Promise<void>((resolve) => { releaseLoading = resolve; });
  await page.route("**/api/items**", async (route) => {
    await loadingGate;
    await route.fulfill({ json: { items: [], total: 0 } });
  });
  await page.goto("/marketplace");
  await expect(page.locator(".mp2-skeleton").first()).toBeVisible();
  await assertSingleClear();
  releaseLoading!();
  await expect(page.locator(".mp2-empty")).toBeVisible();
  await assertSingleClear();

  await page.unrouteAll({ behavior: "wait" });
  await page.route("**/api/items**", (route) => route.fulfill({ status: 503, json: { error: "Unavailable" } }));
  await page.goto("/marketplace?state=failure");
  await expect(page.locator(".mp2-error")).toBeVisible();
  await assertSingleClear();

  await page.unrouteAll({ behavior: "wait" });
  await page.route("**/api/items**", (route) => route.fulfill({ json: [{
    id: "mobile-clear-item",
    pawnShopId: "mobile-clear-shop",
    title: "Mobile regression item",
    description: "A populated marketplace card",
    price: 125,
    status: "AVAILABLE",
    category: "TOOLS",
    condition: "GOOD",
    images: [],
    shop: { id: "mobile-clear-shop", name: "Regression Shop" },
  }] }));
  await page.goto("/marketplace?state=populated");
  await expect(page.locator(".mp2-item-card")).toBeVisible();
  await assertSingleClear();

  await page.getByLabel("Search marketplace").fill("filtered");
  await expect(page).toHaveURL(/search=filtered/);
  await assertSingleClear();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page.getByLabel("Search marketplace")).toHaveValue("");
});

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

test("environment banner and tutorial primary states retain computed AA contrast", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepareHomepage(page, true);

  const banner = page.locator(".site-environment-indicator");
  const primary = page.getByTestId("button-primary");
  await expect(banner).toBeVisible();
  await expect(primary).toBeVisible();

  for (const theme of ["light", "dark"]) {
    await page.locator("html").evaluate((element, nextTheme) => {
      element.dataset.theme = nextTheme;
    }, theme);

    const bannerColors = await banner.evaluate((element) => {
      const parent = getComputedStyle(element);
      const children = Array.from(element.querySelectorAll<HTMLElement>("span, a, button"));
      return {
        background: parent.backgroundColor,
        foregrounds: [parent.color, ...children.map((child) => getComputedStyle(child).color)],
      };
    });
    for (const foreground of bannerColors.foregrounds) {
      expect(contrastRatio(foreground, bannerColors.background)).toBeGreaterThanOrEqual(4.5);
    }

    const assertPrimaryContrast = async () => {
      const colors = await primary.evaluate((element) => {
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return { foreground: style.color, background: style.backgroundColor, width: bounds.width, height: bounds.height };
      });
      expect(contrastRatio(colors.foreground, colors.background)).toBeGreaterThanOrEqual(4.5);
      expect(colors.width).toBeGreaterThanOrEqual(44);
      expect(colors.height).toBeGreaterThanOrEqual(44);
    };

    await assertPrimaryContrast();
    await primary.hover();
    await assertPrimaryContrast();
    await primary.focus();
    await expect(primary).toBeFocused();
    expect(await primary.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
    await primary.evaluate((element: HTMLButtonElement) => { element.disabled = true; });
    await assertPrimaryContrast();
    await primary.evaluate((element: HTMLButtonElement) => { element.disabled = false; });
  }

  const violations = (await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze()).violations;
  expect(violations).toEqual([]);
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
