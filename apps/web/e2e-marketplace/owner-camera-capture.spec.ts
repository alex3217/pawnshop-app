import { expect, test } from "@playwright/test";

test("shared item picker configures accessible rear-camera and gallery inputs", async ({ page }) => {
  await page.goto("/");
  const source = await page.request.get("/src/components/ItemImagePicker.tsx").then((response) => response.text());
  expect(source).toContain('capture: "environment"');
  expect(source).toContain("accept: ITEM_IMAGE_ACCEPT");
  expect(source).toContain('"aria-label": cameraLabel');
  expect(source).toContain('"aria-label": galleryLabel');
  expect(source).toContain('cameraRef.current?.click()');
  expect(source).toContain('galleryRef.current?.click()');
  expect(source).toContain("navigator.mediaDevices.getUserMedia");
  expect(source).toContain("Capture Photo");
  expect(source).toContain('canvas.toBlob(resolve, "image/jpeg", 0.92)');
});

test("camera and gallery files append through the shared 10-image selection behavior", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const picker = await import("/src/services/itemImageSelection.ts");
    const file = (name: string) => new File([name], name, { type: "image/jpeg", lastModified: 1 });
    const gallery = picker.appendItemImageFiles([], [file("gallery-1.jpg"), file("gallery-2.jpg")]);
    const firstCapture = picker.appendItemImageFiles(gallery, [file("camera-1.jpg")]);
    const repeatedCapture = picker.appendItemImageFiles(firstCapture, [file("camera-2.jpg")]);
    const capped = picker.appendItemImageFiles(repeatedCapture, Array.from({ length: 10 }, (_, index) => file(`extra-${index}.jpg`)));
    const withExisting = picker.appendItemImageFiles([], Array.from({ length: 5 }, (_, index) => file(`new-${index}.jpg`)), 8);
    return {
      names: repeatedCapture.map((entry: File) => entry.name),
      capped: capped.length,
      withExisting: withExisting.length,
      invalidType: picker.validateItemImageFiles([new File(["x"], "x.gif", { type: "image/gif" })]),
      oversized: picker.validateItemImageFiles([new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.jpg", { type: "image/jpeg" })]),
    };
  });
  expect(result.names).toEqual(["gallery-1.jpg", "gallery-2.jpg", "camera-1.jpg", "camera-2.jpg"]);
  expect(result.capped).toBe(10);
  expect(result.withExisting).toBe(2);
  expect(result.invalidType).toContain("JPEG, PNG, or WebP");
  expect(result.oversized).toContain("10 MiB");
});

test("both owner creation pages use the shared picker with clear action labels", async ({ page }) => {
  await page.goto("/");
  const [itemPage, auctionPage] = await Promise.all([
    page.request.get("/src/pages/CreateItemPage.tsx").then((response) => response.text()),
    page.request.get("/src/pages/CreateAuctionPage.tsx").then((response) => response.text()),
  ]);
  expect(itemPage).toContain("Take Item Photo");
  expect(itemPage).toContain("Choose Files");
  expect(auctionPage).toContain("Take Auction Photo");
  expect(auctionPage).toContain("Choose Auction Images");
  expect(auctionPage).toContain('"inventory:write"');
  expect(auctionPage).toContain("inventory:write permission is required");
  expect(auctionPage).toContain("Select an inventory item above to review or add auction photos.");
  expect(auctionPage).toContain("Add your first auction item");
  expect(auctionPage).toContain("All eligible items are already in auctions");
});

test("owner inventory Edit opens the protected owner item editor", async ({ page }) => {
  await page.goto("/");
  const [appSource, inventorySource] = await Promise.all([
    page.request.get("/src/App.tsx").then((response) => response.text()),
    page.request.get("/src/pages/OwnerInventoryPage.tsx").then((response) => response.text()),
  ]);
  expect(appSource).toContain('path: "/owner/items/:id/edit"');
  expect(inventorySource).toContain('to: `/owner/items/${item.id}/edit`');
  expect(inventorySource).toContain('to: `/items/${item.id}`');
  expect(inventorySource).toContain("Edit Item");
  expect(inventorySource).toContain("View Listing");
});

test("owner item editor uses readable theme styles and the shared camera picker", async ({ page }) => {
  await page.goto("/");
  const editPageSource = await page.request
    .get("/src/pages/OwnerItemEditPage.tsx")
    .then((response) => response.text());
  expect(editPageSource).toContain('className="page-stack owner-readable-page owner-edit-item-page"');
  expect(editPageSource).toContain("<ItemImagePicker");
  expect(editPageSource).toContain('cameraLabel="Take Item Photo"');
  expect(editPageSource).toContain('galleryLabel="Choose Files"');
  expect(editPageSource).toContain("existingImages={item.images || []}");
  expect(editPageSource).toContain("getMyItemById");
  expect(editPageSource).toContain("Restore Item");
  expect(editPageSource).toContain("Archive Item");
});
