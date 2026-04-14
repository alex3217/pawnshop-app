// File: apps/web/src/services/auth.ts

import { API_BASE } from "../config";

export type Role = "CONSUMER" | "OWNER" | "ADMIN";

export type AuthUser = {
  id?: string;
  role: Role;
  email: string;
  name: string;
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
};

const STORAGE_KEYS = {
  token: "auth_token",
  role: "auth_role",
  user: "auth_user",
  consumerToken: "consumer_token",
  ownerToken: "owner_token",

  // legacy / compatibility keys
  legacyToken: "token",
  legacyAccessToken: "accessToken",
} as const;

function isRole(value: unknown): value is Role {
  return value === "CONSUMER" || value === "OWNER" || value === "ADMIN";
}

function joinUrl(base: string, path: string) {
  const normalizedBase = base.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

async function parseJson<T = Record<string, unknown>>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;

    const payload = parts[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "="
    );

    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function getRoleFromToken(token: string): Role | null {
  const payload = decodeJwtPayload(token);
  const role = payload?.role;
  return isRole(role) ? role : null;
}

function getRoleSpecificTokenKey(role: Role) {
  switch (role) {
    case "CONSUMER":
      return STORAGE_KEYS.consumerToken;
    case "OWNER":
      return STORAGE_KEYS.ownerToken;
    case "ADMIN":
    default:
      return null;
  }
}

function normalizeUser(raw: unknown): AuthUser | null {
  if (!raw || typeof raw !== 'object') return null;

  const data = raw as Record<string, unknown>;
  const role = data.role;
  const email = data.email;
  const id = data.id;
  const name =
    data.name ??
    data.displayName ??
    data.fullName ??
    (typeof email === "string" ? email.split("@")[0] : "");

  if (!isRole(role)) return null;
  if (typeof email !== "string" || !email.trim()) return null;
  if (typeof name !== "string" || !name.trim()) return null;

  return {
    id: typeof id === "string" ? id : undefined,
    role,
    email,
    name,
  };
}

function readStoredValue(key: string) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeStoredValue(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
}

function removeStoredValue(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
}

function removeSessionValue(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
}

function getStoredToken() {
  return (
    readStoredValue(STORAGE_KEYS.token) ||
    readStoredValue(STORAGE_KEYS.ownerToken) ||
    readStoredValue(STORAGE_KEYS.consumerToken) ||
    readStoredValue(STORAGE_KEYS.legacyToken) ||
    readStoredValue(STORAGE_KEYS.legacyAccessToken) ||
    ""
  );
}

function clearLegacyTokens() {
  removeStoredValue(STORAGE_KEYS.legacyToken);
  removeStoredValue(STORAGE_KEYS.legacyAccessToken);
  removeSessionValue("token");
}

async function requestAuth(
  path: string,
  payload: Record<string, unknown>
): Promise<AuthResponse> {
  let res: Response;

  try {
    res = await fetch(joinUrl(API_BASE, path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "same-origin",
    });
  } catch (error) {
    console.error("[auth.requestAuth] fetch failed", {
      path,
      apiBase: API_BASE,
      error,
    });
    throw new Error("Unable to reach the authentication service.");
  }

  const data = await parseJson<Record<string, unknown>>(res);

  if (!res.ok) {
    const message =
      typeof data?.error === "string"
        ? data.error
        : typeof data?.message === "string"
          ? data.message
          : `Request failed (${res.status})`;

    throw new Error(message);
  }

  const token = typeof data?.token === "string" ? data.token : "";
  const user = normalizeUser(data?.user);

  if (!token || !user) {
    console.error("[auth.requestAuth] invalid response", {
      path,
      status: res.status,
      data,
    });
    throw new Error("Invalid authentication response from server.");
  }

  return { token, user };
}

export async function login(
  email: string,
  password: string
): Promise<AuthResponse> {
  return requestAuth("/auth/login", {
    email: email.trim().toLowerCase(),
    password,
  });
}

export async function register(
  name: string,
  email: string,
  password: string,
  role: Role
): Promise<AuthResponse> {
  if (role === "ADMIN") {
    throw new Error("Public registration for admin is not allowed.");
  }

  return requestAuth("/auth/register", {
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password,
    role,
  });
}

export function persistAuth(token: string, role: Role, user?: AuthUser) {
  clearLegacyTokens();

  writeStoredValue(STORAGE_KEYS.token, token);
  writeStoredValue(STORAGE_KEYS.role, role);

  if (user) {
    writeStoredValue(STORAGE_KEYS.user, JSON.stringify(user));
  } else {
    removeStoredValue(STORAGE_KEYS.user);
  }

  removeStoredValue(STORAGE_KEYS.consumerToken);
  removeStoredValue(STORAGE_KEYS.ownerToken);

  const roleSpecificKey = getRoleSpecificTokenKey(role);
  if (roleSpecificKey) {
    writeStoredValue(roleSpecificKey, token);
  }
}

export function logout() {
  removeStoredValue(STORAGE_KEYS.token);
  removeStoredValue(STORAGE_KEYS.role);
  removeStoredValue(STORAGE_KEYS.user);
  removeStoredValue(STORAGE_KEYS.consumerToken);
  removeStoredValue(STORAGE_KEYS.ownerToken);
  clearLegacyTokens();
}

export function getAuthToken() {
  return getStoredToken();
}

export function getAuthRole(): Role | null {
  const storedRole = readStoredValue(STORAGE_KEYS.role);
  if (isRole(storedRole)) return storedRole;

  const token = getStoredToken();
  if (!token) return null;

  const tokenRole = getRoleFromToken(token);
  if (tokenRole) {
    writeStoredValue(STORAGE_KEYS.role, tokenRole);
    return tokenRole;
  }

  return null;
}

export function getAuthUser(): AuthUser | null {
  const raw = readStoredValue(STORAGE_KEYS.user);
  if (!raw) return null;

  try {
    return normalizeUser(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function isAuthenticated() {
  return Boolean(getAuthToken());
}

export function hasRole(...roles: Role[]) {
  const role = getAuthRole();
  return !!role && roles.includes(role);
}

export function getAuthHeader() {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getAuthHeaders(includeJson = false) {
  const token = getAuthToken();
  return {
    ...(includeJson ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}