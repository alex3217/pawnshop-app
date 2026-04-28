// File: apps/web/src/admin/config/permissions.ts

import { getAuthRole } from "../../services/auth";
import type { AdminPermission, AdminViewerContext } from "../types/admin";

type KnownAdminRole = "ADMIN" | "SUPER_ADMIN";
type KnownViewerRole = "CONSUMER" | "OWNER" | KnownAdminRole;

const ROLE_ALIASES: Record<string, KnownViewerRole> = {
  USER: "CONSUMER",
  BUYER: "CONSUMER",
  CUSTOMER: "CONSUMER",
  SELLER: "OWNER",
  SHOP_OWNER: "OWNER",
  SUPERADMIN: "SUPER_ADMIN",
  "SUPER-ADMIN": "SUPER_ADMIN",
  "SUPER ADMIN": "SUPER_ADMIN",
};

export const ALL_ADMIN_PERMISSIONS: readonly AdminPermission[] = [
  "admin:overview:read",
  "admin:users:read",
  "admin:owners:read",
  "admin:shops:read",
  "admin:inventory:read",
  "admin:auctions:read",
  "admin:offers:read",
  "admin:orders:read",
  "admin:reviews:read",
  "admin:support:read",
  "admin:subscriptions:read",
  "admin:revenue:read",
  "admin:analytics:read",
  "admin:risk:read",
  "admin:audit:read",
  "admin:system:read",
  "admin:settings:read",
] as const;

export const ALL_SUPER_ADMIN_PERMISSIONS: readonly AdminPermission[] = [
  ...ALL_ADMIN_PERMISSIONS,
] as const;

const ROLE_PERMISSION_MAP: Record<KnownAdminRole, readonly AdminPermission[]> = {
  ADMIN: ALL_ADMIN_PERMISSIONS,
  SUPER_ADMIN: ALL_SUPER_ADMIN_PERMISSIONS,
};

function normalizeViewerRole(
  role: string | null | undefined
): KnownViewerRole | null {
  const raw = String(role || "").trim().toUpperCase();
  if (!raw) return null;

  const aliased = ROLE_ALIASES[raw] ?? raw;

  if (
    aliased === "CONSUMER" ||
    aliased === "OWNER" ||
    aliased === "ADMIN" ||
    aliased === "SUPER_ADMIN"
  ) {
    return aliased;
  }

  return null;
}

export function normalizeAdminRole(
  role: string | null | undefined
): KnownAdminRole | null {
  const normalized = normalizeViewerRole(role);

  if (normalized === "ADMIN") return "ADMIN";
  if (normalized === "SUPER_ADMIN") return "SUPER_ADMIN";

  return null;
}

export function isAdminRole(
  role: string | null | undefined
): role is KnownAdminRole {
  return normalizeAdminRole(role) !== null;
}

export function isSuperAdminRole(
  role: string | null | undefined
): role is "SUPER_ADMIN" {
  return normalizeAdminRole(role) === "SUPER_ADMIN";
}

export function getAdminPermissionsForRole(
  role: string | null | undefined
): Set<AdminPermission> {
  const normalizedRole = normalizeAdminRole(role);
  if (!normalizedRole) return new Set<AdminPermission>();

  return new Set<AdminPermission>(ROLE_PERMISSION_MAP[normalizedRole]);
}

export function getAdminViewerContext(): AdminViewerContext {
  const role = normalizeViewerRole(getAuthRole());

  return {
    role,
    permissions: getAdminPermissionsForRole(role),
  };
}

export function hasAdminPermissions(
  context: AdminViewerContext,
  required: readonly AdminPermission[]
): boolean {
  if (!isAdminRole(context.role)) return false;
  if (required.length === 0) return true;

  return required.every((permission) => context.permissions.has(permission));
}

export function hasAnyAdminPermission(
  context: AdminViewerContext,
  required: readonly AdminPermission[]
): boolean {
  if (!isAdminRole(context.role)) return false;
  if (required.length === 0) return true;

  return required.some((permission) => context.permissions.has(permission));
}

export function canAccessAdminSurface(
  role: string | null | undefined
): boolean {
  return isAdminRole(role);
}

export function canAccessSuperAdminSurface(
  role: string | null | undefined
): boolean {
  return isSuperAdminRole(role);
}