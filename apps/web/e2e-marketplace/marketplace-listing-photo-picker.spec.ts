import { expect, test } from "@playwright/test";

test("consumer can take or choose files without inventory and selected files render previews", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("auth_token", "consumer-token");
    localStorage.setItem("auth_role", "CONSUMER");
    localStorage.setItem("auth_user", JSON.stringify({ id: "buyer-1", name: "Buyer", email: "buyer@example.test", role: "CONSUMER" }));
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/me")) return route.fulfill({ contentType: "application/json", body: JSON.stringify({ user: { id: "buyer-1", role: "CONSUMER" } }) });
    if (path.endsWith("/notifications")) return route.fulfill({ contentType: "application/json", body: JSON.stringify({ notifications: [] }) });
    if (path.endsWith("/shops/mine") || path.endsWith("/items/mine")) return route.fulfill({ contentType: "application/json", body: JSON.stringify({ rows: [] }) });
    return route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true, rows: [] }) });
  });
  await page.goto("/marketplace/listings/new");
  await expect(page.getByRole("button", { name: "Take Photo" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Choose Files" })).toBeEnabled();
  await page.getByLabel("Choose Files").setInputFiles({ name: "customer-photo.png", mimeType: "image/png", buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) });
  await expect(page.getByRole("img", { name: "Selected item photo 1" })).toBeVisible();
});

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
    expect(source).toContain("_jsxDEV(AiDescriptionControl");
    expect(source).toContain('context: "MARKETPLACE_LISTING"');
    expect(source).not.toContain("Image URLs");
    expect(source).not.toContain("Enter one image URL per line");
  }
  expect(options.ITEM_CATEGORY_OPTIONS).toContain("Electronics");
  expect(options.ITEM_CONDITION_OPTIONS).toContain("Good");
});

test("shared AI description UI protects manual text and exposes accessible states", async ({ page }) => {
  await page.goto("/");
  const source = await page.request.get("/src/components/AiDescriptionControl.tsx").then((response) => response.text());
  expect(source).toContain("Generate with AI");
  expect(source).toContain("Generating…");
  expect(source).toContain("Regenerate");
  expect(source).toContain("Clear generated description");
  expect(source).toContain("window.confirm");
  expect(source).toContain('"aria-live": "polite"');
  expect(source).toContain('role: error ? "alert" : "status"');
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

test("consumer photo workflow uses the listing-scoped durable upload and pages keep the picker enabled without itemId", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const photos = await import("/src/services/marketplaceListingPhotos.ts");
    const calls: unknown[][] = [];
    const workflow = photos.createConsumerMarketplaceListingPhotoWorkflow(async (listingId: string, files: File[]) => {
      calls.push([listingId, files.length]);
      return [{ url: "https://assets.invalid/customer.jpg" }];
    });
    const images = await workflow("listing-1", [], [new File(["x"], "photo.jpg", { type: "image/jpeg" })]);
    return { calls, images };
  });
  expect(result.calls).toEqual([["listing-1", 1]]);
  expect(result.images).toEqual(["https://assets.invalid/customer.jpg"]);

  const [createSource, editSource, uploadSource, pickerSource] = await Promise.all([
    page.request.get("/src/pages/CreateMarketplaceListingPage.tsx").then((response) => response.text()),
    page.request.get("/src/pages/EditMarketplaceListingPage.tsx").then((response) => response.text()),
    page.request.get("/src/services/uploads.ts").then((response) => response.text()),
    page.request.get("/src/components/ItemImagePicker.tsx").then((response) => response.text()),
  ]);
  expect(createSource).toContain("isShopListing(listingType) && !itemId");
  expect(editSource).toContain('listing.listingType.startsWith("SHOP_") && !listing.itemId');
  expect(createSource).toContain("Draft ${draft.id} was saved, but selected photos were not attached");
  expect(createSource.indexOf("const draft = await createMarketplaceListing")).toBeLessThan(createSource.indexOf("persistConsumerMarketplaceListingPhotos(draft.id"));
  expect(createSource.indexOf("persistConsumerMarketplaceListingPhotos(draft.id")).toBeLessThan(createSource.indexOf("updateMarketplaceListing(draft.id"));
  expect(uploadSource).toContain("/uploads/marketplace-listings/${encodeURIComponent(normalizedId)}");
  expect(pickerSource).toContain("Selected image previews");
  expect(pickerSource).toContain("URL.createObjectURL(file)");
});

test("shop-to-customer publication has client and server photo guards", async ({ page }) => {
  await page.goto("/");
  const sellerSource = await page.request.get("/src/pages/MarketplaceSellerListingsPage.tsx").then((response) => response.text());
  expect(sellerSource).toContain("Add at least one photo before publishing this shop-to-customer listing.");
  expect(sellerSource).toContain("Add a photo to publish.");
});
