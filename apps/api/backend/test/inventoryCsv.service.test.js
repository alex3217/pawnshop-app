import assert from "node:assert/strict";
import test from "node:test";
import { CSV_LIMITS, neutralizeSpreadsheetFormula, parseInventoryCsv, safeCsvFilename } from "../src/services/inventoryCsv.service.js";

const file = (text, overrides = {}) => ({ originalname: "inventory.csv", mimetype: "text/csv", buffer: Buffer.from(text), ...overrides });
test("parses a valid UTF-8 inventory CSV", () => assert.equal(parseInventoryCsv(file("title,price\nCamera,25")).rows.length, 1));
test("rejects unsupported MIME", () => assert.throws(() => parseInventoryCsv(file("title,price\nCamera,25", { mimetype: "text/plain" })), /MIME/));
test("rejects oversized files", () => assert.throws(() => parseInventoryCsv(file("x", { buffer: Buffer.alloc(CSV_LIMITS.bytes + 1) })), /2 MiB/));
test("rejects excessive rows", () => assert.throws(() => parseInventoryCsv(file(`title,price\n${"Camera,25\n".repeat(CSV_LIMITS.rows + 1)}`)), /data rows/));
test("rejects invalid UTF-8 and binary signatures", () => {
  assert.throws(() => parseInventoryCsv(file("x", { buffer: Buffer.from([0xff, 0xfe]) })), /UTF-8/);
  assert.throws(() => parseInventoryCsv(file("x", { buffer: Buffer.from([0, 1]) })), /binary/);
});
test("neutralizes spreadsheet formulas and sanitizes names", () => {
  assert.equal(neutralizeSpreadsheetFormula("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(safeCsvFilename("../../bad name.csv"), "bad_name.csv");
});
test("validates headers and field lengths", () => {
  assert.throws(() => parseInventoryCsv(file("description,currency\nCamera,USD")), /title and price/);
  assert.throws(() => parseInventoryCsv(file(`title,price\n${"x".repeat(CSV_LIMITS.fieldLength + 1)},25`)), /validation failed/);
});
