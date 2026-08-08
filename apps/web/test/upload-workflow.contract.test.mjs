import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after, before } from "node:test";
import { createServer } from "vite";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

let server;
let workflowModule;

before(async () => {
  server = await createServer({
    root: root.pathname,
    configFile: false,
    envFile: false,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });
  workflowModule = await server.ssrLoadModule("/src/services/ownerPhotoWorkflows.ts");
});

after(async () => {
  await server?.close();
});

function itemInput() {
  return {
    pawnShopId: "shop-1",
    title: "Camera",
    description: "Working camera",
    price: 125,
    category: "Electronics",
    condition: "Good",
  };
}

function fakeDependencies(overrides = {}) {
  const calls = [];
  const dependencies = {
    async createItem(input) {
      calls.push(["createItem", input]);
      return { id: "item-1", ...input, status: "AVAILABLE" };
    },
    async updateItem(id, input) {
      calls.push(["updateItem", id, input]);
      return { id, ...input, status: "AVAILABLE" };
    },
    async uploadItemImages(id, files) {
      calls.push(["uploadItemImages", id, files]);
      return files.map((_, index) => ({ url: `https://assets.invalid/item-${index}.jpg` }));
    },
    async createShop(input) {
      calls.push(["createShop", input]);
      return { id: "shop-1", ...input };
    },
    async updateShop(id, input) {
      calls.push(["updateShop", id, input]);
      return { id, ...input };
    },
    async uploadShopLogo(id, file) {
      calls.push(["uploadShopLogo", id, file]);
      return { url: "https://assets.invalid/logo.jpg" };
    },
    async uploadShopBanner(id, file) {
      calls.push(["uploadShopBanner", id, file]);
      return { url: "https://assets.invalid/banner.jpg" };
    },
    ...overrides,
  };
  return { calls, dependencies };
}

test("new item creates once, uploads against the returned ID, and persists before success", async () => {
  const { calls, dependencies } = fakeDependencies();
  const workflows = workflowModule.createOwnerPhotoWorkflows(dependencies);
  const result = await workflows.createItemWithPhotos(itemInput(), [{ name: "photo.jpg" }]);

  assert.equal(result.id, "item-1");
  assert.deepEqual(calls.map(([name]) => name), ["createItem", "uploadItemImages", "updateItem"]);
  assert.equal(calls[1][1], "item-1");
  assert.deepEqual(calls[2][2].images, ["https://assets.invalid/item-0.jpg"]);
});

test("upload failure retains the original item ID and retry never creates a duplicate", async () => {
  let uploadAttempts = 0;
  const { calls, dependencies } = fakeDependencies({
    async uploadItemImages(id, files) {
      calls.push(["uploadItemImages", id, files]);
      uploadAttempts += 1;
      if (uploadAttempts === 1) throw new Error("Upload temporarily unavailable");
      return [{ url: "https://assets.invalid/retry.jpg" }];
    },
  });
  const workflows = workflowModule.createOwnerPhotoWorkflows(dependencies);

  let recovery;
  await assert.rejects(
    workflows.createItemWithPhotos(itemInput(), [{ name: "photo.jpg" }]),
    (error) => {
      recovery = error.resourceId;
      return error instanceof workflowModule.RecoverablePhotoWorkflowError
        && error.message.includes("Upload temporarily unavailable");
    },
  );
  const result = await workflows.createItemWithPhotos(itemInput(), [{ name: "photo.jpg" }], recovery);

  assert.equal(result.id, "item-1");
  assert.equal(calls.filter(([name]) => name === "createItem").length, 1);
  assert.equal(calls.filter(([name, id]) => name === "uploadItemImages" && id === "item-1").length, 2);
});

test("persistence failure retains recovery identity and retry replaces rather than duplicates URLs", async () => {
  let updateCalls = 0;
  let uploadCalls = 0;
  const persistedImageLists = [];
  const { calls, dependencies } = fakeDependencies({
    async uploadItemImages(id, files) {
      calls.push(["uploadItemImages", id, files]);
      uploadCalls += 1;
      return [{ url: `https://assets.invalid/attempt-${uploadCalls}.jpg` }];
    },
    async updateItem(id, input) {
      calls.push(["updateItem", id, input]);
      updateCalls += 1;
      if (input.images) persistedImageLists.push(input.images);
      if (updateCalls === 1) throw new Error("Save temporarily unavailable");
      return { id, ...input, status: "AVAILABLE" };
    },
  });
  const workflows = workflowModule.createOwnerPhotoWorkflows(dependencies);

  let recovery;
  await assert.rejects(
    workflows.createItemWithPhotos(itemInput(), [{ name: "photo.jpg" }]),
    (error) => {
      recovery = error.resourceId;
      return error instanceof workflowModule.RecoverablePhotoWorkflowError;
    },
  );
  await workflows.createItemWithPhotos(itemInput(), [{ name: "photo.jpg" }], recovery);

  assert.equal(calls.filter(([name]) => name === "createItem").length, 1);
  assert.deepEqual(persistedImageLists, [
    ["https://assets.invalid/attempt-1.jpg"],
    ["https://assets.invalid/attempt-2.jpg"],
  ]);
});

test("page controller preserves recovery through Clear Prefill, locks the shop, and retries the same item", async () => {
  let uploadAttempts = 0;
  const { calls, dependencies } = fakeDependencies({
    async uploadItemImages(id, files) {
      calls.push(["uploadItemImages", id, files]);
      uploadAttempts += 1;
      if (uploadAttempts === 1) throw new Error("Upload temporarily unavailable");
      return [{ url: "https://assets.invalid/retry.jpg" }];
    },
  });
  const workflows = workflowModule.createOwnerPhotoWorkflows(dependencies);
  const controller = workflowModule.createItemPageRecoveryController(workflows.createItemWithPhotos);
  const events = [];
  const callbacks = {
    onRecovery(next) { events.push(["recovery", next]); },
    onSuccess(item) { events.push(["navigate", item.id]); },
  };

  const first = controller.startSubmission(itemInput(), [{ name: "photo.jpg" }], callbacks);
  assert.equal(first.started, true);
  await assert.rejects(first.completion, /photos were not completed/i);
  assert.deepEqual(controller.getRecovery(), {
    recoverableItemId: "item-1",
    recoverableShopId: "shop-1",
  });
  assert.deepEqual(controller.clearPrefill(), controller.getRecovery());
  assert.equal(controller.selectShop("shop-2"), "shop-1");

  const retry = controller.startSubmission(itemInput(), [{ name: "photo.jpg" }], callbacks);
  await retry.completion;
  assert.equal(calls.filter(([name]) => name === "createItem").length, 1);
  assert.equal(calls.filter(([name, id]) => name === "uploadItemImages" && id === "item-1").length, 2);
  assert.deepEqual(controller.getRecovery(), { recoverableItemId: "", recoverableShopId: "" });
  assert.deepEqual(events.at(-1), ["navigate", "item-1"]);
});

test("page controller retains recovery after persistence failure without early navigation or duplicate URLs", async () => {
  let updateAttempts = 0;
  let uploadAttempts = 0;
  const persisted = [];
  const events = [];
  const { calls, dependencies } = fakeDependencies({
    async uploadItemImages(id, files) {
      calls.push(["uploadItemImages", id, files]);
      uploadAttempts += 1;
      return [{ url: `https://assets.invalid/attempt-${uploadAttempts}.jpg` }];
    },
    async updateItem(id, input) {
      calls.push(["updateItem", id, input]);
      if (input.images) {
        updateAttempts += 1;
        persisted.push(input.images);
        if (updateAttempts === 1) throw new Error("Save temporarily unavailable");
      }
      return { id, ...input, status: "AVAILABLE" };
    },
  });
  const workflows = workflowModule.createOwnerPhotoWorkflows(dependencies);
  const controller = workflowModule.createItemPageRecoveryController(workflows.createItemWithPhotos);
  const callbacks = {
    onRecovery(next) { events.push(["recovery", next]); },
    onSuccess(item) { events.push(["navigate", item.id]); },
  };

  await assert.rejects(
    controller.startSubmission(itemInput(), [{ name: "photo.jpg" }], callbacks).completion,
    /photos were not completed/i,
  );
  assert.equal(events.some(([name]) => name === "navigate"), false);
  assert.equal(controller.getRecovery().recoverableItemId, "item-1");

  await controller.startSubmission(itemInput(), [{ name: "photo.jpg" }], callbacks).completion;
  assert.equal(calls.filter(([name]) => name === "createItem").length, 1);
  assert.deepEqual(persisted, [
    ["https://assets.invalid/attempt-1.jpg"],
    ["https://assets.invalid/attempt-2.jpg"],
  ]);
  assert.deepEqual(events.at(-2), ["recovery", { recoverableItemId: "", recoverableShopId: "" }]);
  assert.deepEqual(events.at(-1), ["navigate", "item-1"]);
});

test("page controller rejects overlap synchronously and releases capacity after failure and success", async () => {
  let releaseFirst;
  let calls = 0;
  const workflow = async () => {
    calls += 1;
    if (calls === 1) await new Promise((resolve) => { releaseFirst = resolve; });
    if (calls === 2) throw new Error("ordinary failure");
    return { id: "item-1", status: "AVAILABLE" };
  };
  const controller = workflowModule.createItemPageRecoveryController(workflow);
  const callbacks = { onRecovery() {}, onSuccess() {} };

  const first = controller.startSubmission(itemInput(), [], callbacks);
  const overlap = controller.startSubmission(itemInput(), [], callbacks);
  assert.equal(first.started, true);
  assert.equal(overlap.started, false);
  assert.equal(calls, 1);
  releaseFirst();
  await first.completion;

  const failing = controller.startSubmission(itemInput(), [], callbacks);
  await assert.rejects(failing.completion, /ordinary failure/);
  const afterFailure = controller.startSubmission(itemInput(), [], callbacks);
  assert.equal(afterFailure.started, true);
  await afterFailure.completion;
  assert.equal(calls, 3);
});

test("page controller completes an item without photos before clearing recovery and navigating", async () => {
  const events = [];
  const workflow = async (_input, files, recoverableItemId) => {
    events.push(["workflow", files.length, recoverableItemId]);
    return { id: "item-no-photos", status: "AVAILABLE" };
  };
  const controller = workflowModule.createItemPageRecoveryController(workflow);
  const submission = controller.startSubmission(itemInput(), [], {
    onRecovery(next) { events.push(["recovery", next]); },
    onSuccess(item) { events.push(["navigate", item.id]); },
  });

  await submission.completion;
  assert.deepEqual(events, [
    ["workflow", 0, ""],
    ["recovery", { recoverableItemId: "", recoverableShopId: "" }],
    ["navigate", "item-no-photos"],
  ]);
});

test("existing item uploads append URLs and persist against the existing item", async () => {
  const { calls, dependencies } = fakeDependencies();
  const workflows = workflowModule.createOwnerPhotoWorkflows(dependencies);
  const item = { id: "item-existing", images: ["https://assets.invalid/existing.jpg"], status: "AVAILABLE" };
  await workflows.updateItemWithPhotos(item, { title: "Updated" }, [{ name: "new.jpg" }]);

  assert.deepEqual(calls.map(([name]) => name), ["uploadItemImages", "updateItem"]);
  assert.equal(calls[0][1], "item-existing");
  assert.deepEqual(calls[1][2].images, [
    "https://assets.invalid/existing.jpg",
    "https://assets.invalid/item-0.jpg",
  ]);
});

test("shop creation uploads logo and banner to the returned shop then persists both URLs", async () => {
  const { calls, dependencies } = fakeDependencies();
  const workflows = workflowModule.createOwnerPhotoWorkflows(dependencies);
  await workflows.createShopWithBranding(
    { name: "Downtown" },
    { name: "logo.jpg" },
    { name: "banner.jpg" },
  );

  assert.equal(calls[0][0], "createShop");
  assert.equal(calls.find(([name]) => name === "uploadShopLogo")[1], "shop-1");
  assert.equal(calls.find(([name]) => name === "uploadShopBanner")[1], "shop-1");
  const persist = calls.find(([name]) => name === "updateShop");
  assert.deepEqual(persist.slice(1), ["shop-1", {
    logoUrl: "https://assets.invalid/logo.jpg",
    bannerUrl: "https://assets.invalid/banner.jpg",
  }]);
});

test("existing shop branding uses its real ID and propagates a sanitized boundary error", async () => {
  const { dependencies } = fakeDependencies({
    async uploadShopLogo() {
      throw new Error("Image storage is temporarily unavailable");
    },
  });
  const workflows = workflowModule.createOwnerPhotoWorkflows(dependencies);
  await assert.rejects(
    workflows.updateShopBranding("shop-existing", {}, { name: "logo.jpg" }, null),
    /^Error: Image storage is temporarily unavailable$/,
  );
});

test("page imports the executable controller; source checks remain supplemental", async () => {
  const [create, docs] = await Promise.all([
    read("src/pages/CreateItemPage.tsx"),
    read("../../docs/durable-photo-uploads-v1.md"),
  ]);
  assert.match(create, /createItemPageController/);
  assert.match(create, /recoveryControllerRef\.current\.startSubmission/);
  assert.match(create, /disabled=\{Boolean\(recoverableItemId\) \|\| saving\}/);
  assert.match(create, /recoveryControllerRef\.current\.clearPrefill/);
  assert.match(create, /recoveryControllerRef\.current\.selectShop/);
  assert.match(docs, /storage-object identifier/);
  assert.doesNotMatch(docs, /stable asset ID/);
});
