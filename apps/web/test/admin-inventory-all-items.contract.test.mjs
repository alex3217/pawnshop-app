import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adminApi = readFileSync(
  new URL("../src/admin/services/adminApi.ts", import.meta.url),
  "utf8",
);

test("admin inventory list requests deleted items with all=true", () => {
  const getItems = adminApi.match(
    /getItems:\s*async[\s\S]*?return normalizeList\(payload\);\s*\n\s*},/,
  )?.[0];

  assert.ok(getItems, "getItems implementation must exist");
  assert.match(
    getItems,
    /adminRequest<PagedListResponse<AdminItemRow>>\(\s*"\/admin\/items\?all=true"/,
  );
});
