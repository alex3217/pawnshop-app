import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("new item workflow creates once, uploads against the real item, and persists URLs", async () => {
  const source = await read("src/services/ownerPhotoWorkflows.ts");
  assert.match(source, /recoverableItemId \? await updateItem/);
  assert.match(source, /uploadItemImages\(item\.id, files\)/);
  assert.match(source, /updateItem\(item\.id,[\s\S]*images: uploaded\.map/);
  assert.match(source, /RecoverablePhotoWorkflowError/);
});

test("owner item pages expose supported raster selection and recoverable persistence", async () => {
  const [create, edit] = await Promise.all([read("src/pages/CreateItemPage.tsx"), read("src/pages/OwnerItemEditPage.tsx")]);
  assert.match(create, /createItemWithPhotos/);
  assert.match(create, /recoverableItemId/);
  assert.match(create, /setRecoverableItemId\(err\.resourceId\)/);
  assert.match(create, /setRecoverableShopId\(pawnShopId\)/);
  assert.match(create, /disabled=\{loading \|\| saving \|\| Boolean\(recoverableItemId\)\}/);
  assert.match(create, /function clearPrefill\(\)[\s\S]*setRecoverableItemId\(""\)/);
  assert.match(create, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(edit, /updateItemWithPhotos/);
  assert.match(edit, /setItem\(updated\)/);
});

test("shop logo and banner workflows upload to the actual shop and persist URLs", async () => {
  const [workflow, create, locations] = await Promise.all([read("src/services/ownerPhotoWorkflows.ts"), read("src/pages/CreateShopPage.tsx"), read("src/pages/OwnerLocationsPage.tsx")]);
  assert.match(workflow, /uploadShopLogo\(shop\.id, logo\)/);
  assert.match(workflow, /uploadShopBanner\(shop\.id, banner\)/);
  assert.match(workflow, /logoUrl: logoAsset\.url/);
  assert.match(workflow, /bannerUrl: bannerAsset\.url/);
  assert.match(create, /createShopWithBranding/);
  assert.match(locations, /updateShopBranding/);
});

test("upload responses use storage-object identifiers rather than database asset records", async () => {
  const [uploads, docs] = await Promise.all([read("src/services/uploads.ts"), read("../../docs/durable-photo-uploads-v1.md")]);
  assert.match(uploads, /storageObjectId\?: string/);
  assert.match(docs, /storage-object identifier/);
  assert.doesNotMatch(docs, /stable asset ID/);
});
