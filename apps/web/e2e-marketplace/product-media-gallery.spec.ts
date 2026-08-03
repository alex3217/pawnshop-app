import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const images = Array.from({ length: 12 }, (_, index) => `https://example.com/piano-${index + 1}.jpg`);

test.beforeEach(async ({ page }) => {
  // gallery-test-tour-dismissal-v1
  await page.addInitScript(() => {
    localStorage.setItem("pawnloop-theme-v2", "light");

    for (const roleName of [
      "GUEST",
      "CONSUMER",
      "OWNER",
      "ADMIN",
      "SUPER_ADMIN",
    ]) {
      localStorage.setItem(
        `pawnloop-navigation-assistance-${roleName}-v2`,
        JSON.stringify({
          automaticPrompts: false,
          completedTopics: ["full-tour"],
          dismissedGuidance: true,
          floatingButtonVisible: false,
        }),
      );
    }
  });
  await page.route("**/api/items/gallery-item", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "gallery-item", pawnShopId: "shop-1", title: "Piano", description: "A photographed piano.", price: "500", currency: "USD", images, category: "Musical Instruments", condition: "Good", status: "AVAILABLE", shop: { id: "shop-1", name: "Example Shop", address: "1 Main St", phone: "555-0100" } }) }));
  await page.route("**/api/items/gallery-item/**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ success: false, error: "Unavailable in gallery test" }) }));
  await page.route("https://example.com/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XwN0WQAAAABJRU5ErkJggg==", "base64") }));
});

test("complete gallery supports keyboard controls, lightbox, and focus restoration", async ({ page }) => {
  await page.goto("/items/gallery-item");
  await expect(page.getByRole("group", { name: "Piano image thumbnails" })).toBeVisible();
  await expect(page.getByRole("button", { name: "View image 12 of 12" })).toBeVisible();
  await page.getByRole("button", { name: "View image 6 of 12" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByAltText("Piano — image 6 of 12")).toBeVisible();
  await page.getByRole("button", { name: "View next image" }).click();
  await expect(page.getByText("Image 7 of 12", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "View image 12 of 12" }).click();
  const opener = page.getByRole("button", { name: "Open Piano image 12 of 12 full screen" });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Piano image viewer" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Image 12 of 12", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous full-screen image" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next full-screen image" })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByText("Image 1 of 12", { exact: true })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(dialog.getByText("Image 12 of 12", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Piano image viewer" })).toBeHidden();
  await expect(opener).toBeFocused();
});

test("single image opens with Close and without navigation controls", async ({ page }) => {
  await page.route("**/api/items/gallery-item", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ id: "gallery-item", pawnShopId: "shop-1", title: "Piano", description: "A photographed piano.", price: "500", currency: "USD", images: images.slice(0, 1), category: "Musical Instruments", condition: "Good", status: "AVAILABLE", shop: { id: "shop-1", name: "Example Shop", address: "1 Main St", phone: "555-0100" } }),
  }));

  await page.goto("/items/gallery-item");
  const opener = page.getByRole("button", { name: "Open Piano image 1 of 1 full screen" });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Piano image viewer" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "Close full-screen image viewer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous full-screen image" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next full-screen image" })).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByText("Image 1 of 1", { exact: true })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(dialog.getByText("Image 1 of 1", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
});

test("gallery reflows without page overflow and has no serious axe violations", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/items/gallery-item");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact || ""))).toEqual([]);
});
