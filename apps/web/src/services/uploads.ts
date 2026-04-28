import { api } from "./apiClient";

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

export type BulkInventoryImportResult = {
  totalRows: number;
  successCount: number;
  failedCount: number;
  errors?: Array<{ line: number; error: string }>;
};

type ApiObject = Record<string, unknown>;

function isObject(value: unknown): value is ApiObject {
  return typeof value === "object" && value !== null;
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

function normalizeBulkImportResult(data: unknown): BulkInventoryImportResult {
  const payload =
    isObject(data) && isObject(data.data)
      ? data.data
      : isObject(data)
        ? data
        : {};

  const errors = Array.isArray(payload.errors)
    ? payload.errors.map((entry) => {
        const row = isObject(entry) ? entry : {};
        return {
          line: Number(row.line || 0),
          error: String(row.error || row.message || "Import row failed."),
        };
      })
    : [];

  return {
    totalRows: Number(payload.totalRows || 0),
    successCount: Number(payload.successCount || 0),
    failedCount: Number(payload.failedCount || errors.length || 0),
    errors,
  };
}

export async function uploadFile(
  file: File,
  options?: UploadOptions,
  signal?: AbortSignal,
): Promise<UploadedFile> {
  const formData = new FormData();
  formData.append(options?.fieldName || "file", file);
  appendOptions(formData, options);

  const data = await api.upload<unknown>("/uploads", formData, { signal });
  return normalizeUploadedFile(data);
}

export async function uploadFiles(
  files: File[],
  options?: UploadOptions,
  signal?: AbortSignal,
): Promise<UploadedFile[]> {
  const formData = new FormData();

  for (const file of files) {
    formData.append(options?.fieldName || "files", file);
  }

  appendOptions(formData, options);

  const data = await api.upload<unknown>("/uploads/bulk", formData, { signal });
  return normalizeUploadedFiles(data);
}

export async function importInventoryCsv(
  shopId: string,
  file: File,
  signal?: AbortSignal,
): Promise<BulkInventoryImportResult> {
  if (!shopId) throw new Error("Select a shop first.");
  if (!file) throw new Error("Choose a CSV file to upload.");

  const formData = new FormData();
  formData.append("shopId", shopId);
  formData.append("file", file);

  const data = await api.upload<unknown>("/inventory-bulk/import", formData, {
    signal,
  });

  return normalizeBulkImportResult(data);
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
