import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(
  new URL("../src/admin/pages/AdminShopsPage.tsx", import.meta.url),
  "utf8",
);

test("Super Admin Shop Management renders one action set", () => {
  assert.equal(page.match(/>Add Shop</g)?.length, 1);
  assert.equal(page.match(/>Export CSV</g)?.length, 1);
  assert.equal(page.match(/\{loading \? "Refreshing\.\.\." : "Refresh"\}/g)?.length, 2); // one action in each mutually exclusive route branch
});
