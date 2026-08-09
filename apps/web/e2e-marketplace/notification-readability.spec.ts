import { expect, test, type Locator, type Page } from "@playwright/test";

type Theme = "light" | "dark";

const notificationVariants = [
  ["OWNER_APPLICATION_INFORMATION_REQUESTED", "Owner application needs information"],
  ["OWNER_APPLICATION_APPROVED", "Owner application approved"],
  ["OWNER_APPLICATION_REJECTED", "Owner application rejected"],
  ["ACCOUNT_SECURITY", "New sign-in detected"],
  ["ORDER_UPDATED", "Order status updated"],
  ["OFFER_RECEIVED", "Offer received"],
  ["AUCTION_WON", "Auction won"],
  ["SUBSCRIPTION_PAYMENT_RECOVERED", "Subscription payment recovered"],
  ["SUBSCRIPTION_PAYMENT_FAILED", "Subscription payment failed"],
  ["ADMINISTRATIVE", "Administrative notice"],
] as const;

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

function contrast(foreground: string, background: string) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

async function expectContrast(
  foregroundLocator: Locator,
  backgroundLocator: Locator,
  minimum = 4.5,
) {
  const [foreground, background] = await Promise.all([
    foregroundLocator.evaluate((element) => getComputedStyle(element).color),
    backgroundLocator.evaluate((element) => getComputedStyle(element).backgroundColor),
  ]);
  expect(
    contrast(foreground, background),
    `${foreground} on ${background} must reach ${minimum}:1`,
  ).toBeGreaterThanOrEqual(minimum);
}

async function prepareOwner(
  page: Page,
  theme: Theme,
  options: { failMarkRead?: boolean; holdMarkRead?: boolean } = {},
) {
  let patchCount = 0;
  let releasePatch: (() => void) | undefined;
  const patchGate = new Promise<void>((resolve) => {
    releasePatch = resolve;
  });

  await page.addInitScript((activeTheme) => {
    localStorage.setItem("pawnloop-theme-v2", activeTheme);
    localStorage.setItem("auth_token", "notification-readability-token");
    localStorage.setItem("auth_role", "OWNER");
    localStorage.setItem("auth_user", JSON.stringify({
      id: "notification-readability-owner",
      name: "Notification Readability Owner",
      email: "notification@example.test",
      role: "OWNER",
    }));
    localStorage.setItem(
      "pawnloop-navigation-assistance-OWNER-v2",
      JSON.stringify({
        automaticPrompts: false,
        completedTopics: ["full-tour"],
        dismissedGuidance: true,
        floatingButtonVisible: false,
      }),
    );
  }, theme);

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/notifications" && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          notifications: notificationVariants.map(([type, title], index) => ({
            id: `notification-${index}`,
            type,
            title,
            message: index === 0
              ? "Please provide the requested ownership documentation so the review can continue."
              : index === 9
                ? `A long administrative notification ${"with enough detail to verify wrapping ".repeat(12)}`
                : `Readable ${title.toLowerCase()} details.`,
            actionUrl: index === 0 ? "/owner/application" : null,
            readAt: null,
            createdAt: "2026-08-09T14:30:00.000Z",
          })),
        }),
      });
      return;
    }

    if (/\/api\/notifications\/[^/]+\/read$/.test(url.pathname)) {
      patchCount += 1;
      if (options.holdMarkRead) await patchGate;
      await route.fulfill({
        status: options.failMarkRead ? 500 : 200,
        contentType: "application/json",
        body: JSON.stringify({ success: !options.failMarkRead }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, rows: [], items: [], shops: [] }),
    });
  });

  await page.goto("/privacy");
  return {
    patchCount: () => patchCount,
    releasePatch: () => releasePatch?.(),
  };
}

function notificationTrigger(page: Page, unreadCount: number) {
  return page
    .locator(".site-top-actions .site-notifications > summary")
    .filter({ has: page.getByText(`Notifications (${unreadCount})`, { exact: true }) });
}

for (const theme of ["light", "dark"] as const) {
  test(`${theme}-mode notification surface and every supported variant remain readable`, async ({
    page,
  }) => {
    const requests = await prepareOwner(page, theme);
    const trigger = notificationTrigger(page, 10);
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-label", "10 unread notifications");
    await trigger.click();

    const panel = page.locator("#site-notifications-panel-desktop");
    await expect(panel).toBeVisible();
    const colors = await panel.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, border: style.borderColor };
    });
    expect(colors.background).toBe(theme === "dark" ? "rgb(18, 25, 53)" : "rgb(255, 255, 255)");
    expect(colors.border).not.toBe("rgba(0, 0, 0, 0)");

    for (const [, title] of notificationVariants) {
      const itemTitle = panel.getByText(title, { exact: true });
      await expectContrast(itemTitle, panel);
    }
    await expectContrast(panel.locator(".site-notifications__message").first(), panel);
    await expectContrast(panel.locator(".site-notifications__time").first(), panel);
    await expect(panel.getByText("Unread", { exact: true })).toHaveCount(10);
    const view = panel.getByRole("link", { name: "View" });
    const markRead = panel.getByRole("button", { name: "Mark read" }).first();
    await expectContrast(view, view);
    await view.hover();
    await expectContrast(view, view);
    await view.focus();
    await expect(view).toBeFocused();
    await expect(view).not.toHaveCSS("outline-style", "none");
    await expectContrast(markRead, markRead);
    await markRead.hover();
    await expectContrast(markRead, markRead);
    await markRead.focus();
    await expect(markRead).toBeFocused();
    await expect(markRead).not.toHaveCSS("outline-style", "none");

    const longItem = panel.locator(".site-notifications__item").last();
    const overflow = await longItem.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    expect(requests.patchCount()).toBe(0);
  });
}

test("keyboard open, navigation, activation, Escape, and outside close preserve focus behavior", async ({
  page,
}) => {
  await prepareOwner(page, "dark");
  const trigger = notificationTrigger(page, 10);
  await trigger.focus();
  await page.keyboard.press("Enter");
  const panel = page.locator("#site-notifications-panel-desktop");
  await expect(panel).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(panel.getByRole("link", { name: "View" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(panel.getByRole("button", { name: "Mark read" }).first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.locator(".site-main").dispatchEvent("pointerdown");
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("mark read is single-submit, failure-safe, and refreshes the unread count only on success", async ({
  page,
}) => {
  const pending = await prepareOwner(page, "dark", { holdMarkRead: true });
  await notificationTrigger(page, 10).click();
  const markRead = page.getByRole("button", { name: "Mark read" }).first();
  await markRead.evaluate((button) => {
    button.click();
    button.click();
  });
  await expect.poll(pending.patchCount).toBe(1);
  const disabledMarkRead = page.getByRole("button", { name: "Marking read…" });
  await expect(disabledMarkRead).toBeDisabled();
  await expectContrast(disabledMarkRead, disabledMarkRead);
  pending.releasePatch();
  await expect(notificationTrigger(page, 9)).toBeVisible();

  await page.reload();
  const failed = await prepareOwner(page, "light", { failMarkRead: true });
  await notificationTrigger(page, 10).click();
  await page.getByRole("button", { name: "Mark read" }).first().click();
  await expect(page.getByRole("alert")).toContainText("Could not mark");
  await expect(notificationTrigger(page, 10)).toBeVisible();
  expect(failed.patchCount()).toBe(1);
});

test("mobile notification panel stays within the viewport and wraps long content", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await prepareOwner(page, "dark");
  const trigger = page.locator(".site-mobile-actions .site-notifications > summary");
  await expect(trigger).toHaveAttribute("aria-label", "10 unread notifications");
  await trigger.click();
  const panel = page.locator(".site-mobile-actions").getByLabel("Notifications", { exact: true });
  const bounds = await panel.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(360);
  expect(await panel.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
    await panel.evaluate((element) => element.clientWidth),
  );
  await expectContrast(panel.locator(".site-notifications__message").first(), panel);
});

test("View preserves notification routing without marking the notification read", async ({ page }) => {
  const requests = await prepareOwner(page, "dark");
  await notificationTrigger(page, 10).click();
  await page.locator("#site-notifications-panel-desktop")
    .getByRole("link", { name: "View", exact: true })
    .click();
  await expect(page).toHaveURL(/\/owner\/application$/);
  expect(requests.patchCount()).toBe(0);
});
