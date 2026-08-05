import assert from "node:assert/strict";
import test from "node:test";
import { PREVIEW_ORIGIN, PRODUCTION_ORIGIN, STAGING_ORIGIN, runPreviewCorsSmoke } from "./check-preview-cors-smoke.mjs";

function response(status, headers = {}) {
  return new Response(null, { status, headers });
}

function mockedFetch(overrides = {}) {
  return async (url, init = {}) => {
    const key = url === `${STAGING_ORIGIN}/api/health` ? "stagingHealth"
      : url === `${PRODUCTION_ORIGIN}/api/health` ? "productionHealth"
        : url === `${STAGING_ORIGIN}/api/auth/login` && init.method === "OPTIONS" ? "stagingPreflight"
          : url === `${PRODUCTION_ORIGIN}/api/auth/login` && init.method === "OPTIONS" ? "productionPreflight"
            : "unexpected";
    const defaults = {
      stagingHealth: response(200),
      productionHealth: response(200),
      stagingPreflight: response(204, { "Access-Control-Allow-Origin": PREVIEW_ORIGIN, "Access-Control-Allow-Credentials": "true" }),
      productionPreflight: response(403),
    };
    const selected = overrides[key] ?? defaults[key];
    if (selected instanceof Error) throw selected;
    if (!selected) throw new Error(`Unexpected request: ${url}`);
    return selected;
  };
}

test("healthy staging accepts and healthy Production deliberately rejects", async () => {
  assert.deepEqual(await runPreviewCorsSmoke(mockedFetch()), { stagingStatus: 204, productionStatus: 403 });
});

for (const [name, overrides, pattern] of [
  ["staging 200 instead of 204", { stagingPreflight: response(200) }, /expected HTTP 204/],
  ["wrong staging ACAO", { stagingPreflight: response(204, { "Access-Control-Allow-Origin": "https://wrong.example", "Access-Control-Allow-Credentials": "true" }) }, /echo/],
  ["missing credential header", { stagingPreflight: response(204, { "Access-Control-Allow-Origin": PREVIEW_ORIGIN }) }, /credentialed/],
  ["Production 200 without ACAO", { productionPreflight: response(200) }, /expected deliberate HTTP 403/],
  ["Production 500", { productionPreflight: response(500) }, /received 500/],
  ["Production 503", { productionPreflight: response(503) }, /received 503/],
  ["Production network timeout", { productionPreflight: new Error("timeout") }, /before an HTTP response/],
  ["Production accepts Preview origin", { productionPreflight: response(403, { "Access-Control-Allow-Origin": PREVIEW_ORIGIN }) }, /unexpectedly accepted/],
  ["unhealthy staging health", { stagingHealth: response(503) }, /Staging health expected HTTP 200/],
  ["unhealthy Production health", { productionHealth: response(503) }, /Production health expected HTTP 200/],
]) test(name, async () => assert.rejects(runPreviewCorsSmoke(mockedFetch(overrides)), pattern));
