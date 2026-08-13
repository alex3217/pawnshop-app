import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  appendItemImageFiles,
  ITEM_IMAGE_ACCEPT,
  MAX_ITEM_IMAGES,
  validateItemImageFiles,
} from "../services/itemImageSelection";
import "../styles/item-image-picker.css";

type ItemImagePickerProps = {
  files: File[];
  onChange: (files: File[]) => void;
  existingImages?: string[];
  onRemoveExisting?: (url: string) => void;
  disabled?: boolean;
  disabledReason?: string;
  cameraLabel: string;
  galleryLabel: string;
};

export default function ItemImagePicker({
  files,
  onChange,
  existingImages = [],
  onRemoveExisting,
  disabled = false,
  disabledReason = "",
  cameraLabel,
  galleryLabel,
}: ItemImagePickerProps) {
  const id = useId();
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files],
  );
  const remainingSlots = Math.max(0, MAX_ITEM_IMAGES - existingImages.length - files.length);

  useEffect(() => () => {
    previews.forEach(({ url }) => URL.revokeObjectURL(url));
  }, [previews]);

  useEffect(() => {
    const video = videoRef.current;
    if (!cameraOpen || !video || !cameraStream) return;
    video.srcObject = cameraStream;
    void video.play().catch(() => {
      setError("The camera preview could not start. Close the camera and try again.");
    });
  }, [cameraOpen, cameraStream]);

  useEffect(() => () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  function stopCamera() {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraStream(null);
    setCameraStarting(false);
    setCameraOpen(false);
  }

  async function openCamera() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraRef.current?.click();
      return;
    }

    setCameraOpen(true);
    setCameraStarting(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      cameraStreamRef.current = stream;
      setCameraStream(stream);
    } catch (cameraError) {
      setCameraOpen(false);
      const name = cameraError instanceof DOMException ? cameraError.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setError("Camera access was blocked. Allow camera access for PawnLoop in your browser settings, then try again.");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setError("No camera was found on this device. Use the file chooser to add a photo instead.");
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        setError("The camera is being used by another application. Close that application and try again.");
      } else {
        setError("The camera could not be opened. Check browser camera permissions and try again.");
      }
    } finally {
      setCameraStarting(false);
    }
  }

  async function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setError("The camera is not ready yet. Wait a moment and try again.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setError("The photo could not be captured. Please try again.");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.92);
    });
    if (!blob) {
      setError("The photo could not be captured. Please try again.");
      return;
    }

    const captured = new File(
      [blob],
      `pawnloop-photo-${Date.now()}.jpg`,
      { type: "image/jpeg", lastModified: Date.now() },
    );
    onChange(appendItemImageFiles(files, [captured], existingImages.length));
    setError("");
    stopCamera();
  }

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
    <section className="item-image-picker" aria-labelledby={`${id}-label`}>
      <strong id={`${id}-label`}>Item photos</strong>
      {existingImages.length ? (
        <div aria-label="Existing item images" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {existingImages.map((src, index) => (
            <div key={src} className="item-image-picker-preview">
              <img src={src} alt={`Existing item photo ${index + 1}`} />
              {onRemoveExisting ? <button type="button" className="btn" disabled={disabled} onClick={() => onRemoveExisting(src)}>Remove</button> : null}
            </div>
          ))}
        </div>
      ) : null}
      <div className="item-image-picker-actions">
        <button type="button" className="btn btn-primary" disabled={disabled || remainingSlots === 0} onClick={() => void openCamera()}>
          {cameraLabel}
        </button>
        <button type="button" className="btn" disabled={disabled || remainingSlots === 0} onClick={() => galleryRef.current?.click()}>
          {galleryLabel}
        </button>
      </div>
      <input ref={cameraRef} type="file" accept={ITEM_IMAGE_ACCEPT} capture="environment" hidden disabled={disabled} aria-label={cameraLabel} onChange={selectFiles} />
      <input ref={galleryRef} type="file" accept={ITEM_IMAGE_ACCEPT} multiple hidden disabled={disabled} aria-label={galleryLabel} onChange={selectFiles} />
      <span className="muted">Take a new photo with your camera or choose an existing JPEG, PNG, or WebP file. Up to 10 photos and 10 MiB each.</span>
      {disabledReason ? <span className="muted">{disabledReason}</span> : null}
      {error ? <span className="alert alert-danger" role="alert">{error}</span> : null}
      {previews.length ? (
        <div aria-label="Selected image previews" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {previews.map(({ file, url }, index) => (
            <div key={`${file.name}-${file.lastModified}-${index}`} className="item-image-picker-preview">
              <img src={url} alt={`Selected item photo ${index + 1}`} />
              <button type="button" className="btn" disabled={disabled} onClick={() => onChange(files.filter((_, fileIndex) => fileIndex !== index))}>Remove</button>
            </div>
          ))}
        </div>
      ) : null}
      <span className="muted">{existingImages.length + files.length} of 10 total photo(s) selected.</span>

      {cameraOpen ? (
        <div className="item-camera-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) stopCamera();
        }}>
          <section className="item-camera-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-camera-title`}>
            <div className="item-camera-header">
              <div>
                <h2 id={`${id}-camera-title`}>Take item photo</h2>
                <p>Position the item inside the frame, then capture the photo.</p>
              </div>
              <button type="button" className="item-camera-close" onClick={stopCamera} aria-label="Close camera">×</button>
            </div>
            <div className="item-camera-preview">
              {cameraStarting ? <div className="item-camera-loading">Starting camera…</div> : null}
              <video ref={videoRef} autoPlay muted playsInline aria-label="Live camera preview" />
            </div>
            <div className="item-camera-actions">
              <button type="button" className="btn" onClick={stopCamera}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={cameraStarting || !cameraStream} onClick={() => void capturePhoto()}>
                Capture Photo
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
