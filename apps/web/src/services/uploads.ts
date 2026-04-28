import { API_BASE } from "../config";
import { getAuthHeaders } from "./auth";

export type UploadKind =
  | "ITEM_IMAGE"
  | "SHOP_LOGO"
  | "SHOP_BANNER"
  | "USER_AVATAR"
  | "DOCUMENT"
  | "BULK_IMPORT"
  | string;

export type UploadedFile = {
  id?: string;
  url: string;
  key?: string;
  filename?: string;
  originalName?: string;
  mimetype?: string;
  mimeType?: string;
  size?: number;
  kind?: UploadKind;
  createdAt?: string;
  updatedAt?: string;
};

export type UploadResponse = {
  file?: UploadedFile;
  files?: UploadedFile[];
  url?: string;
  urls?: string[];
  data?: unknown;
};

export type UploadOptions = {
  kind?: UploadKind;
  itemId?: string;
  shopId?: string;
  userId?: string;
  fieldName?: string;
};

type ApiObject = Record<string, unknown>;

function isObject(value: unknown): value is ApiObject {
  return typeof value === "object" && value !== null;
}

function joinUrl(base: string, path: string) {
  const normalizedBase = base.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function getErrorMessage(data: unknown, fallback: string) {
  if (!isObject(data)) return fallback;

  if (typeof data.message === "string") return data.message;
  if (typeof data.error === "string") return data.error;
  if (typeof data.details === "string") return data.details;

  return fallback;
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
    throw new Error(getErrorMessage(data, `Request failed with status ${res.status}`));
  }

  return data as T;
}

function normalizeUploadedFile(data: unknown): UploadedFile {
  if (!isObject(data)) throw new Error("Invalid upload response");

  const nestedData = isObject(data.data) ? data.data : null;

  const file =
    data.file ??
    data.upload ??
    nestedData?.file ??
    nestedData?.upload ??
    nestedData ??
    data;

  if (!isObject(file)) throw new Error("Invalid uploaded file response");

  return file as UploadedFile;
}

function normalizeUploadedFiles(data: unknown): UploadedFile[] {
  if (Array.isArray(data)) return data as UploadedFile[];

  if (!isObject(data)) return [];

  const nestedData = isObject(data.data) ? data.data : null;

  if (Array.isArray(data.files)) return data.files as UploadedFile[];
  if (Array.isArray(data.uploads)) return data.uploads as UploadedFile[];
  if (Array.isArray(data.data)) return data.data as UploadedFile[];

  if (nestedData && Array.isArray(nestedData.files)) {
    return nestedData.files as UploadedFile[];
  }

  if (nestedData && Array.isArray(nestedData.uploads)) {
    return nestedData.uploads as UploadedFile[];
  }

  const one = normalizeUploadedFile(data);
  return one.url ? [one] : [];
}

function appendOptions(formData: FormData, options?: UploadOptions) {
  if (!options) return;

  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined && value !== null && value !== "") {
      formData.append(key, String(value));
    }
  }
}

export async function uploadFile(
  file: File,
  options?: UploadOptions,
): Promise<UploadedFile> {
  const formData = new FormData();
  formData.append(options?.fieldName || "file", file);
  appendOptions(formData, options);

  const res = await fetch(joinUrl(API_BASE, "/uploads"), {
    method: "POST",
    headers: getAuthHeaders(false),
    credentials: "include",
    body: formData,
  });

  return normalizeUploadedFile(await parseResponse(res));
}

export async function uploadFiles(
  files: File[],
  options?: UploadOptions,
): Promise<UploadedFile[]> {
  const formData = new FormData();

  for (const file of files) {
    formData.append(options?.fieldName || "files", file);
  }

  appendOptions(formData, options);

  const res = await fetch(joinUrl(API_BASE, "/uploads/bulk"), {
    method: "POST",
    headers: getAuthHeaders(false),
    credentials: "include",
    body: formData,
  });

  return normalizeUploadedFiles(await parseResponse(res));
}

export async function uploadItemImage(
  itemId: string,
  file: File,
): Promise<UploadedFile> {
  return uploadFile(file, {
    kind: "ITEM_IMAGE",
    itemId,
    fieldName: "image",
  });
}

export async function uploadItemImages(
  itemId: string,
  files: File[],
): Promise<UploadedFile[]> {
  return uploadFiles(files, {
    kind: "ITEM_IMAGE",
    itemId,
    fieldName: "images",
  });
}

export async function uploadShopLogo(
  shopId: string,
  file: File,
): Promise<UploadedFile> {
  return uploadFile(file, {
    kind: "SHOP_LOGO",
    shopId,
    fieldName: "logo",
  });
}

export async function uploadShopBanner(
  shopId: string,
  file: File,
): Promise<UploadedFile> {
  return uploadFile(file, {
    kind: "SHOP_BANNER",
    shopId,
    fieldName: "banner",
  });
}
