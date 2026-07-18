const VALID_DATA_IMAGE_PATTERN =
  /^data:image\/(?:png|jpeg|jpg|gif|webp|avif);base64,[a-z0-9+/]+={0,2}$/i;

export function isUsableImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;

  const url = value.trim();
  if (!url) return false;

  if (url.startsWith("data:image/")) {
    return VALID_DATA_IMAGE_PATTERN.test(url);
  }

  if (url.startsWith("blob:")) return true;
  if (url.startsWith("/")) return true;

  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function firstUsableImage(
  images: unknown,
): string {
  if (!Array.isArray(images)) return "";

  const match = images.find(isUsableImageUrl);
  return typeof match === "string" ? match.trim() : "";
}
