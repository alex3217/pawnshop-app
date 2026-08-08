import { createItem, updateItem, type CreateItemInput, type Item, type UpdateItemInput } from "./items";
import { createShop, updateShop, type CreateShopInput, type Shop, type UpdateShopInput } from "./shops";
import { uploadItemImages, uploadShopBanner, uploadShopLogo } from "./uploads";

export class RecoverablePhotoWorkflowError extends Error {
  resourceId: string;
  constructor(message: string, resourceId: string) {
    super(message);
    this.name = "RecoverablePhotoWorkflowError";
    this.resourceId = resourceId;
  }
}

export async function createItemWithPhotos(input: CreateItemInput, files: File[], recoverableItemId = ""): Promise<Item> {
  const item = recoverableItemId ? await updateItem(recoverableItemId, input as UpdateItemInput) : await createItem({ ...input, images: [] });
  if (!files.length) return item;
  try {
    const uploaded = await uploadItemImages(item.id, files);
    return await updateItem(item.id, { ...input, images: uploaded.map(({ url }) => url) });
  } catch (error) {
    throw new RecoverablePhotoWorkflowError(
      error instanceof Error ? `Item saved, but photos were not completed: ${error.message}` : "Item saved, but photos were not completed.",
      item.id,
    );
  }
}

export async function updateItemWithPhotos(item: Item, input: UpdateItemInput, files: File[]): Promise<Item> {
  if (!files.length) return updateItem(item.id, input);
  const uploaded = await uploadItemImages(item.id, files);
  return updateItem(item.id, { ...input, images: [...(item.images || []), ...uploaded.map(({ url }) => url)] });
}

export async function createShopWithBranding(input: CreateShopInput, logo: File | null, banner: File | null, recoverableShopId = ""): Promise<Shop> {
  const shop = recoverableShopId ? await updateShop(recoverableShopId, input) : await createShop(input);
  try {
    const [logoAsset, bannerAsset] = await Promise.all([
      logo ? uploadShopLogo(shop.id, logo) : null,
      banner ? uploadShopBanner(shop.id, banner) : null,
    ]);
    if (!logoAsset && !bannerAsset) return shop;
    return await updateShop(shop.id, {
      ...(logoAsset ? { logoUrl: logoAsset.url } : {}),
      ...(bannerAsset ? { bannerUrl: bannerAsset.url } : {}),
    });
  } catch (error) {
    throw new RecoverablePhotoWorkflowError(
      error instanceof Error ? `Shop saved, but branding photos were not completed: ${error.message}` : "Shop saved, but branding photos were not completed.",
      shop.id,
    );
  }
}

export async function updateShopBranding(shopId: string, input: UpdateShopInput, logo: File | null, banner: File | null): Promise<Shop> {
  const [logoAsset, bannerAsset] = await Promise.all([
    logo ? uploadShopLogo(shopId, logo) : null,
    banner ? uploadShopBanner(shopId, banner) : null,
  ]);
  return updateShop(shopId, {
    ...input,
    ...(logoAsset ? { logoUrl: logoAsset.url } : {}),
    ...(bannerAsset ? { bannerUrl: bannerAsset.url } : {}),
  });
}
