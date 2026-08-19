import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  expectReadable,
  measureControl,
  type InteractionState,
} from "./helpers/interactiveReadability";

const states: InteractionState[] = ["default", "hover", "focus-visible", "active"];

async function installBuyer(page: Page, theme: "light" | "dark") {
  await page.addInitScript(({ selectedTheme }) => {
    localStorage.setItem("auth_token", "interactive-readability-token");
    localStorage.setItem("auth_role", "CONSUMER");
    localStorage.setItem("auth_user", JSON.stringify({
      id: "interactive-readability-buyer",
      name: "Readability Buyer",
      email: "readability@example.test",
      role: "CONSUMER",
    }));
    localStorage.setItem("pawnloop-theme-v2", selectedTheme);
    localStorage.setItem("pawnloop-navigation-assistance-CONSUMER-v2", JSON.stringify({
      automaticPrompts: false,
      completedTopics: ["full-tour"],
      dismissedGuidance: true,
      floatingButtonVisible: false,
    }));
  }, { selectedTheme: theme });
}

async function installMocks(page: Page) {
  await page.route("https://js.stripe.com/**", (route) => route.abort());
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    let body: Record<string, unknown> = { success: true };
    if (pathname === "/api/notifications") body = { success: true, notifications: [] };
    if (pathname === "/api/buyer/item-submissions/mine") body = { success: true, submissions: [] };
    if (pathname === "/api/buyer/item-submissions/offers") body = { success: true, offers: [] };
    if (pathname === "/api/buyer/item-intakes/recent") body = { success: true, intakes: [] };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`Buy/Sell hero actions retain readable interaction text in ${theme} mode`, async ({ page, browserName }) => {
    await installBuyer(page, theme);
    await installMocks(page);
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto("/buyer/sell-item");

    for (const name of ["Find similar items", "Browse marketplace", "Refresh offers"]) {
      const control = page.getByRole(name === "Refresh offers" ? "button" : "link", { name, exact: true });
      await expect(control).toBeVisible();
      for (const state of states) {
        const measurement = await measureControl(page, control, state);
        if (name === "Find similar items") {
          console.log(JSON.stringify({ theme, ...measurement }));
        }
        if (
          name === "Find similar items"
          && state === "hover"
          && process.env.READABILITY_SCREENSHOT_DIR
        ) {
          await page.screenshot({
            path: `${process.env.READABILITY_SCREENSHOT_DIR}/${process.env.READABILITY_SCREENSHOT_LABEL || "readability"}-${theme}.png`,
            fullPage: true,
          });
        }
        expectReadable(measurement, {
          route: "/buyer/sell-item",
          role: "CONSUMER",
          theme,
          viewport: "1440x1100",
        });
      }
    }

    const findSimilar = page.getByRole("link", { name: "Find similar items", exact: true });
    const browseMarketplace = page.getByRole("link", { name: "Browse marketplace", exact: true });
    const refreshOffers = page.getByRole("button", { name: "Refresh offers", exact: true });
    await findSimilar.focus();
    await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
    await expect(browseMarketplace).toBeFocused();
    await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
    await expect(refreshOffers).toBeFocused();

    const serious = (await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze()).violations.filter(({ impact }) => impact === "serious" || impact === "critical");
    expect(serious).toEqual([]);
  });
}
