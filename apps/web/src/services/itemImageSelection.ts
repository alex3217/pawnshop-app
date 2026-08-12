export const ITEM_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
export const MAX_ITEM_IMAGES = 10;
export const MAX_ITEM_IMAGE_BYTES = 10 * 1024 * 1024;

export function appendItemImageFiles(current: File[], incoming: File[], existingCount = 0) {
  const available = Math.max(0, MAX_ITEM_IMAGES - existingCount - current.length);
  return [...current, ...incoming.slice(0, available)];
}

export function validateItemImageFiles(files: File[]) {
  const allowed = new Set(ITEM_IMAGE_ACCEPT.split(","));
  const invalid = files.find((file) => !allowed.has(file.type));
  if (invalid) return `${invalid.name} must be a JPEG, PNG, or WebP image.`;
  const oversized = files.find((file) => file.size > MAX_ITEM_IMAGE_BYTES);
  if (oversized) return `${oversized.name} must be 10 MiB or smaller.`;
  return "";
}
