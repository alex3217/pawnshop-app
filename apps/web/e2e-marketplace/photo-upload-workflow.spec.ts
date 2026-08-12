import { expect, test } from "@playwright/test";

test("photo workflow prevents duplicate item submission and persists replacement state", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const workflows = await import("/src/services/ownerPhotoWorkflows.ts");
    const calls: string[] = [];
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const controller = workflows.createItemPageRecoveryController(async () => {
      calls.push("submit");
      await pending;
      return { id: "item-1", pawnShopId: "shop-1", title: "Camera", price: 100, images: ["https://assets.invalid/persisted.jpg"] };
    });
    const input = { pawnShopId: "shop-1", title: "Camera", price: 100 };
    const first = controller.startSubmission(input, [], { onRecovery() {}, onSuccess() {} });
    const duplicate = controller.startSubmission(input, [], { onRecovery() {}, onSuccess() {} });
    release();
    const item = await first.completion;
    return { firstStarted: first.started, duplicateStarted: duplicate.started, calls, images: item?.images };
  });
  expect(result).toEqual({ firstStarted: true, duplicateStarted: false, calls: ["submit"], images: ["https://assets.invalid/persisted.jpg"] });
});

test("photo workflow exposes actionable upload errors without an early success", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const workflows = await import("/src/services/ownerPhotoWorkflows.ts");
    const dependencies = {
      createItem: async (input: object) => ({ id: "item-1", ...input }),
      updateItem: async () => { throw new Error("Network save unavailable; retry when connected."); },
      uploadItemImages: async () => [{ url: "https://assets.invalid/new.jpg" }],
      createShop: async (input: object) => ({ id: "shop-1", ...input }),
      updateShop: async (_id: string, input: object) => ({ id: "shop-1", ...input }),
      uploadShopLogo: async () => ({ url: "" }),
      uploadShopBanner: async () => ({ url: "" }),
    };
    try {
      await workflows.createOwnerPhotoWorkflows(dependencies).createItemWithPhotos(
        { pawnShopId: "shop-1", title: "Camera", price: 100 },
        [new File(["image"], "camera.jpg", { type: "image/jpeg" })],
      );
      return { message: "", recovery: "" };
    } catch (error) {
      return { message: error instanceof Error ? error.message : String(error), recovery: (error as { resourceId?: string }).resourceId || "" };
    }
  });
  expect(result.recovery).toBe("item-1");
  expect(result.message).toContain("Network save unavailable");
});
