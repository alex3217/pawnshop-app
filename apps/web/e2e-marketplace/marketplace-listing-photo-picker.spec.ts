import { expect, test } from "@playwright/test";

test("create and edit listings use standard selects and the shared photo picker", async ({ page }) => {
  await page.goto("/");
  const [createSource, editSource, options] = await Promise.all([
    page.request.get("/src/pages/CreateMarketplaceListingPage.tsx").then((response) => response.text()),
    page.request.get("/src/pages/EditMarketplaceListingPage.tsx").then((response) => response.text()),
    import("../src/constants/itemOptions"),
  ]);

  for (const source of [createSource, editSource]) {
    expect(source).toContain('_jsxDEV("select"');
    expect(source).toContain("ITEM_CATEGORY_OPTIONS.map");
    expect(source).toContain("ITEM_CONDITION_OPTIONS.map");
    expect(source).toContain("_jsxDEV(ItemImagePicker");
    expect(source).toContain('cameraLabel: "Take Photo"');
    expect(source).toContain('galleryLabel: "Choose Files"');
    expect(source).toContain("onRemoveExisting");
    expect(source).toContain("persistMarketplaceListingPhotos");
    expect(source).not.toContain("Image URLs");
    expect(source).not.toContain("Enter one image URL per line");
  }
  expect(options.ITEM_CATEGORY_OPTIONS).toContain("Electronics");
  expect(options.ITEM_CONDITION_OPTIONS).toContain("Good");
});

test("linked inventory prefill normalizes details and preserves saved photos", async ({ page }) => {
  await page.goto("/");
  const source = await page.request.get("/src/pages/CreateMarketplaceListingPage.tsx").then((response) => response.text());
  expect(source).toContain("handleItemChange");
  expect(source).toContain("setTitle(");
  expect(source).toContain("setDescription(");
  expect(source).toContain("normalizeListingOption(item.category");
  expect(source).toContain("normalizeListingOption(item.condition");
  expect(source).toContain("setExistingImages(durableImageUrls(Array.isArray(item.images) ? item.images : []))");
  expect(source).toContain("current.filter((image) => image !== url)");
});

test("listing photo workflow uploads before create/update payloads and rejects silent loss", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const photos = await import("/src/services/marketplaceListingPhotos.ts");
    const calls: unknown[][] = [];
    const workflow = photos.createMarketplaceListingPhotoWorkflow({
      uploadItemImages: async (itemId: string) => {
        calls.push(["upload", itemId]);
        return [{ url: "https://assets.invalid/new.jpg" }, { url: "https://assets.invalid/existing.jpg" }];
      },
      updateItem: async (itemId: string, input: { images?: string[] }) => {
        calls.push(["update", itemId, input.images]);
        return {} as never;
      },
    });
    const urls = await workflow("item-1", ["https://assets.invalid/existing.jpg", "blob:local"], [new File(["x"], "photo.jpg", { type: "image/jpeg" })]);

    let failure = "";
    try {
      await photos.createMarketplaceListingPhotoWorkflow({
        uploadItemImages: async () => { throw new Error("storage unavailable"); },
        updateItem: async () => ({} as never),
      })("item-1", [], [new File(["x"], "photo.jpg", { type: "image/jpeg" })]);
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
    return { calls, urls, failure };
  });

  expect(result.urls).toEqual(["https://assets.invalid/existing.jpg", "https://assets.invalid/new.jpg"]);
  expect(result.calls.map((call) => call[0])).toEqual(["upload", "update"]);
  expect(result.failure).toContain("Photos were not saved: storage unavailable");
  expect(result.urls.every((url) => !url.startsWith("blob:"))).toBe(true);
});

test("shop-to-customer publication has client and server photo guards", async ({ page }) => {
  await page.goto("/");
  const sellerSource = await page.request.get("/src/pages/MarketplaceSellerListingsPage.tsx").then((response) => response.text());
  expect(sellerSource).toContain("Add at least one photo before publishing this shop-to-customer listing.");
  expect(sellerSource).toContain("Add a photo to publish.");
});
