import { API_BASE, ENVIRONMENT } from "../config";
import { getAuthHeaders, handleAuthenticationFailure } from "./auth";
import { getMfaRequiredScope, requestMfaStepUpProof } from "./mfaStepUp";

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

let publicPreviewReadOnly = ENVIRONMENT.deployEnv === "production";

const PUBLIC_PREVIEW_AUTH_MUTATIONS = new Set([
  "POST /auth/login",
  "POST /auth/mfa/challenge",
  "POST /auth/refresh",
]);

export function setPublicPreviewReadOnly(readOnly: boolean) {
  publicPreviewReadOnly = readOnly;
}

type ApiOptions = Omit<RequestInit, "body" | "headers"> & {
  headers?: Record<string, string>;
  body?: unknown;
  auth?: boolean;
  json?: boolean;
};

function joinUrl(base: string, path: string) {
  const normalizedBase = base.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

async function parseResponse(res: Response) {
  const text = await res.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const data = payload as Record<string, unknown>;
    if (typeof data.error === "string") return data.error;
    if (typeof data.message === "string") return data.message;
  }

  return fallback;
}

async function request<T>(method: string, path: string, options: ApiOptions = {}): Promise<T> {
  if (
    publicPreviewReadOnly &&
    !["GET", "HEAD", "OPTIONS"].includes(method) &&
    !PUBLIC_PREVIEW_AUTH_MUTATIONS.has(`${method} ${path}`)
  ) {
    throw new ApiError(
      "PawnLoop public preview is currently read-only.",
      503,
      { success: false, code: "PUBLIC_PREVIEW_READ_ONLY" },
    );
  }
  const useJson = options.json ?? true;
  const useAuth = options.auth ?? true;

  const headers: Record<string, string> = {
    ...(useAuth ? getAuthHeaders(false) : {}),
    ...(useJson ? { "Content-Type": "application/json" } : {}),
    ...(options.headers ?? {}),
  };

  const body = options.body === undefined
    ? undefined
    : useJson
      ? JSON.stringify(options.body)
      : (options.body as BodyInit);
  const execute = (requestHeaders: Record<string, string>) => fetch(joinUrl(API_BASE, path), {
    ...options,
    method,
    headers: requestHeaders,
    credentials: options.credentials ?? "include",
    body,
  });

  let res = await execute(headers);
  let payload = await parseResponse(res);
  const scope = res.status !== 403 ? null : getMfaRequiredScope(payload);
  if (scope && useAuth) {
    const proof = await requestMfaStepUpProof(scope);
    res = await execute({ ...headers, "x-mfa-step-up-proof": proof });
    payload = await parseResponse(res);
  }

  if (res.status === 401) {
    handleAuthenticationFailure();
  }

  if (!res.ok) {
    throw new ApiError(
      getErrorMessage(payload, `Request failed (${res.status})`),
      res.status,
      payload,
    );
  }

  if (
    typeof window !== "undefined" &&
    method !== "GET" &&
    /^\/(shops|locations|staff|items|inventory-bulk|seller-plans)(\/|$)/.test(path)
  ) {
    window.dispatchEvent(new CustomEvent("pawnloop:owner-setup-updated"));
  }

  return payload as T;
}

export const api = {
  get<T>(path: string, options?: ApiOptions) {
    return request<T>("GET", path, options);
  },

  post<T>(path: string, body?: unknown, options?: ApiOptions) {
    return request<T>("POST", path, { ...options, body });
  },

  put<T>(path: string, body?: unknown, options?: ApiOptions) {
    return request<T>("PUT", path, { ...options, body });
  },

  patch<T>(path: string, body?: unknown, options?: ApiOptions) {
    return request<T>("PATCH", path, { ...options, body });
  },

  delete<T>(path: string, options?: ApiOptions) {
    return request<T>("DELETE", path, options);
  },

  upload<T>(path: string, body: FormData, options?: ApiOptions) {
    return request<T>("POST", path, {
      ...options,
      body,
      json: false,
    });
  },
};
