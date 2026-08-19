import { updateItem } from "./items";
import { uploadItemImages, uploadMarketplaceListingImages } from "./uploads";

export function durableImageUrls(urls: string[]) {
  return Array.from(new Set(urls.map((url) => String(url || "").trim()).filter((url) => url && !url.startsWith("blob:") && !url.startsWith("data:")))).slice(0, 10);
}

export function normalizeListingOption(value: string, options: readonly string[], fallback = "") {
  const normalized = String(value || "").trim().toLowerCase();
  return options.find((option) => option.toLowerCase() === normalized) || fallback;
}

type Dependencies = {
  uploadItemImages: typeof uploadItemImages;
  updateItem: typeof updateItem;
};

export function createMarketplaceListingPhotoWorkflow(dependencies: Dependencies) {
  return async function persistListingPhotos(itemId: string, existingUrls: string[], files: File[]) {
    const existing = durableImageUrls(existingUrls);
    if (!files.length) return existing;
    if (!itemId) throw new Error("Select a linked inventory item before adding new listing photos.");

    try {
      const uploaded = await dependencies.uploadItemImages(itemId, files);
      const images = durableImageUrls([...existing, ...uploaded.map(({ url }) => url)]);
      if (images.length === existing.length) throw new Error("The upload completed without a durable photo URL. Please try again.");
      await dependencies.updateItem(itemId, { images });
      return images;
    } catch (error) {
      throw new Error(error instanceof Error ? `Photos were not saved: ${error.message}` : "Photos were not saved. Please try again.");
    }
  };
}

export const persistMarketplaceListingPhotos = createMarketplaceListingPhotoWorkflow({ uploadItemImages, updateItem });

export function createConsumerMarketplaceListingPhotoWorkflow(
  upload: typeof uploadMarketplaceListingImages,
) {
  return async function persistConsumerListingPhotos(listingId: string, existingUrls: string[], files: File[]) {
    const existing = durableImageUrls(existingUrls);
    if (!files.length) return existing;
    if (!listingId) throw new Error("Save the draft before adding listing photos.");
    try {
      const uploaded = await upload(listingId, files);
      const images = durableImageUrls([...existing, ...uploaded.map(({ url }) => url)]);
      if (images.length === existing.length) throw new Error("The upload completed without a durable photo URL. Please try again.");
      return images;
    } catch (error) {
      throw new Error(error instanceof Error ? `Photos were not saved: ${error.message}` : "Photos were not saved. Please try again.");
    }
  };
}

export const persistConsumerMarketplaceListingPhotos = createConsumerMarketplaceListingPhotoWorkflow(uploadMarketplaceListingImages);
