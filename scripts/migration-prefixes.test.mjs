import assert from "node:assert/strict";
import test from "node:test";
import { duplicatePrefixes } from "./audit-migration-prefixes.mjs";

test("detects duplicate fourteen-digit migration prefixes", () => {
  assert.deepEqual(duplicatePrefixes(["20260101000000_one", "20260101000000_two", "20260102000000_three"]), [
    ["20260101000000", ["20260101000000_one", "20260101000000_two"]],
  ]);
});
