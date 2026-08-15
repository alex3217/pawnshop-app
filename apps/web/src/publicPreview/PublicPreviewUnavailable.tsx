import { Link } from "react-router-dom";
import { usePublicPreview } from "./publicPreviewState";
import type { ReactNode } from "react";

export function PublicPreviewUnavailable({
  children,
  title = "This action is unavailable during public preview",
}: {
  children: ReactNode;
  title?: string;
}) {
  const { readOnly } = usePublicPreview();
  if (!readOnly) return <>{children}</>;

  return (
    <main className="public-preview-unavailable" aria-labelledby="public-preview-unavailable-title">
      <p>Public preview</p>
      <h1 id="public-preview-unavailable-title">{title}</h1>
      <p>
        PawnLoop is currently browsing-only. Existing users can still sign in,
        but registration and business transactions are disabled.
      </p>
      <div>
        <Link to="/marketplace">Browse marketplace</Link>
        <Link to="/login">Existing-user login</Link>
      </div>
    </main>
  );
}
