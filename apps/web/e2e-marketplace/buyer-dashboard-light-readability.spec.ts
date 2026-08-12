import { expect, test, type Locator } from "@playwright/test";

function parseRgb(value: string) {
  const match = value.match(/^rgba?\(([^)]+)\)$/);
  if (!match) throw new Error(`Expected an RGB color, received: ${value}`);
  return match[1].split(/[ ,/]+/).filter(Boolean).slice(0, 3).map(Number);
}

function luminance(value: string) {
  const [red, green, blue] = parseRgb(value).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

async function expectContrast(
  foreground: Locator,
  background: Locator,
  minimum = 4.5,
) {
  await expect(foreground).toBeVisible();
  const foregroundColor = await foreground.evaluate(
    (element) => getComputedStyle(element).color,
  );
  const backgroundColor = await background.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  expect(
    contrastRatio(foregroundColor, backgroundColor),
    `${foregroundColor} on ${backgroundColor} must reach ${minimum}:1`,
  ).toBeGreaterThanOrEqual(minimum);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("pawnloop-theme-v2", "light");
    localStorage.setItem("auth_token", "buyer-dashboard-readability-token");
    localStorage.setItem("auth_role", "CONSUMER");
    localStorage.setItem("auth_user", JSON.stringify({
      id: "buyer-dashboard-readability",
      name: "Dashboard Readability Buyer",
      email: "dashboard-readability@example.test",
      role: "CONSUMER",
    }));
  });

  await page.route("**/api/**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const body = pathname === "/api/auth/me"
      ? {
          success: true,
          user: {
            id: "buyer-dashboard-readability",
            name: "Dashboard Readability Buyer",
            email: "dashboard-readability@example.test",
            role: "CONSUMER",
          },
        }
      : {
          success: true,
          data: [],
          rows: [],
          items: [],
          shops: [],
          auctions: [],
          notifications: [],
          unreadCount: 0,
          pagination: { page: 1, limit: 25, total: 0, totalPages: 0 },
        };

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
});

test("buyer dashboard keeps hero and summary text readable in light mode", async ({ page }) => {
  await page.goto("/buyer/dashboard");

  const hero = page.locator(".bd-hero");
  await expectContrast(
    page.getByRole("heading", {
      name: "Find local pawnshop deals worth checking today.",
    }),
    hero,
    7,
  );
  await expectContrast(
    page.getByText("Discover nearby items, live auctions, favorite shops", {
      exact: false,
    }),
    hero,
  );
  await expectContrast(page.getByRole("link", { name: "Browse all" }), hero);
  await expectContrast(page.locator(".bd-hero-panel-top span"), hero);

  const heroLabels = page.locator(".bd-hero-grid span");
  const heroNumbers = page.locator(".bd-hero-grid strong");
  await expect(heroLabels).toHaveCount(4);
  await expect(heroNumbers).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) {
    await expectContrast(heroLabels.nth(index), hero);
    await expectContrast(heroNumbers.nth(index), hero, 7);
  }

  const statCards = page.locator(".bd-stat-card");
  await expect(statCards).toHaveCount(5);
  for (let index = 0; index < 5; index += 1) {
    const card = statCards.nth(index);
    await expectContrast(card.locator("span"), card);
    await expectContrast(card.locator("strong"), card, 7);
    await expectContrast(card.locator("small"), card);
  }
});
