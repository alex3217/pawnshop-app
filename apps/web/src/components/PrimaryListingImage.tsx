import { useEffect, useState, type ReactNode } from "react";
import { firstUsableImage } from "../utils/imageUrl";

type PrimaryListingImageProps = {
  images: unknown;
  alt: string;
  imageClassName?: string;
  placeholderClassName?: string;
  placeholder?: ReactNode;
  loading?: "eager" | "lazy";
};

export default function PrimaryListingImage({
  images,
  alt,
  imageClassName,
  placeholderClassName,
  placeholder = "No photo available",
  loading = "lazy",
}: PrimaryListingImageProps) {
  const image = firstUsableImage(images);
  const [failedImage, setFailedImage] = useState("");

  useEffect(() => {
    setFailedImage("");
  }, [image]);

  if (!image || failedImage === image) {
    return (
      <div
        className={placeholderClassName}
        role="img"
        aria-label={`${alt} unavailable`}
      >
        {placeholder}
      </div>
    );
  }

  return (
    <img
      src={image}
      alt={alt}
      className={imageClassName}
      loading={loading}
      onError={() => setFailedImage(image)}
    />
  );
}
