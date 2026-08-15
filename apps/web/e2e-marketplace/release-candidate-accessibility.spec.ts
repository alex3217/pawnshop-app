import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const stablePublicRoutes = [
  { name: "login", path: "/login" },
  { name: "registration", path: "/register" },
] as const;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("pawnloop-theme-v2", "light");
    localStorage.setItem("pawnloop-navigation-assistance-GUEST-v2", JSON.stringify({
      automaticPrompts: false,
      completedTopics: ["full-tour"],
      dismissedGuidance: true,
      floatingButtonVisible: false,
    }));
  });
});

for (const route of stablePublicRoutes) {
  test(`${route.name} has no serious automated accessibility violations`, async ({ page }) => {
    await page.goto(route.path);
    await expect(page.locator("main")).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(({ impact }) =>
      impact === "serious" || impact === "critical"
    );

    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
}

test("authentication landmarks, labels, names, and keyboard focus are deterministic", async ({ page }) => {
  await page.goto("/login");

  const email = page.getByLabel(/email/i);
  const forgotPassword = page.getByRole("link", { name: "Forgot password?" });
  const password = page.getByRole("textbox", { name: "Password" });
  const passwordToggle = page.getByRole("button", { name: "Show password" });
  const submit = page.getByRole("button", { name: /log in|sign in/i });

  await expect(email).toBeVisible();
  await expect(password).toBeVisible();
  await expect(submit).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(page.locator(":focus-visible")).toBeVisible();

  await forgotPassword.focus();
  await expect(forgotPassword).toBeFocused();
  await expect(forgotPassword).toHaveCSS("outline-style", /^(?!none$).+/);

  await passwordToggle.focus();
  await expect(passwordToggle).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");

  await submit.focus();
  await expect(submit).toBeFocused();
  await expect(submit).toHaveCSS("outline-style", /^(?!none$).+/);
});
