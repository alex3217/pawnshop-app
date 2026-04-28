import { API_BASE } from "../config";
import { clearAuth, getAuthHeaders } from "./auth";

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
  const useJson = options.json ?? true;
  const useAuth = options.auth ?? true;

  const headers: Record<string, string> = {
    ...(useAuth ? getAuthHeaders(false) : {}),
    ...(useJson ? { "Content-Type": "application/json" } : {}),
    ...(options.headers ?? {}),
  };

  const res = await fetch(joinUrl(API_BASE, path), {
    ...options,
    method,
    headers,
    credentials: options.credentials ?? "include",
    body:
      options.body === undefined
        ? undefined
        : useJson
          ? JSON.stringify(options.body)
          : (options.body as BodyInit),
  });

  const payload = await parseResponse(res);

  if (res.status === 401) {
    clearAuth();
  }

  if (!res.ok) {
    throw new ApiError(
      getErrorMessage(payload, `Request failed (${res.status})`),
      res.status,
      payload,
    );
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
