import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

type Role = "CONSUMER" | "OWNER" | "SUPER_ADMIN";
const routes: Array<{ name: string; path: string; role?: Role }> = [
  { name: "Home", path: "/" },
  { name: "Marketplace", path: "/marketplace" },
  { name: "Item detail", path: "/items/axe-missing-item" },
  { name: "Login", path: "/login" },
  { name: "Registration", path: "/register" },
  { name: "Privacy Policy", path: "/privacy" },
  { name: "Terms of Service", path: "/terms" },
  { name: "Buyer Dashboard", path: "/buyer/dashboard", role: "CONSUMER" },
  { name: "Watchlist", path: "/watchlist", role: "CONSUMER" },
  { name: "My Activity", path: "/buyer/workspace", role: "CONSUMER" },
  { name: "Buyer Subscription", path: "/buyer/subscription", role: "CONSUMER" },
  { name: "Payment Methods", path: "/account/payment-methods", role: "CONSUMER" },
  { name: "Buyer Account Settings", path: "/buyer/settings", role: "CONSUMER" },
  { name: "Buyer Help Center", path: "/buyer/help", role: "CONSUMER" },
  { name: "Owner Dashboard", path: "/owner", role: "OWNER" },
  { name: "Owner Finance", path: "/owner/finance", role: "OWNER" },
  { name: "Owner Marketing Center", path: "/owner/marketing", role: "OWNER" },
  { name: "Super Admin Overview", path: "/super-admin", role: "SUPER_ADMIN" },
  { name: "Super Admin Revenue", path: "/super-admin/revenue", role: "SUPER_ADMIN" },
  { name: "Launch War Room", path: "/super-admin/launch-readiness", role: "SUPER_ADMIN" },
];

async function installState(page: Page, role?: Role, theme: "light" | "dark" = "light") {
  await page.addInitScript(({ activeRole, activeTheme }) => {
    localStorage.setItem("pawnloop-theme-v2", activeTheme);
    for (const roleName of ["GUEST", "CONSUMER", "OWNER", "ADMIN", "SUPER_ADMIN"]) {
      localStorage.setItem(`pawnloop-navigation-assistance-${roleName}-v2`, JSON.stringify({ automaticPrompts: false, completedTopics: ["full-tour"], dismissedGuidance: true, floatingButtonVisible: false }));
    }
    if (!activeRole) return;
    localStorage.setItem("auth_token", "axe-local-mock-token");
    localStorage.setItem("auth_role", activeRole);
    localStorage.setItem("auth_user", JSON.stringify({
      id: `axe-${activeRole.toLowerCase()}`,
      name: "Axe Test User",
      email: "axe@pawnloop.test",
      role: activeRole,
      ...(activeRole === "OWNER" ? { ownerApplication: { id: "axe-owner", status: "APPROVED", submittedAt: null, reviewedAt: null, decisionReason: null, statusChangedAt: null } } : {}),
    }));
  }, { activeRole: role, activeTheme: theme });
  await page.route("**/api/**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ success: false, error: "Mock service unavailable" }) }));
}

for (const route of routes) {
  for (const profile of [
    { theme: "light" as const, viewport: { width: 1280, height: 800 } },
    { theme: "dark" as const, viewport: { width: 390, height: 844 } },
  ]) {
    test(`${route.name} has no serious axe violations in ${profile.theme} ${profile.viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(profile.viewport);
      await installState(page, route.role, profile.theme);
      await page.goto(route.path);
      await expect(page.locator("body")).toBeVisible();
      const layoutSelector =
        route.role === "SUPER_ADMIN"
          ? ".admin-layout__container"
          : ".site-main";

      const sharedLayout =
        page.locator(layoutSelector);

      await expect(sharedLayout).toBeVisible();

      const sharedViewportGutters =
        await sharedLayout.evaluate((element) => {
          const styles =
            window.getComputedStyle(element);

          return {
            left: Number.parseFloat(
              styles.paddingLeft,
            ),
            right: Number.parseFloat(
              styles.paddingRight,
            ),
          };
        });

      expect(
        sharedViewportGutters.left,
      ).toBeGreaterThanOrEqual(16);

      expect(
        sharedViewportGutters.right,
      ).toBeGreaterThanOrEqual(16);

      if (route.role === "SUPER_ADMIN") {
        const adminMain =
          page.locator(".admin-layout__main");

        await expect(adminMain).toBeVisible();

        const adminRectangle =
          await adminMain.evaluate((element) => {
            const rectangle =
              element.getBoundingClientRect();

            return {
              left: rectangle.left,
              right: rectangle.right,
            };
          });

        const viewportWidth =
          page.viewportSize()?.width || 1280;

        expect(
          adminRectangle.left,
        ).toBeGreaterThanOrEqual(16);

        expect(
          viewportWidth - adminRectangle.right,
        ).toBeGreaterThanOrEqual(16);
      } else {
        const sharedHeaderGutters =
          await page
            .locator(".site-header-inner")
            .evaluate((element) => {
              const styles =
                window.getComputedStyle(element);

              return {
                left: Number.parseFloat(
                  styles.paddingLeft,
                ),
                right: Number.parseFloat(
                  styles.paddingRight,
                ),
              };
            });

        expect(
          sharedHeaderGutters.left,
        ).toBeGreaterThanOrEqual(16);

        expect(
          sharedHeaderGutters.right,
        ).toBeGreaterThanOrEqual(16);
      }
      const results = await new AxeBuilder({ page }).options({ resultTypes: ["violations"] }).analyze();
      const launchBlocking = results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact || ""));
      expect(launchBlocking, JSON.stringify(launchBlocking, null, 2)).toEqual([]);
    });
  }
}


test("Payment Methods requires consent and opens trusted Stripe setup", async ({ page }) => {
  await installState(page, "CONSUMER");
  await page.unroute("**/api/**");

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname =
      new URL(request.url()).pathname.replace(/\/+$/, "");

    if (
      request.method() === "GET" &&
      pathname.endsWith("/stripe/payment-methods")
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          methods: [],
          defaultPaymentMethodId: null,
          syncStatus: "SYNCED",
        }),
      });
      return;
    }

    if (
      request.method() === "POST" &&
      pathname.endsWith(
        "/stripe/payment-methods/setup-session",
      )
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          sessionId: "seti_accessibility",
          url:
            "https://checkout.stripe.com/c/pay/accessibility",
        }),
      });
      return;
    }

    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        error: "Mock service unavailable",
      }),
    });
  });

  await page.route(
    "https://checkout.stripe.com/**",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `
          <!doctype html>
          <html lang="en">
            <body>
              <main>
                <h1>Stripe payment setup mock</h1>
                <p>Trusted Stripe handoff completed.</p>
              </main>
            </body>
          </html>
        `,
      });
    },
  );

  await page.goto("/account/payment-methods");

  const consent =
    page.getByRole("checkbox");

  const addButton =
    page.getByRole("button", {
      name: "Add or replace payment method",
    });

  await addButton.click();

  await expect(consent).toBeFocused();

  await expect(
    page.getByRole("alert"),
  ).toContainText(
    "Review and accept the payment-method consent",
  );

  await consent.check();

  await expect(
    page.getByRole("alert"),
  ).toHaveCount(0);

  await addButton.click();

  await expect(
    page.getByRole("heading", {
      name: "Stripe payment setup mock",
    }),
  ).toBeVisible();
});


test("Account Settings loaded state has usable controls", async ({ page }) => {
  await installState(page, "CONSUMER");
  await page.unroute("**/api/**");

  let preferences = {
    displayName: "Accessibility Buyer",
    email: "buyer@pawnloop.test",
    phone: "555-010-4242",
    locationLabel: "Dallas, TX",
    searchRadiusMiles: 25,
    savedSearchNotifications: true,
    priceDropAlerts: true,
    auctionAlerts: true,
    followedShopAlerts: true,
    marketingCommunications: false,
    recentlyViewedEnabled: true,
    updatedAt: "2026-08-02T14:30:00.000Z",
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname =
      new URL(request.url()).pathname.replace(/\/+$/, "");

    if (
      request.method() === "GET" &&
      pathname.endsWith("/buyer/preferences")
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          preferences,
        }),
      });
      return;
    }

    if (
      request.method() === "PATCH" &&
      pathname.endsWith("/buyer/preferences")
    ) {
      preferences = {
        ...preferences,
        ...request.postDataJSON(),
        updatedAt: new Date().toISOString(),
      };

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          preferences,
        }),
      });
      return;
    }

    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        error: "Mock service unavailable",
      }),
    });
  });

  await page.goto("/buyer/settings");

  await expect(
    page.getByRole("heading", {
      name: "Account Settings",
    }),
  ).toBeVisible();

  const checkboxes = page.getByRole("checkbox");

  await expect(checkboxes).toHaveCount(6);

  const widths = await checkboxes.evaluateAll(
    (elements) =>
      elements.map(
        (element) =>
          element.getBoundingClientRect().width,
      ),
  );

  expect(
    widths.every(
      (width) => width >= 16 && width <= 32,
    ),
  ).toBe(true);

  const results =
    await new AxeBuilder({ page })
      .options({
        resultTypes: ["violations"],
      })
      .analyze();

  const launchBlocking =
    results.violations.filter((violation) =>
      ["serious", "critical"].includes(
        violation.impact || "",
      ),
    );

  expect(
    launchBlocking,
    JSON.stringify(launchBlocking, null, 2),
  ).toEqual([]);

  await page
    .getByRole("checkbox", {
      name: "Marketing communications",
    })
    .check();

  await page
    .getByRole("button", {
      name: "Save settings",
    })
    .click();

  const status =
    page.locator(".buyer-settings-status");

  await expect(status).toBeFocused();
  await expect(status).toContainText(
    "Buyer settings saved.",
  );
});


test("Account Settings supports launch account controls", async ({ page }) => {
  await installState(page, "CONSUMER");
  await page.unroute("**/api/**");

  let preferences = {
    displayName: "Accessibility Buyer",
    email: "buyer@pawnloop.test",
    phone: "555-010-4242",
    locationLabel: "Dallas, TX",
    searchRadiusMiles: 25,
    savedSearchNotifications: true,
    priceDropAlerts: true,
    auctionAlerts: true,
    followedShopAlerts: true,
    marketingCommunications: false,
    recentlyViewedEnabled: true,
    updatedAt: "2026-08-02T16:00:00.000Z",
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const pathname =
      new URL(request.url()).pathname.replace(/\/+$/, "");

    if (
      request.method() === "GET" &&
      pathname.endsWith("/buyer/preferences")
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          preferences,
        }),
      });
      return;
    }

    if (
      request.method() === "PATCH" &&
      pathname.endsWith("/buyer/preferences")
    ) {
      preferences = {
        ...preferences,
        ...request.postDataJSON(),
        updatedAt: new Date().toISOString(),
      };

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          preferences,
        }),
      });
      return;
    }

    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        error: "Mock service unavailable",
      }),
    });
  });

  await page.goto("/buyer/settings");

  await page.evaluate(() => {
    localStorage.setItem(
      "pawnloop-buyer-recently-viewed-v1",
      JSON.stringify([
        {
          itemId: "item-1",
          title: "Accessibility Test Item",
          href: "/items/item-1",
          viewedAt: new Date().toISOString(),
          imageUrl: null,
          priceLabel: "$100",
          shopName: "Test Shop",
        },
      ]),
    );
  });

  await page.reload();

  const accountLinks = page.locator(
    ".buyer-settings-link-grid",
  );

  await expect(
    accountLinks.getByRole("link", {
      name: /Buyer Subscription/,
    }),
  ).toHaveAttribute(
    "href",
    "/buyer/subscription",
  );

  await expect(
    accountLinks.getByRole("link", {
      name: /Payment Methods/,
    }),
  ).toHaveAttribute(
    "href",
    "/account/payment-methods",
  );

  await expect(
    page.getByText(
      "1 item stored in this browser.",
      {
        exact: false,
      },
    ),
  ).toBeVisible();

  const displayName =
    page.getByRole("textbox", {
      name: "Display name",
    });

  await displayName.fill(
    "Changed Accessibility Buyer",
  );

  await expect(
    page.getByText(
      "You have unsaved changes.",
    ),
  ).toBeVisible();

  await page
    .getByRole("button", {
      name: "Discard changes",
    })
    .click();

  await expect(displayName).toHaveValue(
    "Accessibility Buyer",
  );

  await page
    .getByRole("button", {
      name: "Clear recently viewed history",
    })
    .click();

  await expect(
    page.getByText(
      "0 items stored in this browser.",
      {
        exact: false,
      },
    ),
  ).toBeVisible();

  const storedHistory = await page.evaluate(
    () =>
      localStorage.getItem(
        "pawnloop-buyer-recently-viewed-v1",
      ),
  );

  expect(storedHistory).toBeNull();
});


test("Legal documents use readable layout without floating assistance overlap", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "pawnloop-theme-v2",
      "light",
    );

    localStorage.setItem(
      "auth_token",
      "legal-layout-consumer-token",
    );

    localStorage.setItem(
      "auth_role",
      "CONSUMER",
    );

    localStorage.setItem(
      "auth_user",
      JSON.stringify({
        id: "legal-layout-consumer",
        name: "Legal Layout Consumer",
        email: "legal-layout@pawnloop.test",
        role: "CONSUMER",
      }),
    );

    localStorage.setItem(
      "pawnloop-navigation-assistance-CONSUMER-v2",
      JSON.stringify({
        automaticPrompts: false,
        completedTopics: ["full-tour"],
        dismissedGuidance: true,
        floatingButtonVisible: true,
      }),
    );
  });

  await page.route(
    "**/api/**",
    async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: "Mock service unavailable",
        }),
      });
    },
  );

  for (
    const legalPage of [
      {
        path: "/privacy",
        heading: "Privacy Policy",
      },
      {
        path: "/terms",
        heading: "Terms of Service",
      },
    ]
  ) {
    await page.goto(legalPage.path);

    await expect(
      page.getByRole("heading", {
        name: legalPage.heading,
        level: 1,
      }),
    ).toBeVisible();

    const document =
      page.locator(".legal-page__container");

    await expect(document).toBeVisible();

    const dimensions =
      await document.evaluate((element) => {
        const rectangle =
          element.getBoundingClientRect();

        return {
          width: rectangle.width,
          left: rectangle.left,
          right: rectangle.right,
        };
      });

    expect(dimensions.width).toBeLessThanOrEqual(
      1000,
    );

    expect(dimensions.left).toBeGreaterThan(0);
    expect(dimensions.right).toBeLessThanOrEqual(
      page.viewportSize()?.width || 1280,
    );

    await expect(
      page.locator(
        ".navigation-tour-floating",
      ),
    ).toHaveCount(0);
  }
});


test("Watchlist single-item card keeps balanced width and inset selection control", async ({ page }) => {
  await page.setViewportSize({
    width: 1280,
    height: 900,
  });

  await installState(
    page,
    "CONSUMER",
    "dark",
  );

  await page.unroute("**/api/**");

  await page.route(
    "**/api/**",
    async (route) => {
      const request = route.request();
      const pathname =
        new URL(request.url()).pathname.replace(
          /\/+$/,
          "",
        );

      if (
        request.method() === "GET" &&
        pathname.endsWith("/watchlist/mine")
      ) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              id: "watch-piano",
              itemId: "item-piano",
              createdAt:
                "2026-08-02T16:30:00.000Z",
              item: {
                id: "item-piano",
                pawnShopId: "shop-larry",
                title: "Piano",
                description:
                  "A saved piano available from Larry Shop.",
                price: 100,
                images: [],
                category: "Electronics",
                condition: "Good",
                status: "AVAILABLE",
                shop: {
                  id: "shop-larry",
                  name: "Larry Shop",
                },
              },
            },
          ]),
        });
        return;
      }

      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: "Mock service unavailable",
        }),
      });
    },
  );

  await page.goto("/watchlist");

  const card =
    page.locator(".watch2-card");

  await expect(card).toHaveCount(1);

  await expect(
    page.getByRole("link", {
      name: "Piano",
      exact: true,
    }),
  ).toBeVisible();

  const checkbox =
    page.getByRole("checkbox", {
      name: "Select item",
      exact: true,
    });

  await expect(checkbox).toBeVisible();

  const cardBox = await card.boundingBox();
  const checkboxBox =
    await checkbox.boundingBox();

  expect(cardBox).not.toBeNull();
  expect(checkboxBox).not.toBeNull();

  expect(cardBox!.width)
    .toBeGreaterThanOrEqual(360);

  expect(cardBox!.width)
    .toBeLessThanOrEqual(430);

  expect(
    checkboxBox!.x - cardBox!.x,
  ).toBeGreaterThanOrEqual(16);

  expect(
    checkboxBox!.y - cardBox!.y,
  ).toBeGreaterThanOrEqual(10);

  await checkbox.check();
  await expect(checkbox).toBeChecked();

  const viewItemAction =
    page.getByRole("link", {
      name: "View item",
      exact: true,
    });

  const viewShopAction =
    page.getByRole("link", {
      name: "View shop",
      exact: true,
    });

  await expect(viewItemAction).toBeVisible();
  await expect(viewShopAction).toBeVisible();

  for (const theme of ["light", "dark"]) {
    await page.evaluate((activeTheme) => {
      document.documentElement.setAttribute(
        "data-theme",
        activeTheme,
      );
    }, theme);

    const matchingActionBackgrounds =
      await Promise.all([
        viewItemAction.evaluate(
          (element) =>
            window.getComputedStyle(element)
              .backgroundColor,
        ),
        viewShopAction.evaluate(
          (element) =>
            window.getComputedStyle(element)
              .backgroundColor,
        ),
      ]);

    expect(
      matchingActionBackgrounds[0],
    ).toBe(matchingActionBackgrounds[1]);

    const matchingActionTextColors =
      await Promise.all([
        viewItemAction.evaluate(
          (element) =>
            window.getComputedStyle(element).color,
        ),
        viewShopAction.evaluate(
          (element) =>
            window.getComputedStyle(element).color,
        ),
      ]);

    expect(
      matchingActionTextColors[0],
    ).toBe(matchingActionTextColors[1]);
  }

  const horizontalOverflow =
    await page.evaluate(() => {
      return (
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
      );
    });

  expect(horizontalOverflow)
    .toBeLessThanOrEqual(1);
});

test("Launch War Room rejects non-Super Admin access", async ({ page }) => {
  await installState(page, "CONSUMER");
  await page.goto("/super-admin/launch-readiness");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Launch War Room" })).toHaveCount(0);
});

test("Launch War Room exposes reviewed evidence and no unsupported PASS", async ({ page }) => {
  await installState(page, "SUPER_ADMIN");
  await page.goto("/super-admin/launch-readiness");
  await expect(page.getByRole("heading", { name: "Launch War Room" })).toBeVisible();
  await expect(page.getByText("No certified disposable target or clean replay evidence.")).toBeVisible();
  await expect(page.getByText("PASS", { exact: true })).toHaveCount(0);
  await expect(page.getByText("BLOCKED", { exact: true }).first()).toBeVisible();
});
