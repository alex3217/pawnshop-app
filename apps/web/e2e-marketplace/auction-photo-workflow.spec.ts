import { expect, test } from "@playwright/test";

test("auction photos append to the item before auction creation", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { createAuctionPhotoWorkflow } = await import("/src/services/auctionPhotoWorkflow.ts");
    const calls: string[] = [];
    let savedImages: string[] = [];
    const workflow = createAuctionPhotoWorkflow({
      uploadItemImages: async () => { calls.push("upload"); return [{ url: "r2://new" }]; },
      updateItem: async (_id: string, input: { images?: string[] }) => { calls.push("update"); savedImages = input.images || []; return {} as never; },
      createAuction: async () => { calls.push("auction"); return { id: "auction-1" } as never; },
    });
    const auction = await workflow.submit(
      { id: "item-1", images: ["r2://existing"] } as never,
      [new File(["photo"], "camera.jpg", { type: "image/jpeg" })],
      { itemId: "item-1", shopId: "shop-1", startingPrice: 10, minIncrement: 1, startsAt: new Date().toISOString(), endsAt: new Date().toISOString() },
    );
    return { calls, savedImages, auctionId: auction.id };
  });
  expect(result).toEqual({ calls: ["upload", "update", "auction"], savedImages: ["r2://existing", "r2://new"], auctionId: "auction-1" });
});

test("upload or persistence failure prevents auction creation", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { createAuctionPhotoWorkflow } = await import("/src/services/auctionPhotoWorkflow.ts");
    let auctions = 0;
    const input = { itemId: "item-1", shopId: "shop-1", startingPrice: 10, minIncrement: 1, startsAt: new Date().toISOString(), endsAt: new Date().toISOString() };
    const item = { id: "item-1", images: [] } as never;
    const files = [new File(["photo"], "camera.jpg", { type: "image/jpeg" })];
    const uploadFailure = createAuctionPhotoWorkflow({ uploadItemImages: async () => { throw new Error("upload failed"); }, updateItem: async () => ({} as never), createAuction: async () => { auctions += 1; return {} as never; } });
    await uploadFailure.submit(item, files, input).catch(() => undefined);
    const persistenceFailure = createAuctionPhotoWorkflow({ uploadItemImages: async () => [{ url: "r2://new" }], updateItem: async () => { throw new Error("save failed"); }, createAuction: async () => { auctions += 1; return {} as never; } });
    await persistenceFailure.submit(item, files, input).catch(() => undefined);
    return auctions;
  });
  expect(result).toBe(0);
});

test("auction retry retains persisted photos without duplicate upload", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { createAuctionPhotoWorkflow } = await import("/src/services/auctionPhotoWorkflow.ts");
    let uploads = 0;
    let updates = 0;
    let auctions = 0;
    const workflow = createAuctionPhotoWorkflow({
      uploadItemImages: async () => { uploads += 1; return [{ url: "r2://new" }]; },
      updateItem: async () => { updates += 1; return {} as never; },
      createAuction: async () => { auctions += 1; if (auctions === 1) throw new Error("auction failed"); return { id: "auction-1" } as never; },
    });
    const item = { id: "item-1", images: ["r2://existing"] } as never;
    const files = [new File(["photo"], "camera.jpg", { type: "image/jpeg", lastModified: 1 })];
    const input = { itemId: "item-1", shopId: "shop-1", startingPrice: 10, minIncrement: 1, startsAt: new Date().toISOString(), endsAt: new Date().toISOString() };
    await workflow.submit(item, files, input).catch(() => undefined);
    const auction = await workflow.submit(item, files, input);
    return { uploads, updates, auctions, auctionId: auction.id };
  });
  expect(result).toEqual({ uploads: 1, updates: 1, auctions: 2, auctionId: "auction-1" });
});
