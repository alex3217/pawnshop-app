import { expect, test, type Locator, type Page } from "@playwright/test";

type Theme = "light" | "dark";

const authenticationActions = [
  { path: "/login", name: "Sign in" },
  { path: "/register", name: "Create account" },
  { path: "/forgot-password", name: "Send reset link" },
  { path: "/reset-password?token=readability-test", name: "Update password" },
  { path: "/verification-pending", name: "Resend verification" },
] as const;

function parseRgb(value: string) {
  const match = value.match(/^rgba?\(([^)]+)\)$/);
  if (!match) throw new Error(`Expected an RGB color, received: ${value}`);

  const channels = match[1]
    .split(/[ ,/]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map(Number);

  if (channels.length !== 3 || channels.some((channel) => !Number.isFinite(channel))) {
    throw new Error(`Unable to parse RGB color: ${value}`);
  }

  return channels;
}

function relativeLuminance(color: string) {
  const [red, green, blue] = parseRgb(color).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

async function expectNormalTextContrast(locator: Locator) {
  await expect(locator).toBeVisible();
  const colors = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      foreground: style.color,
      background: style.backgroundColor,
    };
  });
  const ratio = contrastRatio(colors.foreground, colors.background);
  expect(
    ratio,
    `${colors.foreground} on ${colors.background} must reach 4.5:1`,
  ).toBeGreaterThanOrEqual(4.5);
}

async function installTheme(page: Page, theme: Theme) {
  await page.addInitScript((activeTheme) => {
    localStorage.setItem("pawnloop-theme-v2", activeTheme);
    localStorage.setItem(
      "pawnloop-navigation-assistance-GUEST-v2",
      JSON.stringify({
        automaticPrompts: false,
        completedTopics: ["full-tour"],
        dismissedGuidance: true,
        floatingButtonVisible: false,
      }),
    );
  }, theme);

  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        rows: [],
        items: [],
        auctions: [],
        notifications: [],
        pagination: { page: 1, limit: 25, total: 0, totalPages: 0 },
      }),
    }),
  );
}

async function installAdmin(page: Page, theme: Theme, role: "ADMIN" | "SUPER_ADMIN") {
  await page.addInitScript(
    ({ activeTheme, activeRole }) => {
      localStorage.setItem("pawnloop-theme-v2", activeTheme);
      localStorage.setItem("auth_token", "readability-regression-token");
      localStorage.setItem("auth_role", activeRole);
      localStorage.setItem(
        "auth_user",
        JSON.stringify({
          id: "readability-regression-admin",
          name: "Readability Regression Admin",
          email: "readability@example.test",
          role: activeRole,
        }),
      );
    },
    { activeTheme: theme, activeRole: role },
  );

  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        rows: [],
        notifications: [],
        pagination: { page: 1, limit: 25, total: 0, totalPages: 0 },
      }),
    }),
  );
}

for (const theme of ["light", "dark"] as const) {
  test(`authentication primary actions retain readable contrast in ${theme} mode`, async ({
    page,
  }) => {
    await installTheme(page, theme);

    for (const action of authenticationActions) {
      await page.goto(action.path);
      await expectNormalTextContrast(
        page.getByRole("button", { name: action.name, exact: true }),
      );
    }
  });

  test(`active auction status retains contrast and focus visibility in ${theme} mode`, async ({
    page,
  }) => {
    await installTheme(page, theme);
    await page.goto("/auctions");

    const live = page.getByRole("button", { name: "Live", exact: true });
    await expectNormalTextContrast(live);
    await live.focus();
    await expect(live).toBeFocused();
    const focus = await live.evaluate((element) => {
      const style = getComputedStyle(element);
      return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
    });
    expect(focus.style).not.toBe("none");
    expect(focus.width).toBeGreaterThan(0);
  });

  test(`auction and admin operational metadata remain at least 12px in ${theme} mode`, async ({
    page,
  }) => {
    await installTheme(page, theme);
    await page.goto("/auctions");

    const auctionMetadata = page.locator(
      ".auctions-kicker, .auctions-role-eyebrow",
    );
    await expect(auctionMetadata).toHaveCount(2);
    for (const metadata of await auctionMetadata.all()) {
      const size = await metadata.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          fontSize: parseFloat(style.fontSize),
          lineHeight: parseFloat(style.lineHeight),
        };
      });
      expect(size.fontSize).toBeGreaterThanOrEqual(12);
      expect(size.lineHeight).toBeGreaterThanOrEqual(size.fontSize * 1.3);
    }

    for (const admin of [
      { path: "/admin/system", role: "ADMIN" },
      { path: "/super-admin/system", role: "SUPER_ADMIN" },
    ] as const) {
      await page.unroute("**/api/**");
      await installAdmin(page, theme, admin.role);
      await page.goto(admin.path);

      const descriptions = page.locator(
        "aside.admin-sidebar section > div > div:nth-child(2)",
      );
      await expect(descriptions.first()).toBeVisible();
      expect(await descriptions.count()).toBeGreaterThan(0);
      for (const description of await descriptions.all()) {
        const size = await description.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            fontSize: parseFloat(style.fontSize),
            lineHeight: parseFloat(style.lineHeight),
          };
        });
        expect(size.fontSize).toBeGreaterThanOrEqual(12);
        expect(size.lineHeight).toBeGreaterThanOrEqual(size.fontSize * 1.3);
      }
    }
  });
}
