import { createItem, updateItem, type CreateItemInput, type Item, type UpdateItemInput } from "./items";
import { createShop, updateShop, type CreateShopInput, type Shop, type UpdateShopInput } from "./shops";
import { uploadItemImages, uploadShopBanner, uploadShopLogo } from "./uploads";

export type OwnerPhotoWorkflowDependencies = {
  createItem: typeof createItem;
  updateItem: typeof updateItem;
  createShop: typeof createShop;
  updateShop: typeof updateShop;
  uploadItemImages: typeof uploadItemImages;
  uploadShopLogo: typeof uploadShopLogo;
  uploadShopBanner: typeof uploadShopBanner;
};

export type ItemRecoveryIdentity = {
  recoverableItemId: string;
  recoverableShopId: string;
};

export function preserveItemRecoveryOnPrefillClear(recovery: ItemRecoveryIdentity): ItemRecoveryIdentity {
  return { ...recovery };
}

export function createSubmissionGuard() {
  let active = false;
  return {
    enter() {
      if (active) return false;
      active = true;
      return true;
    },
    leave() {
      active = false;
    },
  };
}

type ItemPageRecoveryCallbacks = ItemSubmissionCallbacks & {
  onSubmissionComplete?: () => void;
};

export function createItemPageRecoveryController(
  workflow: typeof createItemWithPhotos,
) {
  let recovery: ItemRecoveryIdentity = {
    recoverableItemId: "",
    recoverableShopId: "",
  };
  const guard = createSubmissionGuard();

  return {
    getRecovery() {
      return { ...recovery };
    },
    clearPrefill() {
      return preserveItemRecoveryOnPrefillClear(recovery);
    },
    selectShop(requestedShopId: string) {
      return recovery.recoverableItemId
        ? recovery.recoverableShopId
        : requestedShopId;
    },
    startSubmission(
      input: CreateItemInput,
      files: File[],
      callbacks: ItemPageRecoveryCallbacks,
    ) {
      if (!guard.enter()) {
        return { started: false, completion: Promise.resolve<Item | null>(null) };
      }

      const completion = (async () => {
        try {
          if (
            recovery.recoverableItemId &&
            input.pawnShopId !== recovery.recoverableShopId
          ) {
            throw new Error("Retry this saved item with its original shop.");
          }

          const item = await workflow(
            input,
            files,
            recovery.recoverableItemId,
          );
          recovery = { recoverableItemId: "", recoverableShopId: "" };
          callbacks.onRecovery(recovery);
          callbacks.onSuccess(item);
          return item;
        } catch (error) {
          if (error instanceof RecoverablePhotoWorkflowError) {
            recovery = {
              recoverableItemId: error.resourceId,
              recoverableShopId:
                recovery.recoverableShopId || input.pawnShopId,
            };
            callbacks.onRecovery({ ...recovery });
          }
          throw error;
        } finally {
          guard.leave();
          callbacks.onSubmissionComplete?.();
        }
      })();

      return { started: true, completion };
    },
  };
}

type ItemSubmissionCallbacks = {
  onSuccess: (item: Item) => void;
  onRecovery: (recovery: ItemRecoveryIdentity) => void;
};

export class RecoverablePhotoWorkflowError extends Error {
  resourceId: string;
  constructor(message: string, resourceId: string) {
    super(message);
    this.name = "RecoverablePhotoWorkflowError";
    this.resourceId = resourceId;
  }
}

export function createOwnerPhotoWorkflows(dependencies: OwnerPhotoWorkflowDependencies) {
  return {
    async createItemWithPhotos(input: CreateItemInput, files: File[], recoverableItemId = ""): Promise<Item> {
      const item = recoverableItemId
        ? await dependencies.updateItem(recoverableItemId, input as UpdateItemInput)
        : await dependencies.createItem({ ...input, images: [] });
      if (!files.length) return item;
      try {
        const uploaded = await dependencies.uploadItemImages(item.id, files);
        return await dependencies.updateItem(item.id, { ...input, images: uploaded.map(({ url }) => url) });
      } catch (error) {
        throw new RecoverablePhotoWorkflowError(
          error instanceof Error ? `Item saved, but photos were not completed: ${error.message}` : "Item saved, but photos were not completed.",
          item.id,
        );
      }
    },

    async updateItemWithPhotos(item: Item, input: UpdateItemInput, files: File[]): Promise<Item> {
      if (!files.length) return dependencies.updateItem(item.id, input);
      const uploaded = await dependencies.uploadItemImages(item.id, files);
      return dependencies.updateItem(item.id, { ...input, images: [...(item.images || []), ...uploaded.map(({ url }) => url)] });
    },

    async createShopWithBranding(input: CreateShopInput, logo: File | null, banner: File | null, recoverableShopId = ""): Promise<Shop> {
      const shop = recoverableShopId
        ? await dependencies.updateShop(recoverableShopId, input)
        : await dependencies.createShop(input);
      try {
        const [logoAsset, bannerAsset] = await Promise.all([
          logo ? dependencies.uploadShopLogo(shop.id, logo) : null,
          banner ? dependencies.uploadShopBanner(shop.id, banner) : null,
        ]);
        if (!logoAsset && !bannerAsset) return shop;
        return await dependencies.updateShop(shop.id, {
          ...(logoAsset ? { logoUrl: logoAsset.url } : {}),
          ...(bannerAsset ? { bannerUrl: bannerAsset.url } : {}),
        });
      } catch (error) {
        throw new RecoverablePhotoWorkflowError(
          error instanceof Error ? `Shop saved, but branding photos were not completed: ${error.message}` : "Shop saved, but branding photos were not completed.",
          shop.id,
        );
      }
    },

    async updateShopBranding(shopId: string, input: UpdateShopInput, logo: File | null, banner: File | null): Promise<Shop> {
      const [logoAsset, bannerAsset] = await Promise.all([
        logo ? dependencies.uploadShopLogo(shopId, logo) : null,
        banner ? dependencies.uploadShopBanner(shopId, banner) : null,
      ]);
      return dependencies.updateShop(shopId, {
        ...input,
        ...(logoAsset ? { logoUrl: logoAsset.url } : {}),
        ...(bannerAsset ? { bannerUrl: bannerAsset.url } : {}),
      });
    },
  };
}

export const {
  createItemWithPhotos,
  updateItemWithPhotos,
  createShopWithBranding,
  updateShopBranding,
} = createOwnerPhotoWorkflows({
  createItem,
  updateItem,
  createShop,
  updateShop,
  uploadItemImages,
  uploadShopLogo,
  uploadShopBanner,
});

export function createItemPhotoSubmissionRunner(
  workflow: typeof createItemWithPhotos,
) {
  return async function runItemPhotoSubmission(
    input: CreateItemInput,
    files: File[],
    recovery: ItemRecoveryIdentity,
    callbacks: ItemSubmissionCallbacks,
  ) {
    try {
      const item = await workflow(input, files, recovery.recoverableItemId);
      callbacks.onSuccess(item);
      return item;
    } catch (error) {
      if (error instanceof RecoverablePhotoWorkflowError) {
        callbacks.onRecovery({
          recoverableItemId: error.resourceId,
          recoverableShopId: recovery.recoverableShopId || input.pawnShopId,
        });
      }
      throw error;
    }
  };
}

export const runItemPhotoSubmission = createItemPhotoSubmissionRunner(createItemWithPhotos);

export const createItemPageController = () =>
  createItemPageRecoveryController(createItemWithPhotos);
