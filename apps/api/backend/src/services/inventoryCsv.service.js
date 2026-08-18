import { parse } from "csv-parse/sync";
import {
  INVENTORY_IMPORT_COLUMNS,
  INVENTORY_IMPORT_LIMITS,
  INVENTORY_IMPORT_REQUIRED_COLUMNS,
} from "../config/inventoryImport.js";

export class InventoryCsvError extends Error {
  constructor(message) {
    super(message);
    this.name = "InventoryCsvError";
    this.statusCode = 400;
  }
}

function byteLength(value) {
  return Buffer.byteLength(String(value ?? ""), "utf8");
}

export function parseInventoryCsv(buffer, limits = INVENTORY_IMPORT_LIMITS) {
  if (!Buffer.isBuffer(buffer)) throw new InventoryCsvError("CSV file is required");
  if (buffer.length > limits.maxFileBytes) throw new InventoryCsvError("CSV file exceeds the size limit");
  if (buffer.includes(0)) throw new InventoryCsvError("CSV file must be plain text");

  let headers;
  let rows;
  try {
    rows = parse(buffer, {
      bom: true,
      columns(nextHeaders) {
        headers = nextHeaders.map((header) => String(header).trim().toLowerCase());
        if (!headers.length || headers.length > limits.maxColumns) {
          throw new InventoryCsvError(`CSV must contain between 1 and ${limits.maxColumns} columns`);
        }
        if (new Set(headers).size !== headers.length) throw new InventoryCsvError("CSV contains duplicate columns");
        const unsupported = headers.filter((header) => !INVENTORY_IMPORT_COLUMNS.includes(header));
        if (unsupported.length) throw new InventoryCsvError("CSV contains unsupported columns");
        const missing = INVENTORY_IMPORT_REQUIRED_COLUMNS.filter((header) => !headers.includes(header));
        if (missing.length) throw new InventoryCsvError("CSV must contain title and price columns");
        return headers;
      },
      skip_empty_lines: true,
      trim: true,
      max_record_size: limits.maxRecordBytes,
      relax_column_count: false,
      on_record(record, context) {
        if (context.records > limits.maxRows) throw new InventoryCsvError(`CSV exceeds the ${limits.maxRows} row limit`);
        for (const value of Object.values(record)) {
          if (byteLength(value) > limits.maxFieldBytes) {
            throw new InventoryCsvError(`CSV field exceeds the ${limits.maxFieldBytes} byte limit`);
          }
        }
        return record;
      },
    });
  } catch (error) {
    if (error instanceof InventoryCsvError) throw error;
    throw new InventoryCsvError("CSV is malformed or exceeds structural limits");
  }

  if (!headers) throw new InventoryCsvError("CSV header row is required");
  if (!rows.length) throw new InventoryCsvError("CSV must contain at least one data row");
  return rows;
}
