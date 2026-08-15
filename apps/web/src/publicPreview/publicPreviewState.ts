import { createContext, useContext } from "react";
import { ENVIRONMENT } from "../config";

const productionBuild = ENVIRONMENT.deployEnv === "production";

export type PublicPreviewState = {
  loading: boolean;
  readOnly: boolean;
  mode: "read-only" | "write-enabled";
  errorCode: string | null;
  retryAfterSeconds: number;
};

export const FAIL_CLOSED_PUBLIC_PREVIEW_STATE: PublicPreviewState = {
  loading: true,
  readOnly: productionBuild,
  mode: productionBuild ? "read-only" : "write-enabled",
  errorCode: productionBuild ? "PUBLIC_PREVIEW_READ_ONLY" : null,
  retryAfterSeconds: 300,
};

export const PublicPreviewContext = createContext<PublicPreviewState>(
  FAIL_CLOSED_PUBLIC_PREVIEW_STATE,
);

export function usePublicPreview() {
  return useContext(PublicPreviewContext);
}
