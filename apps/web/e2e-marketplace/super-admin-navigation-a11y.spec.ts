import { expect, test, type Locator, type Page } from "@playwright/test";

import { ADMIN_ROUTES } from "../src/admin/config/routes";

type Theme = "light" | "dark";

const superAdminRoutes = ADMIN_ROUTES.filter(
  (route) =>
    route.enabled !== false &&
    (route.path === "/super-admin" || route.path.startsWith("/super-admin/")),
);

function parseRgb(value: string) {
  const match = value.match(/^rgba?\(([^)]+)\)$/);
  if (!match) throw new Error(`Expected an RGB color, received: ${value}`);

  return match[1]
    .split(/[ ,/]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map(Number);
}

function luminance(color: string) {
  const [red, green, blue] = parseRgb(color).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

async function expectTextContrast(locator: Locator) {
  const colors = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return { foreground: style.color, background: style.backgroundColor };
  });

  expect(
    contrastRatio(colors.foreground, colors.background),
    `${colors.foreground} on ${colors.background} must reach 4.5:1`,
  ).toBeGreaterThanOrEqual(4.5);
}

async function installSuperAdmin(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("auth_token", "super-admin-navigation-test-token");
    localStorage.setItem("auth_role", "SUPER_ADMIN");
    localStorage.setItem(
      "auth_user",
      JSON.stringify({
        id: "super-admin-navigation-test",
        name: "Navigation Test Admin",
        email: "navigation@example.test",
        role: "SUPER_ADMIN",
      }),
    );
  });

  await page.route("**/api/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        rows: [],
        items: [],
        plans: [],
        notifications: [],
        pagination: { page: 1, limit: 250, total: 0, totalPages: 0 },
      }),
    }),
  );
}

test.beforeEach(async ({ page }) => {
  await installSuperAdmin(page);
});

test("Shop Management renders one primary action set", async ({ page }) => {
  await page.goto("/super-admin/shops");

  await expect(page.getByRole("button", { name: "Add Shop", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Export CSV", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Refresh", exact: true })).toHaveCount(1);
});

test("audit navigation reloads records for each shop target", async ({ page }) => {
  const auditRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/super-admin/audit?")) {
      auditRequests.push(request.url());
    }
  });

  await page.goto("/super-admin/audit?targetType=SHOP&targetId=shop_one");
  await expect.poll(() => auditRequests.some((url) => url.includes("targetId=shop_one"))).toBe(true);

  await page.goto("/super-admin/audit?targetType=SHOP&targetId=shop_two");
  await expect.poll(() => auditRequests.some((url) => url.includes("targetId=shop_two"))).toBe(true);
});

test("every enabled central Super Admin sidebar target resolves to page content", async ({
  page,
}) => {
  expect(new Set(superAdminRoutes.map((route) => route.path)).size).toBe(
    superAdminRoutes.length,
  );

  for (const route of superAdminRoutes) {
    await page.goto(route.path);

    const target = page.locator(
      `aside.admin-sidebar a[href="${route.path}"]`,
    );
    await expect(target, `${route.path} must appear once in the sidebar`).toHaveCount(1);
    await expect(target).toHaveAttribute("aria-current", "page");
    const primaryMain = page.getByRole("main");
    await expect(
      primaryMain,
      `${route.path} must render exactly one visible primary main landmark`,
    ).toHaveCount(1);
    await expect
      .poll(
        () => primaryMain.evaluate((main) => main.children.length),
        { message: `${route.path} must render route content inside AdminLayout` },
      )
      .toBeGreaterThan(2);
  }
});

for (const viewport of [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
] as const) {
  for (const theme of ["light", "dark"] as const) {
    test(`Super Admin sidebar states and metadata are accessible at ${viewport.name} size in ${theme} theme`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/super-admin/system");
      await page.evaluate((activeTheme: Theme) => {
        document.documentElement.dataset.theme = activeTheme;
      }, theme);

      const sidebar = page.locator("aside.admin-sidebar");
      await expect(sidebar).toBeVisible();

      const activeLink = sidebar.getByRole("link", { name: "System Health" });
      await expect(activeLink).toHaveAttribute("aria-current", "page");
      await expectTextContrast(activeLink);

      const hoverLink = sidebar.getByRole("link", { name: "Audit Logs" });
      const restingBackground = await hoverLink.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      );
      await hoverLink.hover();
      await expect
        .poll(() =>
          hoverLink.evaluate((element) => getComputedStyle(element).backgroundColor),
        )
        .not.toBe(restingBackground);
      await expectTextContrast(hoverLink);

      await hoverLink.focus();
      await expect(hoverLink).toBeFocused();
      const focusStyle = await hoverLink.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          outlineStyle: style.outlineStyle,
          outlineWidth: parseFloat(style.outlineWidth),
        };
      });
      expect(focusStyle.outlineStyle).not.toBe("none");
      expect(focusStyle.outlineWidth).toBeGreaterThan(0);

      const metadata = sidebar.locator(
        ".admin-sidebar__eyebrow, .admin-sidebar__group-description",
      );
      expect(await metadata.count()).toBeGreaterThan(1);
      for (const element of await metadata.all()) {
        const metrics = await element.evaluate((node) => {
          const style = getComputedStyle(node);
          return {
            fontSize: parseFloat(style.fontSize),
            lineHeight: parseFloat(style.lineHeight),
          };
        });
        expect(metrics.fontSize).toBeGreaterThanOrEqual(12);
        expect(metrics.lineHeight).toBeGreaterThanOrEqual(metrics.fontSize * 1.3);
      }
    });
  }
}
