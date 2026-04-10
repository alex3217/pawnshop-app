// File: apps/web/src/config.ts

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const ensureLeadingSlash = (value: string) =>
  value.startsWith("/") ? value : `/${value}`;

const ensureApiSuffix = (value: string) => {
  const normalized = stripTrailingSlash(value);
  return normalized.endsWith("/api") ? normalized : `${normalized}/api`;
};

const isDev = import.meta.env.DEV;

const rawApiBase =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_BASE ||
  "";

const rawSocketUrl =
  import.meta.env.VITE_SOCKET_URL ||
  import.meta.env.VITE_API_ORIGIN ||
  "";

const rawSocketPath = import.meta.env.VITE_SOCKET_PATH || "/socket.io";

/**
 * In development, always use the Vite same-origin proxy.
 * In production/build-like environments, allow explicit env overrides.
 */
export const API_BASE = isDev
  ? "/api"
  : rawApiBase
    ? (rawApiBase.startsWith("/")
        ? ensureLeadingSlash(stripTrailingSlash(rawApiBase))
        : ensureApiSuffix(rawApiBase))
    : "/api";

export const SOCKET_URL = isDev
  ? (typeof window !== "undefined"
      ? window.location.origin
      : "http://127.0.0.1:5176")
  : stripTrailingSlash(
      rawSocketUrl ||
        (typeof window !== "undefined"
          ? window.location.origin
          : "http://127.0.0.1:5176")
    );

export const SOCKET_PATH = ensureLeadingSlash(rawSocketPath);