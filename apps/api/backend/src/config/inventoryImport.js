const MiB = 1024 * 1024;

export const INVENTORY_IMPORT_LIMITS = Object.freeze({
  maxFileBytes: 2 * MiB,
  maxRows: 1_000,
  maxColumns: 7,
  maxFieldBytes: 4_096,
  maxRecordBytes: 16_384,
  maxRetainedErrors: 50,
  rateLimitWindowMs: 60_000,
  rateLimitUserMax: 5,
  rateLimitIpMax: 20,
  maxConcurrent: 2,
});

export const INVENTORY_IMPORT_COLUMNS = Object.freeze([
  "title",
  "price",
  "description",
  "currency",
  "category",
  "condition",
  "status",
]);

export const INVENTORY_IMPORT_REQUIRED_COLUMNS = Object.freeze(["title", "price"]);
