import { useId, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";
import { uploadFiles } from "../services/uploads";
import "../styles/product-image-manager.css";
import "../styles/product-image-pending.css";

const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_BYTES = 8 * 1024 * 1024;

type Props = { images: string[]; onChange(images: string[]): void; limit: number; label?: string; disabled?: boolean; showUrlOption?: boolean };

function messageFor(file: File) {
  if (!SUPPORTED_TYPES.has(file.type)) return `${file.name}: unsupported type. Use JPEG, PNG, or WebP; HEIC/HEIF conversion is unavailable.`;
  if (file.size > MAX_FILE_BYTES) return `${file.name}: larger than the 8 MB limit.`;
  return "";
}

export default function ProductImageManager({ images, onChange, limit, label = "Product images", disabled = false, showUrlOption = false }: Props) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [replaceIndex, setReplaceIndex] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pendingPreviews, setPendingPreviews] = useState<string[]>([]);
  const [url, setUrl] = useState("");

  async function addFiles(files: File[], replacing: number | null = null) {
    const nextErrors = files.map(messageFor).filter(Boolean);
    const valid = files.filter((file) => !messageFor(file));
    const capacity = replacing === null ? Math.max(limit - images.length, 0) : 1;
    if (valid.length > capacity) nextErrors.push(`Only ${capacity} more image${capacity === 1 ? "" : "s"} can be added on this plan.`);
    setErrors(nextErrors);
    const accepted = valid.slice(0, capacity);
    if (!accepted.length) return;
    Promise.all(accepted.map((file) => new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = () => resolve(""); reader.readAsDataURL(file); }))).then((values) => setPendingPreviews(values.filter(Boolean)));
    setBusy(true); setProgress(10);
    try {
      const uploaded = await uploadFiles(accepted, { kind: "ITEM_IMAGE", fieldName: "images" });
      const urls = uploaded.map((entry) => entry.url).filter(Boolean);
      setProgress(100);
      if (replacing === null) onChange([...images, ...urls]);
      else { const next = [...images]; if (urls[0]) next[replacing] = urls[0]; onChange(next); }
    } catch (error) { setErrors([error instanceof Error ? error.message : "Image upload failed."]); }
    finally { setBusy(false); setPendingPreviews([]); window.setTimeout(() => setProgress(0), 500); }
  }

  function choose(event: ChangeEvent<HTMLInputElement>, replacing: number | null = null) { void addFiles(Array.from(event.target.files || []), replacing); event.target.value = ""; }
  function move(index: number, direction: -1 | 1) { const target = index + direction; if (target < 0 || target >= images.length) return; const next = [...images]; [next[index], next[target]] = [next[target], next[index]]; onChange(next); }
  function makeCover(index: number) { if (index === 0) return; onChange([images[index], ...images.filter((_, current) => current !== index)]); }
  function remove(index: number) { onChange(images.filter((_, current) => current !== index)); }
  function keyboardMove(event: KeyboardEvent, index: number) { if (event.altKey && event.key === "ArrowLeft") { event.preventDefault(); move(index, -1); } if (event.altKey && event.key === "ArrowRight") { event.preventDefault(); move(index, 1); } }
  function drop(event: DragEvent) { event.preventDefault(); if (!disabled) void addFiles(Array.from(event.dataTransfer.files)); }
  function addUrl() { const value = url.trim(); if (!/^https:\/\//i.test(value)) { setErrors(["Existing image URLs must use HTTPS."]); return; } if (images.length >= limit) { setErrors([`The ${limit}-image plan limit has been reached.`]); return; } onChange([...images, value]); setUrl(""); setErrors([]); }

  return <section className="product-image-manager" aria-labelledby={`${id}-label`} onDragOver={(event) => event.preventDefault()} onDrop={drop}>
    <div className="product-image-manager__header"><div><h2 id={`${id}-label`}>{label}</h2><p>{images.length} of {limit} images. The first image is the cover.</p></div><div className="product-image-manager__actions"><button type="button" disabled={disabled || busy || images.length >= limit} onClick={() => fileRef.current?.click()}>Add images</button><button type="button" disabled={disabled || busy || images.length >= limit} onClick={() => cameraRef.current?.click()}>Take photo</button></div></div>
    <input ref={fileRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={choose} aria-label="Select multiple product images" />
    <input ref={cameraRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={choose} aria-label="Take a product photo with the rear camera" />
    <input ref={replaceRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => choose(event, replaceIndex)} aria-label="Choose a replacement product image" />
    <div className="product-image-manager__drop" role="button" tabIndex={0} onClick={() => fileRef.current?.click()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileRef.current?.click(); } }}>Drag and drop images here, or press Enter to browse.</div>
    {busy ? <div className="product-image-manager__progress" role="status" aria-live="polite">Uploading images… <progress max="100" value={progress} /></div> : null}
    {pendingPreviews.length ? <div className="product-image-manager__pending" aria-label="Images awaiting upload">{pendingPreviews.map((preview, index) => <img key={index} src={preview} alt={`Selected image ${index + 1} awaiting upload`} />)}</div> : null}
    {errors.length ? <ul className="product-image-manager__errors" role="alert">{errors.map((error) => <li key={error}>{error}</li>)}</ul> : null}
    <ol className="product-image-manager__grid" aria-label="Ordered product images">{images.map((image, index) => <li key={`${image}-${index}`} onKeyDown={(event) => keyboardMove(event, index)}><img src={image} alt={`${label} ${index + 1} of ${images.length}${index === 0 ? ", cover image" : ""}`} /><strong>{index === 0 ? "Cover image" : `Image ${index + 1}`}</strong><div><button type="button" disabled={index === 0} onClick={() => makeCover(index)} aria-label={`Make image ${index + 1} the cover`}>Make cover</button><button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move image ${index + 1} earlier`}>←</button><button type="button" disabled={index === images.length - 1} onClick={() => move(index, 1)} aria-label={`Move image ${index + 1} later`}>→</button><button type="button" onClick={() => { setReplaceIndex(index); replaceRef.current?.click(); }} aria-label={`Replace image ${index + 1}`}>Replace</button><button type="button" onClick={() => remove(index)} aria-label={`Remove image ${index + 1}`}>Remove</button></div></li>)}</ol>
    {showUrlOption ? <details className="product-image-manager__urls"><summary>Advanced: add an existing HTTPS image URL</summary><div><input value={url} onChange={(event) => setUrl(event.target.value)} inputMode="url" placeholder="https://example.com/item.jpg" aria-label="Existing HTTPS image URL" /><button type="button" onClick={addUrl}>Add URL</button></div></details> : null}
  </section>;
}
