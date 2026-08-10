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
  options: {
    failLoadAttempts?: number[];
    failMarkRead?: boolean;
    holdLoadAttempt?: number;
    holdMarkRead?: boolean;
  } = {},
) {
  let getCount = 0;
  let patchCount = 0;
  let releaseLoad: (() => void) | undefined;
  let releasePatch: (() => void) | undefined;
  const loadGate = new Promise<void>((resolve) => {
    releaseLoad = resolve;
  });
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
      getCount += 1;
      if (options.holdLoadAttempt === getCount) await loadGate;
      const failLoad = options.failLoadAttempts?.includes(getCount) ?? false;
      await route.fulfill({
        status: failLoad ? 500 : 200,
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
    getCount: () => getCount,
    patchCount: () => patchCount,
    releaseLoad: () => releaseLoad?.(),
    releasePatch: () => releasePatch?.(),
  };
}

function notificationTrigger(page: Page, unreadCount: number) {
  const noun = unreadCount === 1 ? "notification" : "notifications";
  return page.locator(
    `.site-notifications > summary[aria-label="${unreadCount} unread ${noun}"]`,
  );
}

for (const theme of ["light", "dark"] as const) {
  test(`${theme}-mode notification surface and every supported variant remain readable`, async ({
    page,
  }) => {
    const requests = await prepareOwner(page, theme);
    const trigger = notificationTrigger(page, 10);
    await expect(trigger).toBeVisible();
    await expect.poll(requests.getCount).toBe(1);
    await expect(trigger).toHaveAttribute("aria-label", "10 unread notifications");
    await trigger.click();

    const panel = page.locator("#site-notifications-panel");
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
  const panel = page.locator("#site-notifications-panel");
  await expect(panel).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(panel.getByRole("button", { name: "Refresh" })).toBeFocused();
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

test("one list request and one mutation owner stay synchronized across desktop and mobile resize", async ({
  page,
}) => {
  const pending = await prepareOwner(page, "dark", { holdMarkRead: true });
  await expect.poll(pending.getCount).toBe(1);
  await page.setViewportSize({ width: 1280, height: 800 });
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

  await page.setViewportSize({ width: 360, height: 740 });
  await expect(notificationTrigger(page, 10)).toContainText("Alerts");
  await disabledMarkRead.evaluate((button) => {
    button.click();
    button.click();
  });
  expect(pending.patchCount()).toBe(1);
  expect(pending.getCount()).toBe(1);

  pending.releasePatch();
  await expect(notificationTrigger(page, 9)).toBeVisible();
  await expect(page.getByText("Owner application needs information", { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(notificationTrigger(page, 9)).toContainText("Notifications");
  expect(pending.getCount()).toBe(1);
});

test("failed mark read keeps the notification and count unchanged", async ({ page }) => {
  const failed = await prepareOwner(page, "light", { failMarkRead: true });
  await notificationTrigger(page, 10).click();
  await page.getByRole("button", { name: "Mark read" }).first().click();
  await expect(page.getByRole("alert")).toContainText("Could not mark");
  await expect(notificationTrigger(page, 10)).toBeVisible();
  expect(failed.patchCount()).toBe(1);
});

for (const theme of ["light", "dark"] as const) {
  test(`${theme} mobile Alerts trigger and panel retain contrast and viewport containment`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    const requests = await prepareOwner(page, theme);
    const trigger = notificationTrigger(page, 10);
    await expect.poll(requests.getCount).toBe(1);
    await expect(trigger).toContainText("Alerts");
    await expectContrast(trigger, trigger);
    await trigger.hover();
    await expectContrast(trigger, trigger);
    await trigger.focus();
    await expect(trigger).not.toHaveCSS("outline-style", "none");
    await trigger.click();
    await expectContrast(trigger, trigger);

    const panel = page.locator("#site-notifications-panel");
    const bounds = await panel.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(360);
    expect(await panel.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
      await panel.evaluate((element) => element.clientWidth),
    );
    await expectContrast(panel.locator(".site-notifications__message").first(), panel);
  });
}

for (const theme of ["light", "dark"] as const) {
test(`${theme} initial load failure retries once, synchronizes loading, and preserves stale items`, async ({
  page,
}) => {
  const requests = await prepareOwner(page, theme, {
    failLoadAttempts: [1, 3],
    holdLoadAttempt: 2,
  });
  await expect.poll(requests.getCount).toBe(1);
  await notificationTrigger(page, 0).click();
  const panel = page.locator("#site-notifications-panel");
  await expect(panel.getByRole("alert")).toHaveText("Notifications could not be loaded.");

  const retry = panel.getByRole("button", { name: "Retry" });
  await expectContrast(retry, retry);
  await retry.hover();
  await expectContrast(retry, retry);
  await retry.focus();
  await expect(retry).not.toHaveCSS("outline-style", "none");
  await retry.evaluate((button) => {
    button.click();
    button.click();
  });
  await expect.poll(requests.getCount).toBe(2);
  await expect(panel).toHaveAttribute("aria-busy", "true");
  const pendingRetry = panel.getByRole("button", { name: "Loading…" });
  await expect(pendingRetry).toBeDisabled();
  await expectContrast(pendingRetry, pendingRetry);
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await page.setViewportSize({ width: 360, height: 740 });
  await expect(panel.getByRole("status")).toHaveText("Loading notifications…");
  await expect(notificationTrigger(page, 0)).toContainText("Alerts");
  requests.releaseLoad();
  await expect(notificationTrigger(page, 10)).toBeVisible();
  await expect(panel.getByText("Owner application needs information", { exact: true })).toBeVisible();
  expect(requests.patchCount()).toBe(0);

  await panel.getByRole("button", { name: "Refresh" }).click();
  await expect.poll(requests.getCount).toBe(3);
  await expect(panel.getByRole("alert")).toContainText("Showing previously loaded notifications");
  await expect(panel.getByText("Owner application needs information", { exact: true })).toBeVisible();
  await expect(notificationTrigger(page, 10)).toBeVisible();
  expect(requests.patchCount()).toBe(0);
});
}

test("View preserves notification routing without marking the notification read", async ({ page }) => {
  const requests = await prepareOwner(page, "dark");
  await notificationTrigger(page, 10).click();
  await page.locator("#site-notifications-panel")
    .getByRole("link", { name: "View", exact: true })
    .click();
  await expect(page).toHaveURL(/\/owner\/application$/);
  expect(requests.patchCount()).toBe(0);
});
