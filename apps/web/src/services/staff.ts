// File: apps/web/src/services/staff.ts

import { api } from "./apiClient";

export type StaffRole =
  | "OWNER"
  | "MANAGER"
  | "STAFF"
  | "CASHIER"
  | "INVENTORY"
  | "ADMIN"
  | string;

export type StaffStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "INVITED"
  | "ARCHIVED"
  | string;

export type StaffPermission =
  | "inventory:read"
  | "inventory:write"
  | "auctions:read"
  | "auctions:write"
  | "offers:read"
  | "offers:write"
  | "locations:read"
  | "locations:write"
  | "staff:read"
  | "staff:write"
  | string;

export type StaffMember = {
  id: string;
  shopId?: string | null;
  userId?: string | null;
  name?: string | null;
  fullName?: string | null;
  email: string;
  userEmail?: string | null;
  phone?: string | null;
  role: StaffRole;
  staffRole?: StaffRole | null;
  status?: StaffStatus;
  locationName?: string | null;
  shopName?: string | null;
  pawnShopName?: string | null;
  permissions?: StaffPermission[] | null;
  invitedAt?: string | null;
  acceptedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  user?: unknown;
  shop?: unknown;
};

export type StaffListResponse = {
  staff: StaffMember[];
  total: number;
  page?: number;
  pageSize?: number;
};

export type StaffQuery = {
  shopId?: string;
  role?: StaffRole;
  status?: StaffStatus;
  search?: string;
  page?: number;
  pageSize?: number;
};

export type CreateStaffInput = {
  shopId: string;
  email: string;
  name?: string;
  phone?: string;
  role: StaffRole;
  permissions?: StaffPermission[];
};

export type UpdateStaffInput = Partial<
  Omit<CreateStaffInput, "shopId" | "email">
> & {
  email?: string;
  status?: StaffStatus;
};

type ApiObject = Record<string, unknown>;

function isObject(value: unknown): value is ApiObject {
  return typeof value === "object" && value !== null;
}

function getNestedObject(value: unknown, key: string): ApiObject | null {
  if (!isObject(value)) return null;
  const nested = value[key];
  return isObject(nested) ? nested : null;
}

function cleanQueryValue(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

function buildQuery(query?: StaffQuery) {
  if (!query) return "";

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    const clean = cleanQueryValue(value);
    if (clean !== null) params.set(key, clean);
  }

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function normalizeRole(value: unknown, fallback: StaffRole = "STAFF") {
  const role = String(value || fallback).trim().toUpperCase();
  return role || fallback;
}

function normalizeStatus(value: unknown, fallback: StaffStatus = "ACTIVE") {
  const status = String(value || fallback).trim().toUpperCase();
  return status || fallback;
}

function unwrapStaffMember(data: unknown): StaffMember {
  if (!isObject(data)) {
    throw new Error("Invalid staff response");
  }

  const nestedData = getNestedObject(data, "data");

  const staffMember =
    data.staffMember ??
    data.member ??
    data.staff ??
    nestedData?.staffMember ??
    nestedData?.member ??
    nestedData?.staff ??
    nestedData ??
    data;

  if (!isObject(staffMember)) {
    throw new Error("Invalid staff member response");
  }

  return staffMember as StaffMember;
}

function unwrapStaffList(data: unknown): StaffListResponse {
  if (Array.isArray(data)) {
    return {
      staff: data as StaffMember[],
      total: data.length,
    };
  }

  if (!isObject(data)) {
    return {
      staff: [],
      total: 0,
    };
  }

  const nestedData = getNestedObject(data, "data");

  const staff =
    (Array.isArray(data.staff) ? data.staff : undefined) ??
    (Array.isArray(data.staffMembers) ? data.staffMembers : undefined) ??
    (Array.isArray(data.members) ? data.members : undefined) ??
    (Array.isArray(data.items) ? data.items : undefined) ??
    (Array.isArray(data.rows) ? data.rows : undefined) ??
    (Array.isArray(data.data) ? data.data : undefined) ??
    (nestedData && Array.isArray(nestedData.staff)
      ? nestedData.staff
      : undefined) ??
    (nestedData && Array.isArray(nestedData.staffMembers)
      ? nestedData.staffMembers
      : undefined) ??
    (nestedData && Array.isArray(nestedData.members)
      ? nestedData.members
      : undefined) ??
    (nestedData && Array.isArray(nestedData.items)
      ? nestedData.items
      : undefined) ??
    (nestedData && Array.isArray(nestedData.rows)
      ? nestedData.rows
      : undefined) ??
    [];

  return {
    staff: staff as StaffMember[],
    total:
      typeof data.total === "number"
        ? data.total
        : typeof nestedData?.total === "number"
          ? nestedData.total
          : staff.length,
    page:
      typeof data.page === "number"
        ? data.page
        : typeof nestedData?.page === "number"
          ? nestedData.page
          : undefined,
    pageSize:
      typeof data.pageSize === "number"
        ? data.pageSize
        : typeof nestedData?.pageSize === "number"
          ? nestedData.pageSize
          : undefined,
  };
}

function normalizeCreateStaffInput(input: CreateStaffInput): CreateStaffInput {
  const email = String(input.email || "").trim().toLowerCase();
  const shopId = String(input.shopId || "").trim();

  if (!shopId) throw new Error("Missing shop id.");
  if (!email) throw new Error("Missing staff email.");

  return {
    shopId,
    email,
    name: input.name?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    role: normalizeRole(input.role),
    permissions: Array.isArray(input.permissions)
      ? input.permissions.filter(Boolean)
      : undefined,
  };
}

function normalizeUpdateStaffInput(input: UpdateStaffInput): UpdateStaffInput {
  return {
    ...input,
    email: input.email?.trim().toLowerCase() || undefined,
    name: input.name?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    role: input.role ? normalizeRole(input.role) : undefined,
    status: input.status ? normalizeStatus(input.status) : undefined,
    permissions: Array.isArray(input.permissions)
      ? input.permissions.filter(Boolean)
      : undefined,
  };
}

export async function getStaff(
  query?: StaffQuery,
  signal?: AbortSignal,
): Promise<StaffListResponse> {
  const data = await api.get<unknown>(`/staff${buildQuery(query)}`, { signal });
  return unwrapStaffList(data);
}

export async function getMyStaff(
  query?: StaffQuery,
  signal?: AbortSignal,
): Promise<StaffListResponse> {
  const data = await api.get<unknown>(`/staff/mine${buildQuery(query)}`, {
    signal,
  });

  return unwrapStaffList(data);
}

export async function getShopStaff(
  shopId: string,
  query?: Omit<StaffQuery, "shopId">,
  signal?: AbortSignal,
): Promise<StaffListResponse> {
  if (!shopId) throw new Error("Missing shop id.");
  return getStaff({ ...query, shopId }, signal);
}

export async function getStaffMemberById(
  id: string,
  signal?: AbortSignal,
): Promise<StaffMember> {
  if (!id) throw new Error("Missing staff member id.");

  const data = await api.get<unknown>(`/staff/${encodeURIComponent(id)}`, {
    signal,
  });

  return unwrapStaffMember(data);
}

export async function createStaffMember(
  input: CreateStaffInput,
  signal?: AbortSignal,
): Promise<StaffMember> {
  const data = await api.post<unknown>(
    "/staff",
    normalizeCreateStaffInput(input),
    { signal },
  );

  return unwrapStaffMember(data);
}

export async function inviteStaffMember(
  input: CreateStaffInput,
  signal?: AbortSignal,
): Promise<StaffMember> {
  const data = await api.post<unknown>(
    "/staff/invite",
    normalizeCreateStaffInput(input),
    { signal },
  );

  return unwrapStaffMember(data);
}

export async function updateStaffMember(
  id: string,
  input: UpdateStaffInput,
  signal?: AbortSignal,
): Promise<StaffMember> {
  if (!id) throw new Error("Missing staff member id.");

  const data = await api.patch<unknown>(
    `/staff/${encodeURIComponent(id)}`,
    normalizeUpdateStaffInput(input),
    { signal },
  );

  return unwrapStaffMember(data);
}

export async function removeStaffMember(
  id: string,
  signal?: AbortSignal,
): Promise<void> {
  if (!id) throw new Error("Missing staff member id.");

  await api.delete<unknown>(`/staff/${encodeURIComponent(id)}`, { signal });
}

export async function activateStaffMember(id: string): Promise<StaffMember> {
  return updateStaffMember(id, { status: "ACTIVE" });
}

export async function deactivateStaffMember(id: string): Promise<StaffMember> {
  return updateStaffMember(id, { status: "INACTIVE" });
}

export async function archiveStaffMember(id: string): Promise<StaffMember> {
  return updateStaffMember(id, { status: "ARCHIVED" });
}

export async function updateStaffPermissions(
  id: string,
  permissions: StaffPermission[],
): Promise<StaffMember> {
  return updateStaffMember(id, { permissions });
}
