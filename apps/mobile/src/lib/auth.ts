import * as SecureStore from "expo-secure-store";
import { API_BASE } from "./config";

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

const TOKEN_KEY = "pawnshop_auth_token";
const ROLE_KEY = "pawnshop_auth_role";

async function parseJson(res: Response) {
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password,
    }),
  });

  const data = await parseJson(res);
  if (!res.ok) {
    throw new Error(data?.error || "Login failed");
  }

  return data as AuthResponse;
}

export async function register(
  name: string,
  email: string,
  password: string,
  role: Role
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      role,
    }),
  });

  const data = await parseJson(res);
  if (!res.ok) {
    throw new Error(data?.error || "Register failed");
  }

  return data as AuthResponse;
}

export async function saveSession(token: string, role: Role) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(ROLE_KEY, role);
}

export async function getToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getRole() {
  return SecureStore.getItemAsync(ROLE_KEY);
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(ROLE_KEY);
}
