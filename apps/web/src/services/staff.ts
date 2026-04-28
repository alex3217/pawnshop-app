// File: apps/web/src/services/staff.ts

import { API_BASE } from "../config";
import { getAuthHeaders } from "./auth";

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

export type StaffMember = {
  id: string;
  shopId?: string | null;
  userId?: string | null;
  name?: string | null;
  email: string;
  phone?: string | null;
  role: StaffRole;
  status?: StaffStatus;
  permissions?: string[] | null;
  invitedAt?: string | null;
  acceptedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  user?: unknown;
  shop?: unknown;
};

export type StaffListResponse = {
  staff: StaffMember[];
  total?: number;
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
  permissions?: string[];
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

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function joinUrl(base: string, path: string) {
  const normalizedBase = base.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function buildQuery(query?: StaffQuery) {
  if (!query) return "";

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

async function parseResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!res.ok) {
    const message =
      getString(isObject(data) ? data.message : undefined) ||
      getString(isObject(data) ? data.error : undefined) ||
      getString(isObject(data) ? data.details : undefined) ||
      `Request failed with status ${res.status}`;

    throw new Error(message);
  }

  return data as T;
}

function unwrapStaffMember(data: unknown): StaffMember {
  if (!isObject(data)) {
    throw new Error("Invalid staff response");
  }

  const nestedData = getNestedObject(data, "data");

  const staffMember =
    data.staffMember ??
    data.staff ??
    nestedData?.staffMember ??
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
    (Array.isArray(data.data) ? data.data : undefined) ??
    (nestedData && Array.isArray(nestedData.staff)
      ? nestedData.staff
      : undefined) ??
    (nestedData && Array.isArray(nestedData.staffMembers)
      ? nestedData.staffMembers
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

export async function getStaff(query?: StaffQuery): Promise<StaffListResponse> {
  const res = await fetch(joinUrl(API_BASE, `/staff${buildQuery(query)}`), {
    method: "GET",
    headers: getAuthHeaders(),
    credentials: "include",
  });

  return unwrapStaffList(await parseResponse(res));
}

export async function getMyStaff(query?: StaffQuery): Promise<StaffListResponse> {
  const res = await fetch(joinUrl(API_BASE, `/staff/mine${buildQuery(query)}`), {
    method: "GET",
    headers: getAuthHeaders(),
    credentials: "include",
  });

  return unwrapStaffList(await parseResponse(res));
}

export async function getShopStaff(
  shopId: string,
  query?: Omit<StaffQuery, "shopId">,
): Promise<StaffListResponse> {
  return getStaff({ ...query, shopId });
}

export async function getStaffMemberById(id: string): Promise<StaffMember> {
  const res = await fetch(joinUrl(API_BASE, `/staff/${id}`), {
    method: "GET",
    headers: getAuthHeaders(),
    credentials: "include",
  });

  return unwrapStaffMember(await parseResponse(res));
}

export async function createStaffMember(
  input: CreateStaffInput,
): Promise<StaffMember> {
  const res = await fetch(joinUrl(API_BASE, "/staff"), {
    method: "POST",
    headers: getAuthHeaders(true),
    credentials: "include",
    body: JSON.stringify(input),
  });

  return unwrapStaffMember(await parseResponse(res));
}

export async function inviteStaffMember(
  input: CreateStaffInput,
): Promise<StaffMember> {
  const res = await fetch(joinUrl(API_BASE, "/staff/invite"), {
    method: "POST",
    headers: getAuthHeaders(true),
    credentials: "include",
    body: JSON.stringify(input),
  });

  return unwrapStaffMember(await parseResponse(res));
}

export async function updateStaffMember(
  id: string,
  input: UpdateStaffInput,
): Promise<StaffMember> {
  const res = await fetch(joinUrl(API_BASE, `/staff/${id}`), {
    method: "PATCH",
    headers: getAuthHeaders(true),
    credentials: "include",
    body: JSON.stringify(input),
  });

  return unwrapStaffMember(await parseResponse(res));
}

export async function removeStaffMember(id: string): Promise<void> {
  const res = await fetch(joinUrl(API_BASE, `/staff/${id}`), {
    method: "DELETE",
    headers: getAuthHeaders(),
    credentials: "include",
  });

  await parseResponse(res);
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
  permissions: string[],
): Promise<StaffMember> {
  return updateStaffMember(id, { permissions });
}