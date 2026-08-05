// File: apps/web/src/config.ts

import { resolveEnvironmentContract } from "./environmentContract.mjs";

export const ENVIRONMENT = resolveEnvironmentContract({
  deployEnv: import.meta.env.VITE_DEPLOY_ENV,
  apiOrigin: import.meta.env.VITE_API_ORIGIN,
  apiPath: import.meta.env.VITE_API_BASE,
  apiPathAlias: import.meta.env.VITE_API_BASE_URL,
  socketUrl: import.meta.env.VITE_SOCKET_URL,
  socketPath: import.meta.env.VITE_SOCKET_PATH,
}, {
  isDev: import.meta.env.DEV,
  browserOrigin: typeof window !== "undefined" ? window.location.origin : undefined,
});

export const API_BASE = ENVIRONMENT.apiBase;
export const SOCKET_URL = ENVIRONMENT.socketUrl;
export const SOCKET_PATH = ENVIRONMENT.socketPath;
