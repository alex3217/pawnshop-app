import { expect, test, type Page } from "@playwright/test";

async function prepareOwner(page: Page) {
  await page.route("**/api/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [],
        shops: [],
        capabilities: {},
        notifications: [],
      }),
    });
  });
  await page.addInitScript(() => {
    localStorage.setItem("auth_token", "homepage-layout-owner-token");
    localStorage.setItem("auth_role", "OWNER");
    localStorage.setItem("auth_user", JSON.stringify({
      id: "homepage-layout-owner",
      name: "Homepage Layout Owner",
      email: "owner@pawnloop.test",
      role: "OWNER",
    }));
    localStorage.setItem(
      "pawnloop-navigation-assistance-OWNER-v2",
      JSON.stringify({
        automaticPrompts: false,
        completedTopics: [],
        dismissedGuidance: true,
        floatingButtonVisible: true,
      }),
    );
  });
  await page.goto("/");
}

test("owner setup restores focus for Escape and Close setup", async ({
  page,
}) => {
  await prepareOwner(page);

  const trigger = page.getByRole("button", { name: /Owner setup/ });
  const checklist = page.getByLabel("Pawn shop owner setup checklist");
  await expect(trigger).toHaveCount(1);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(checklist).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Click Here for Setup and Instructions" }),
  ).toHaveCount(0);

  await trigger.click();
  await expect(checklist).toBeVisible();
  await expect(checklist.getByRole("button", { name: "Close setup" })).toBeFocused();
  await expect(checklist.locator(".role-checklist-item")).toHaveCount(9);
  const boxes = await Promise.all([
    page.getByRole("navigation", { name: "Primary navigation" }).boundingBox(),
    checklist.boundingBox(),
  ]);
  expect(boxes[0]).not.toBeNull();
  expect(boxes[1]).not.toBeNull();
  expect(boxes[1]!.y).toBeGreaterThanOrEqual(boxes[0]!.y + boxes[0]!.height);

  await page.keyboard.press("Escape");
  await expect(checklist).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await checklist.getByRole("button", { name: "Close setup" }).click();
  await expect(checklist).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("setup task navigation closes without forcing focus to the trigger", async ({
  page,
}) => {
  await prepareOwner(page);
  const trigger = page.getByRole("button", { name: /Owner setup/ });
  const checklist = page.getByLabel("Pawn shop owner setup checklist");

  await trigger.click();
  await checklist.getByRole("link", { name: "Create your shop" }).first().click();

  await expect(page).toHaveURL(/\/owner\/onboarding\?step=1#shop-profile$/);
  await expect(checklist).toBeHidden();
  await expect(trigger).not.toBeFocused();
});

test("outside focusable controls retain focus when setup closes", async ({
  page,
}) => {
  await prepareOwner(page);
  const trigger = page.getByRole("button", { name: /Owner setup/ });
  const checklist = page.getByLabel("Pawn shop owner setup checklist");
  const themeToggle = page.locator(".site-theme-toggle");

  await trigger.click();
  await themeToggle.focus();
  await expect(themeToggle).toBeFocused();
  await themeToggle.dispatchEvent("pointerdown");

  await expect(checklist).toBeHidden();
  await expect(themeToggle).toBeFocused();
  await expect(trigger).not.toBeFocused();

  await themeToggle.press("Space");
  await expect(themeToggle).toHaveAccessibleName("Switch to light mode");
  await expect(themeToggle).toBeFocused();
});

test("Navigation Assistance returns focus to Owner setup for every close path", async ({
  page,
}) => {
  await prepareOwner(page);
  const trigger = page.getByRole("button", { name: /Owner setup/ });

  const openFromSetup = async () => {
    await trigger.click();
    await page
      .getByLabel("Pawn shop owner setup checklist")
      .getByRole("button", { name: "Navigation Assistance" })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Navigation Assistance" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: /(?:Hide|Restore) Floating Help Button/,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Click Here for Setup and Instructions",
      }),
    ).toHaveCount(0);
    await expect(trigger).toHaveCount(1);
  };

  await openFromSetup();
  await page
    .getByRole("dialog", { name: "Navigation Assistance" })
    .getByRole("button", { name: "Close Navigation Assistance" })
    .click();
  await expect(trigger).toBeFocused();

  await openFromSetup();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();

  await openFromSetup();
  await page.locator(".navigation-assistance-backdrop").click({
    position: { x: 4, y: 4 },
  });
  await expect(trigger).toBeFocused();
});

test("server-derived setup progress and footer are grouped", async ({ page }) => {
  await prepareOwner(page);
  const trigger = page.getByRole("button", { name: /Owner setup/ });
  await expect(trigger).toContainText("0/9");
  await page.reload();
  await expect(page.getByRole("button", { name: /Owner setup/ })).toContainText(
    "0/9",
  );

  const footer = page.getByLabel("Footer navigation");
  await expect(footer.getByRole("heading", { name: "Explore" })).toBeVisible();
  await expect(footer.getByRole("heading", { name: "Workspace" })).toBeVisible();
  await expect(footer.getByRole("heading", { name: "Legal & help" })).toBeVisible();
});

test("owner setup content scrolls to the final task and remains interactive", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await prepareOwner(page);
  await page.getByRole("button", { name: /Owner setup/ }).click();

  const panel = page.getByLabel("Pawn shop owner setup checklist");
  const items = panel.getByLabel("Owner setup checklist items");
  const finalTask = panel.getByRole("link", { name: "Add your first inventory item" }).first();

  const dimensions = await items.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
  }));
  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);

  await items.hover();
  await page.mouse.wheel(0, dimensions.scrollHeight);
  await expect
    .poll(() => items.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(dimensions.scrollTop);
  await expect(finalTask).toBeInViewport();

  await finalTask.focus();
  await expect(finalTask).toBeFocused();
});

test("owner setup supports keyboard scrolling and restores focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await prepareOwner(page);
  const trigger = page.getByRole("button", { name: /Owner setup/ });
  await trigger.click();

  const items = page.getByLabel("Owner setup checklist items");
  await items.focus();
  await page.keyboard.press("End");
  await expect
    .poll(() =>
      items.evaluate(
        (element) => element.scrollTop + element.clientHeight,
      ),
    )
    .toBe(await items.evaluate((element) => element.scrollHeight));
  await page.keyboard.press("Home");
  await expect
    .poll(() => items.evaluate((element) => element.scrollTop))
    .toBe(0);
  await page.keyboard.press("PageDown");
  await expect
    .poll(() => items.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await items.evaluate((element) => new Promise<void>((resolve) => {
    let previousScrollTop = element.scrollTop;
    let stableFrames = 0;

    const observeScroll = () => {
      const currentScrollTop = element.scrollTop;
      stableFrames = currentScrollTop === previousScrollTop
        ? stableFrames + 1
        : 0;
      previousScrollTop = currentScrollTop;

      if (stableFrames >= 3) {
        resolve();
        return;
      }

      window.requestAnimationFrame(observeScroll);
    };

    window.requestAnimationFrame(observeScroll);
  }));
  const pageDownScrollTop = await items.evaluate(
    (element) => element.scrollTop,
  );
  await page.keyboard.press("PageUp");
  await expect
    .poll(() => items.evaluate((element) => element.scrollTop))
    .toBeLessThan(pageDownScrollTop);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("mobile touch-style scrolling is enabled and not canceled", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await prepareOwner(page);
  await page.getByRole("button", { name: /Owner setup/ }).click();
  const items = page.getByLabel("Owner setup checklist items");

  const touchResult = await items.evaluate((element) => {
    const start = new TouchEvent("touchstart", {
      bubbles: true,
      cancelable: true,
    });
    const move = new TouchEvent("touchmove", {
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(start);
    element.dispatchEvent(move);
    element.scrollBy({ top: element.scrollHeight });
    return {
      defaultPrevented: start.defaultPrevented || move.defaultPrevented,
      scrollTop: element.scrollTop,
      touchAction: getComputedStyle(element).touchAction,
    };
  });

  expect(touchResult.defaultPrevented).toBe(false);
  expect(touchResult.touchAction).toBe("pan-y");
  expect(touchResult.scrollTop).toBeGreaterThan(0);
});

const viewports = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 667 },
];

for (const { width, height } of viewports) {
  for (const theme of ["light", "dark"] as const) {
    test(`${width}x${height} has no horizontal overflow in ${theme} mode`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      if (theme === "dark") {
        await page.addInitScript(() => {
          localStorage.setItem("pawnloop-theme-v2", "dark");
        });
      }
      await prepareOwner(page);

      await page.getByRole("button", { name: /Owner setup/ }).click();
      const panel = page.getByLabel("Pawn shop owner setup checklist");
      const header = page.locator(".site-header");
      const [panelBox, headerBox] = await Promise.all([
        panel.boundingBox(),
        header.boundingBox(),
      ]);
      expect(panelBox).not.toBeNull();
      expect(headerBox).not.toBeNull();
      expect(panelBox!.y).toBeGreaterThanOrEqual(
        headerBox!.y + headerBox!.height,
      );
      expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(height - 52);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);

      if (width <= 640) {
        await expect(page.locator(".site-mobile-menu")).toBeVisible();
        await expect(page.locator(".site-primary-more-menu")).toBeHidden();
      } else if (width <= 1024) {
        await expect(page.locator(".site-primary-more-menu")).toBeVisible();
      }
    });
  }
}

for (const { width, height } of viewports) {
  test(`${width}x${height} keeps owner setup clear of scroll to top`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await prepareOwner(page);
    await page.evaluate(() => {
      const main = document.querySelector<HTMLElement>(".site-main");
      if (main) main.style.minHeight = "1600px";
      window.scrollTo(0, 500);
    });

    const trigger = page.getByRole("button", { name: /Owner setup/ });
    const scrollToTop = page.getByRole("button", { name: "Scroll to top" });
    await expect(scrollToTop).toBeVisible();

    const [triggerBox, scrollBox] = await Promise.all([
      trigger.boundingBox(),
      scrollToTop.boundingBox(),
    ]);
    expect(triggerBox).not.toBeNull();
    expect(scrollBox).not.toBeNull();
    expect(
      triggerBox!.x < scrollBox!.x + scrollBox!.width
        && triggerBox!.x + triggerBox!.width > scrollBox!.x
        && triggerBox!.y < scrollBox!.y + scrollBox!.height
        && triggerBox!.y + triggerBox!.height > scrollBox!.y,
    ).toBe(false);

    await trigger.click();
    const panelBox = await page
      .getByLabel("Pawn shop owner setup checklist")
      .boundingBox();
    expect(panelBox).not.toBeNull();
    expect(
      panelBox!.x < scrollBox!.x + scrollBox!.width
        && panelBox!.x + panelBox!.width > scrollBox!.x
        && panelBox!.y < scrollBox!.y + scrollBox!.height
        && panelBox!.y + panelBox!.height > scrollBox!.y,
    ).toBe(false);
  });
}
