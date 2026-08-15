import { usePublicPreview } from "./publicPreviewState";
import "./public-preview.css";

export default function PublicPreviewBanner() {
  const { readOnly } = usePublicPreview();
  if (!readOnly) return null;

  return (
    <section className="public-preview-banner" role="status" aria-live="polite">
      <strong>Public preview — browsing only</strong>
      <span>
        You can explore PawnLoop and sign in to an existing account. Registration,
        purchases, bids, offers, uploads, and other changes are temporarily unavailable.
      </span>
    </section>
  );
}
