import { parse } from "csv-parse/sync";

export const CSV_LIMITS = Object.freeze({ bytes: 2 * 1024 * 1024, rows: 1000, fieldLength: 2000 });
export const CSV_MIME_TYPES = new Set(["text/csv", "application/csv", "application/vnd.ms-excel"]);
const ALLOWED_HEADERS = new Set(["title", "price", "description", "currency", "category", "condition", "status"]);
const REQUIRED_HEADERS = ["title", "price"];
const FORMULA_PREFIX = /^[\t\r ]*[=+\-@]/u;

export function safeCsvFilename(value) {
  const base = String(value || "upload.csv").replace(/\\/gu, "/").split("/").pop();
  const normalized = base.normalize("NFKC").replace(/[^a-zA-Z0-9._-]/gu, "_").replace(/^\.+/u, "");
  return (normalized || "upload.csv").slice(0, 120);
}

export function validateCsvFileMetadata(file) {
  if (!file) throw Object.assign(new Error("CSV file is required"), { statusCode: 400 });
  const name = safeCsvFilename(file.originalname);
  if (!name.toLowerCase().endsWith(".csv")) throw Object.assign(new Error("Only .csv files are accepted"), { statusCode: 415 });
  if (!CSV_MIME_TYPES.has(String(file.mimetype || "").toLowerCase())) throw Object.assign(new Error("Unsupported CSV MIME type"), { statusCode: 415 });
  if (!file.buffer?.length || file.buffer.length > CSV_LIMITS.bytes) throw Object.assign(new Error("CSV file must be between 1 byte and 2 MiB"), { statusCode: 413 });
  if (file.buffer.includes(0)) throw Object.assign(new Error("CSV contains binary content"), { statusCode: 415 });
  return name;
}

export function neutralizeSpreadsheetFormula(value) {
  const text = String(value ?? "").trim();
  return FORMULA_PREFIX.test(text) ? `'${text}` : text;
}

export function parseInventoryCsv(file) {
  const filename = validateCsvFileMetadata(file);
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(file.buffer).replace(/^\uFEFF/u, "");
  } catch {
    throw Object.assign(new Error("CSV must use valid UTF-8 encoding"), { statusCode: 415 });
  }

  let records;
  try {
    records = parse(text, { columns: (headers) => {
      const normalized = headers.map((header) => String(header).trim().toLowerCase());
      if (new Set(normalized).size !== normalized.length) throw new Error("CSV headers must be unique");
      if (normalized.some((header) => !ALLOWED_HEADERS.has(header))) throw new Error("CSV contains unsupported headers");
      if (REQUIRED_HEADERS.some((header) => !normalized.includes(header))) throw new Error("CSV requires title and price headers");
      return normalized;
    }, skip_empty_lines: true, trim: true, bom: true });
  } catch (error) {
    throw Object.assign(new Error(error instanceof Error ? error.message : "Invalid CSV"), { statusCode: 400 });
  }
  if (records.length > CSV_LIMITS.rows) throw Object.assign(new Error(`CSV exceeds ${CSV_LIMITS.rows} data rows`), { statusCode: 413 });

  const errors = [];
  const rows = records.map((record, index) => {
    const line = index + 2;
    const sanitized = {};
    for (const [key, raw] of Object.entries(record)) {
      const value = String(raw ?? "");
      if (value.length > CSV_LIMITS.fieldLength) errors.push({ line, field: key, error: `field exceeds ${CSV_LIMITS.fieldLength} characters` });
      sanitized[key] = neutralizeSpreadsheetFormula(value);
    }
    const price = Number(sanitized.price);
    if (!sanitized.title) errors.push({ line, field: "title", error: "title is required" });
    if (!Number.isFinite(price) || price < 0) errors.push({ line, field: "price", error: "price must be a non-negative number" });
    return { ...sanitized, price };
  });
  if (errors.length) throw Object.assign(new Error("CSV validation failed"), { statusCode: 422, rowErrors: errors });
  return { filename, rows };
}
