import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_VITE_API_TARGET,
  resolveViteApiTarget,
} from "../viteProxyTarget.js";

test("defaults to the development API", () => {
  assert.equal(resolveViteApiTarget(), DEFAULT_VITE_API_TARGET);
  assert.equal(DEFAULT_VITE_API_TARGET, "http://127.0.0.1:6002");
});

for (const target of [
  "http://localhost:6002",
  "https://127.0.0.1:6002",
  "http://[::1]:6002",
]) {
  test(`accepts safe loopback target ${target}`, () => {
    assert.equal(resolveViteApiTarget(target), target);
  });
}

for (const [target, pattern] of [
  ["not-a-url", /valid HTTP or HTTPS URL/],
  ["ftp://localhost:6002", /HTTP or HTTPS/],
  ["http://user:password@localhost:6002", /credentials/],
  ["http://localhost:6002?mode=dev", /query string or hash/],
  ["http://localhost:6002#api", /query string or hash/],
  ["http://localhost:6002/api", /pathname must be root/],
  ["http://localhost:6002/other", /pathname must be root/],
  ["http://api.internal:6002", /loopback hostname/],
  ["http://localhost:6001", /port 6002/],
  ["http://localhost:6003", /port 6002/],
  ["http://localhost", /port 6002/],
]) {
  test(`rejects unsafe target ${target}`, () => {
    assert.throws(() => resolveViteApiTarget(target), pattern);
  });
}
