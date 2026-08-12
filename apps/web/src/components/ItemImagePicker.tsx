import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  appendItemImageFiles,
  ITEM_IMAGE_ACCEPT,
  MAX_ITEM_IMAGES,
  validateItemImageFiles,
} from "../services/itemImageSelection";

type ItemImagePickerProps = {
  files: File[];
  onChange: (files: File[]) => void;
  existingImages?: string[];
  disabled?: boolean;
  disabledReason?: string;
  cameraLabel: string;
  galleryLabel: string;
};

export default function ItemImagePicker({
  files,
  onChange,
  existingImages = [],
  disabled = false,
  disabledReason = "",
  cameraLabel,
  galleryLabel,
}: ItemImagePickerProps) {
  const id = useId();
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState("");
  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files],
  );
  const remainingSlots = Math.max(0, MAX_ITEM_IMAGES - existingImages.length - files.length);

  useEffect(() => () => {
    previews.forEach(({ url }) => URL.revokeObjectURL(url));
  }, [previews]);

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.target.files || []);
    event.target.value = "";
    const validationError = validateItemImageFiles(incoming);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (remainingSlots === 0) {
      setError("You can select up to 10 images.");
      return;
    }
    const next = appendItemImageFiles(files, incoming, existingImages.length);
    setError(next.length < files.length + incoming.length ? "Only the first 10 images were selected." : "");
    onChange(next);
  }

  return (
    <section aria-labelledby={`${id}-label`} style={{ display: "grid", gap: 10 }}>
      <strong id={`${id}-label`}>Item photos</strong>
      {existingImages.length ? (
        <div aria-label="Existing item images" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {existingImages.map((src, index) => (
            <img key={`${src}-${index}`} src={src} alt={`Existing item photo ${index + 1}`} style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 10 }} />
          ))}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="btn" disabled={disabled || remainingSlots === 0} onClick={() => cameraRef.current?.click()}>
          {cameraLabel}
        </button>
        <button type="button" className="btn" disabled={disabled || remainingSlots === 0} onClick={() => galleryRef.current?.click()}>
          {galleryLabel}
        </button>
      </div>
      <input ref={cameraRef} type="file" accept={ITEM_IMAGE_ACCEPT} capture="environment" hidden disabled={disabled} aria-label={cameraLabel} onChange={selectFiles} />
      <input ref={galleryRef} type="file" accept={ITEM_IMAGE_ACCEPT} multiple hidden disabled={disabled} aria-label={galleryLabel} onChange={selectFiles} />
      <span className="muted">JPEG, PNG, or WebP. Up to 10 files and 10 MiB each. Camera availability depends on your device and browser; unsupported devices use the file chooser.</span>
      {disabledReason ? <span className="muted">{disabledReason}</span> : null}
      {error ? <span className="alert alert-danger" role="alert">{error}</span> : null}
      {previews.length ? (
        <div aria-label="Selected image previews" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {previews.map(({ file, url }, index) => (
            <div key={`${file.name}-${file.lastModified}-${index}`} style={{ display: "grid", gap: 4 }}>
              <img src={url} alt={`Selected item photo ${index + 1}`} style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 10 }} />
              <button type="button" className="btn" disabled={disabled} onClick={() => onChange(files.filter((_, fileIndex) => fileIndex !== index))}>Remove</button>
            </div>
          ))}
        </div>
      ) : null}
      <span className="muted">{existingImages.length + files.length} of 10 total photo(s) selected.</span>
    </section>
  );
}
