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

function unwrapStaffMember(data: unknown): StaffMember {
  if (!isObject(data)) throw new Error("Invalid staff response");

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
    (Array.isArray(data.rows) ? data.rows : undefined) ??
    (Array.isArray(data.items) ? data.items : undefined) ??
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
  const data = await api.get<unknown>(`/staff${buildQuery(query)}`);
  return unwrapStaffList(data);
}

export async function getMyStaff(query?: StaffQuery): Promise<StaffListResponse> {
  const data = await api.get<unknown>(`/staff/mine${buildQuery(query)}`);
  return unwrapStaffList(data);
}

export async function getShopStaff(
  shopId: string,
  query?: Omit<StaffQuery, "shopId">,
): Promise<StaffListResponse> {
  return getStaff({ ...query, shopId });
}

export async function getStaffMemberById(id: string): Promise<StaffMember> {
  if (!id) throw new Error("Missing staff member id.");
  const data = await api.get<unknown>(`/staff/${encodeURIComponent(id)}`);
  return unwrapStaffMember(data);
}

export async function createStaffMember(
  input: CreateStaffInput,
): Promise<StaffMember> {
  const data = await api.post<unknown>("/staff", input);
  return unwrapStaffMember(data);
}

export async function inviteStaffMember(
  input: CreateStaffInput,
): Promise<StaffMember> {
  const data = await api.post<unknown>("/staff/invite", input);
  return unwrapStaffMember(data);
}

export async function updateStaffMember(
  id: string,
  input: UpdateStaffInput,
): Promise<StaffMember> {
  if (!id) throw new Error("Missing staff member id.");

  const data = await api.patch<unknown>(
    `/staff/${encodeURIComponent(id)}`,
    input,
  );

  return unwrapStaffMember(data);
}

export async function removeStaffMember(id: string): Promise<void> {
  if (!id) throw new Error("Missing staff member id.");
  await api.delete<unknown>(`/staff/${encodeURIComponent(id)}`);
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
