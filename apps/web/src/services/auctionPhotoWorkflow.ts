import type { Auction, CreateAuctionInput } from "./auctions";
import { createAuction } from "./auctions";
import type { Item } from "./items";
import { updateItem } from "./items";
import { uploadItemImages } from "./uploads";

type Dependencies = {
  uploadItemImages: typeof uploadItemImages;
  updateItem: typeof updateItem;
  createAuction: typeof createAuction;
};

export function createAuctionPhotoWorkflow(dependencies: Dependencies) {
  let active = false;
  let selectionKey = "";
  let uploadedUrls: string[] = [];
  let photosPersisted = false;

  return {
    reset() {
      if (!active) {
        selectionKey = "";
        uploadedUrls = [];
        photosPersisted = false;
      }
    },
    async submit(item: Item, files: File[], auctionInput: CreateAuctionInput): Promise<Auction> {
      if (active) throw new Error("Auction creation is already in progress.");
      active = true;
      try {
        const nextSelectionKey = `${item.id}:${files.map((file) => `${file.name}:${file.size}:${file.lastModified}`).join("|")}`;
        if (selectionKey !== nextSelectionKey) {
          selectionKey = nextSelectionKey;
          uploadedUrls = [];
          photosPersisted = false;
        }
        if (files.length && !uploadedUrls.length) {
          const uploaded = await dependencies.uploadItemImages(item.id, files);
          uploadedUrls = uploaded.map(({ url }) => url);
        }
        if (uploadedUrls.length && !photosPersisted) {
          await dependencies.updateItem(item.id, {
            images: [...(item.images || []), ...uploadedUrls],
          });
          photosPersisted = true;
        }
        return await dependencies.createAuction(auctionInput);
      } finally {
        active = false;
      }
    },
  };
}

export const createAuctionPagePhotoWorkflow = () => createAuctionPhotoWorkflow({
  uploadItemImages,
  updateItem,
  createAuction,
});
