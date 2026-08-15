import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { API_BASE } from "../config";
import { setPublicPreviewReadOnly } from "../services/apiClient";
import {
  FAIL_CLOSED_PUBLIC_PREVIEW_STATE,
  PublicPreviewContext,
  type PublicPreviewState,
} from "./publicPreviewState";

function capabilitiesUrl() {
  return `${API_BASE.replace(/\/+$/, "")}/capabilities`;
}

export function PublicPreviewProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PublicPreviewState>(FAIL_CLOSED_PUBLIC_PREVIEW_STATE);

  useEffect(() => {
    const controller = new AbortController();

    void fetch(capabilitiesUrl(), {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Capabilities unavailable");
        const payload = await response.json() as {
          publicPreview?: Partial<Omit<PublicPreviewState, "loading">>;
        };
        const preview = payload.publicPreview;
        if (!preview || typeof preview.readOnly !== "boolean") {
          throw new Error("Invalid capabilities response");
        }
        const next: PublicPreviewState = {
          loading: false,
          readOnly: preview.readOnly,
          mode: preview.readOnly ? "read-only" : "write-enabled",
          errorCode: typeof preview.errorCode === "string" ? preview.errorCode : null,
          retryAfterSeconds: Number.isFinite(preview.retryAfterSeconds)
            ? Number(preview.retryAfterSeconds)
            : 300,
        };
        setPublicPreviewReadOnly(next.readOnly);
        setState(next);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        const fallback = { ...FAIL_CLOSED_PUBLIC_PREVIEW_STATE, loading: false };
        setPublicPreviewReadOnly(fallback.readOnly);
        setState(fallback);
      });

    return () => controller.abort();
  }, []);

  const value = useMemo(() => state, [state]);
  return <PublicPreviewContext.Provider value={value}>{children}</PublicPreviewContext.Provider>;
}
