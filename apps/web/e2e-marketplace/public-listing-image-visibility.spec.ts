import { expect, test } from "@playwright/test";

test("saved item photos resolve to the first public image URL", async ({ page }) => {
  await page.goto("/");

  const result = await page.evaluate(async () => {
    const { firstUsableImage } = await import("/src/utils/imageUrl.ts");
    return firstUsableImage([
      "",
      "r2://internal-key",
      "https://assets.example.test/uploads/item-photo.jpg",
    ]);
  });

  expect(result).toBe("https://assets.example.test/uploads/item-photo.jpg");
});

test("owner inventory and buyer discovery cards render saved item photos", async ({ page }) => {
  await page.goto("/");

  const [ownerInventory, buyerDashboard, buyerDiscovery] = await page.evaluate(
    async () => Promise.all([
      import("/src/pages/OwnerInventoryPage.tsx?raw").then((module) => module.default),
      import("/src/pages/BuyerDashboardPage.tsx?raw").then((module) => module.default),
      import("/src/services/buyerDashboardDiscovery.ts?raw").then((module) => module.default),
    ]),
  );

  expect(ownerInventory).toContain("<PrimaryListingImage");
  expect(ownerInventory).toContain("images={item.images}");
  expect(ownerInventory).toContain("owner-inventory-item-image");
  expect(buyerDiscovery).toContain("image: firstUsableImage(item.images)");
  expect(buyerDiscovery).toContain("image: firstUsableImage(item?.images)");
  expect(buyerDashboard).toContain("images={[item.image]}");
  expect(buyerDashboard).toContain("images={[auction.image]}");
});

test("public item, shop, and auction views render persisted photos with fallbacks", async ({ page }) => {
  await page.goto("/");

  const [marketplace, itemDetail, shopDetail, auctions, auctionDetail] = await page.evaluate(
    async () => Promise.all([
      import("/src/pages/MarketplacePage.tsx?raw").then((module) => module.default),
      import("/src/pages/ItemDetailPage.tsx?raw").then((module) => module.default),
      import("/src/pages/ShopDetailPage.tsx?raw").then((module) => module.default),
      import("/src/pages/AuctionsPage.tsx?raw").then((module) => module.default),
      import("/src/pages/AuctionDetailPage.tsx?raw").then((module) => module.default),
    ]),
  );

  expect(marketplace).toContain("firstUsableImage(item.images)");
  expect(itemDetail).toContain("item.images.filter(isUsableImageUrl)");
  expect(shopDetail).toContain("images={item.images}");
  expect(auctions).toContain("images={auction.item?.images}");
  expect(auctionDetail).toContain("images={auction.item?.images}");
});
