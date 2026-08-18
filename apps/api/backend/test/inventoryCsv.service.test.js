import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { INVENTORY_IMPORT_LIMITS } from "../src/config/inventoryImport.js";
import { InventoryCsvError, parseInventoryCsv } from "../src/services/inventoryCsv.service.js";
import { createUploadProtection } from "../src/middleware/uploadProtection.js";

function rejectsCsv(value, pattern) {
  assert.throws(() => parseInventoryCsv(Buffer.from(value)), (error) => {
    assert.ok(error instanceof InventoryCsvError);
    assert.equal(error.statusCode, 400);
    assert.match(error.message, pattern);
    return true;
  });
}

test("accepts the documented inventory columns", () => {
  const rows = parseInventoryCsv(Buffer.from("title,price,status\nCamera,125.50,available\n"));
  assert.deepEqual(rows, [{ title: "Camera", price: "125.50", status: "available" }]);
});

test("rejects missing, duplicate, unsupported, and inconsistent columns", () => {
  rejectsCsv("title,status\nCamera,available\n", /title and price/);
  rejectsCsv("title,price,price\nCamera,1,2\n", /duplicate columns/);
  rejectsCsv("title,price,private_note\nCamera,1,no\n", /unsupported columns/);
  rejectsCsv("title,price\nCamera,1,extra\n", /malformed|structural/);
});

test("rejects binary-looking and malformed quoted files without echoing input", () => {
  rejectsCsv("title,price\nCamera\0,1\n", /plain text/);
  const marker = "sensitive-fixture-marker";
  assert.throws(() => parseInventoryCsv(Buffer.from(`title,price\n\"${marker},1\n`)), (error) => {
    assert.doesNotMatch(error.message, new RegExp(marker));
    return true;
  });
});

test("enforces file, row, record, field, and column ceilings", () => {
  rejectsCsv(`title,price\n${"x".repeat(INVENTORY_IMPORT_LIMITS.maxFieldBytes + 1)},1\n`, /field exceeds|structural limits/);
  rejectsCsv(`title,price\n${"x".repeat(INVENTORY_IMPORT_LIMITS.maxRecordBytes + 1)},1\n`, /malformed|structural/);
  rejectsCsv(`title,price,a,b,c,d,e,f\nCamera,1,,,,,,\n`, /between 1 and 7 columns/);
  const rows = Array.from({ length: INVENTORY_IMPORT_LIMITS.maxRows + 1 }, (_, index) => `Item ${index},1`).join("\n");
  rejectsCsv(`title,price\n${rows}\n`, /row limit/);
  assert.throws(
    () => parseInventoryCsv(Buffer.alloc(INVENTORY_IMPORT_LIMITS.maxFileBytes + 1, 65)),
    /size limit/,
  );
});

test("production import protection fails closed without its distributed store", async () => {
  const protection = createUploadProtection({ limits: INVENTORY_IMPORT_LIMITS, requireDistributed: true });
  const response = new EventEmitter();
  response.setHeader = () => {};
  response.status = (statusCode) => { response.statusCode = statusCode; return response; };
  response.json = (body) => { response.body = body; return response; };
  await protection.rateLimit({ user: { sub: "fixture-user" }, ip: "127.0.0.1" }, response, () => assert.fail("must fail closed"));
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.error, "Upload protection is temporarily unavailable");
});
