import assert from "node:assert/strict";
import test from "node:test";
import { redactUrl, verifyProductionUploadReadiness } from "./verify-production-upload-readiness.mjs";
import { isUnsafePublicDestinationHostname } from "../apps/api/backend/src/config/publicNetworkAddress.js";

const sha = "0123456789abcdef0123456789abcdef01234567";
const now = Date.parse("2026-08-16T12:00:00.000Z");
const origins = {
  apiOrigin: "https://api.pawnloop.com",
  frontendOrigin: "https://pawnloop.com",
  storageOrigin: "https://images.pawnloop.com",
};
const ready = {
  env: "production", ready: true, ok: true, revision: sha,
  ts: new Date(now).toISOString(),
  dependencies: { database: "ok", storage: "ok", imageProcessing: "ok" },
};
const release = { revision: sha, generatedAt: new Date(now).toISOString() };

function json(body, init = {}) {
  const bytes = Buffer.from(JSON.stringify(body));
  return new Response(bytes, { status: 200, headers: { "content-type": "application/json", "content-length": String(bytes.length) }, ...init });
}

function fetcher({ readyBody = ready, releaseBody = release, readyResponse, releaseResponse, imageResponse } = {}) {
  return async (url, init) => {
    assert.equal(init.redirect, "manual");
    assert.ok(init.signal instanceof AbortSignal);
    if (url.pathname === "/api/ready") return readyResponse || json(readyBody);
    if (url.pathname === "/release.json") return releaseResponse || json(releaseBody);
    if (url.pathname.startsWith("/uploads/")) return imageResponse || new Response(null, { status: 200, headers: { "content-type": "image/webp" } });
    throw new Error("unexpected request");
  };
}

function options(overrides = {}) {
  return { ...origins, expectedSha: sha, now, fetchImpl: fetcher(), ...overrides };
}

test("credential-free evidence binds API, frontend, storage, SHA and GET/HEAD methods", async () => {
  const methods = [];
  const result = await verifyProductionUploadReadiness(options({
    itemImageUrls: ["https://images.pawnloop.com/uploads/item.webp"],
    auctionImageUrls: ["https://images.pawnloop.com/uploads/auction.jpg"],
    fetchImpl: async (url, init) => { methods.push([url.pathname, init.method]); return fetcher()(url, init); },
  }));
  assert.deepEqual(result, { ready: true, checkedImages: 2, revision: sha });
  assert.deepEqual(methods, [["/api/ready", "GET"], ["/release.json", "GET"], ["/uploads/item.webp", "HEAD"], ["/uploads/auction.jpg", "HEAD"]]);
});

test("exact lowercase expected SHA is required", async () => {
  for (const expectedSha of [undefined, "main", sha.toUpperCase(), `${sha}0`]) {
    await assert.rejects(verifyProductionUploadReadiness(options({ expectedSha })), /exact lowercase 40-character/);
  }
});

test("API and frontend revisions must both match", async () => {
  const other = "abcdef0123456789abcdef0123456789abcdef01";
  await assert.rejects(verifyProductionUploadReadiness(options({ fetchImpl: fetcher({ readyBody: { ...ready, revision: other } }) })), /Readiness revision/);
  await assert.rejects(verifyProductionUploadReadiness(options({ fetchImpl: fetcher({ releaseBody: { ...release, revision: other } }) })), /Frontend revision/);
});

test("readiness requires all dependency evidence", async () => {
  await assert.rejects(verifyProductionUploadReadiness(options({ fetchImpl: fetcher({ readyBody: { ...ready, dependencies: { ...ready.dependencies, storage: "unavailable" } } }) })), /storage evidence/);
});

test("stale, future and malformed timestamps are rejected", async () => {
  for (const ts of ["invalid", new Date(now - 86_400_001).toISOString(), new Date(now + 300_001).toISOString()]) {
    await assert.rejects(verifyProductionUploadReadiness(options({ fetchImpl: fetcher({ readyBody: { ...ready, ts } }) })), /timestamp/);
    await assert.rejects(verifyProductionUploadReadiness(options({ fetchImpl: fetcher({ releaseBody: { ...release, generatedAt: ts } }) })), /timestamp/);
  }
});

test("private, reserved, credentialed and noncanonical origins are rejected", async () => {
  for (const apiOrigin of ["http://api.pawnloop.com", "https://127.0.0.1", "https://10.0.0.1", "https://169.254.1.1", "https://user:secret@api.pawnloop.com", "https://api.pawnloop.com:8443", "https://api.pawnloop.com/path", "https://api.pawnloop.com?token=secret", "https://api.pawnloop.com#fragment", "not a URL"]) {
    await assert.rejects(verifyProductionUploadReadiness(options({ apiOrigin })), /origin|malformed/);
  }
});

const unsafeIpv4Destinations = [
  "0.0.0.1", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.1.1",
  "172.16.0.1", "192.0.0.1", "192.0.2.1", "192.168.1.1", "198.18.0.1",
  "198.51.100.1", "203.0.113.1", "224.0.0.1", "240.0.0.1", "255.255.255.255",
];
const unsafeIpv6Destinations = [
  "::", "::1", "::ffff:127.0.0.1", "64:ff9b:1::1", "100::1", "2001:db8::1",
  "2002::1", "3fff::1", "5f00::1", "fc00::1", "fe80::1", "ff02::1",
];
const publicDestinations = [
  "1.1.1.1", "8.8.8.8", "93.184.216.34", "2606:4700:4700::1111", "2001:4860:4860::8888",
];

test("offline verifier rejects every reserved literal before invoking fetch", async () => {
  for (const address of [...unsafeIpv4Destinations, ...unsafeIpv6Destinations]) {
    let fetchCalls = 0;
    const origin = address.includes(":") ? `https://[${address}]` : `https://${address}`;
    await assert.rejects(
      verifyProductionUploadReadiness(options({ apiOrigin: origin, fetchImpl: async () => { fetchCalls += 1; throw new Error("must not fetch"); } })),
      /canonical public HTTPS origin/,
      address,
    );
    assert.equal(fetchCalls, 0, address);
  }
});

test("offline verifier accepts ordinary public literal origins", async () => {
  for (const address of publicDestinations) {
    assert.equal(isUnsafePublicDestinationHostname(address), false, address);
    const origin = address.includes(":") ? `https://[${address}]` : `https://${address}`;
    const result = await verifyProductionUploadReadiness(options({ apiOrigin: origin }));
    assert.equal(result.ready, true, address);
  }
});

test("fixture mode preserves isolated private-origin verification", async () => {
  const result = await verifyProductionUploadReadiness(options({
    apiOrigin: "http://127.0.0.1:6101",
    frontendOrigin: "http://127.0.0.1:6102",
    storageOrigin: "http://127.0.0.1:6103",
    fixture: true,
  }));
  assert.equal(result.ready, true);
});

test("origins must be distinct", async () => {
  await assert.rejects(verifyProductionUploadReadiness(options({ frontendOrigin: origins.apiOrigin })), /must be distinct/);
});

test("image evidence is restricted to canonical managed storage keys", async () => {
  for (const value of ["https://other.pawnloop.com/uploads/a.webp", "https://images.pawnloop.com/private/a.webp", "https://images.pawnloop.com/uploads/../private.webp", "https://images.pawnloop.com/uploads/a.webp?signature=secret"]) {
    await assert.rejects(verifyProductionUploadReadiness(options({ itemImageUrls: [value] })), /managed durable delivery/);
  }
});

test("redirects are rejected", async () => {
  await assert.rejects(verifyProductionUploadReadiness(options({ readyResponse: new Response(null, { status: 302, headers: { location: "https://other.invalid" } }), fetchImpl: fetcher({ readyResponse: new Response(null, { status: 302 }) }) })), /request error/);
});

test("declared and actual oversized JSON responses are rejected", async () => {
  const declared = new Response("{}", { status: 200, headers: { "content-length": "65537" } });
  await assert.rejects(verifyProductionUploadReadiness(options({ fetchImpl: fetcher({ readyResponse: declared }) })), /oversized/);
  const actual = new Response(JSON.stringify({ ...ready, padding: "x".repeat(70_000) }), { status: 200 });
  await assert.rejects(verifyProductionUploadReadiness(options({ fetchImpl: fetcher({ readyResponse: actual }) })), /oversized/);
});

test("timeouts and malformed URLs are redacted", async () => {
  const secret = "must-not-appear";
  await assert.rejects(verifyProductionUploadReadiness(options({ apiOrigin: `https://user:${secret}@api.pawnloop.com` })), (error) => !error.message.includes(secret));
  await assert.rejects(verifyProductionUploadReadiness(options({ timeoutMs: 1, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })) })), /timeout/);
});

test("redaction removes credentials, queries and fragments", () => {
  assert.equal(redactUrl("https://user:secret@example.com/path?token=secret#secret"), "https://example.com/path");
  assert.equal(redactUrl("not a URL secret"), "[invalid URL]");
});

test("origin failures never expose credential or query values", async () => {
  for (const [apiOrigin, secret] of [
    ["https://user:credential-secret@198.51.100.1", "credential-secret"],
    ["https://203.0.113.1?token=query-secret", "query-secret"],
  ]) {
    await assert.rejects(verifyProductionUploadReadiness(options({ apiOrigin })), (error) => {
      assert.equal(error.message.includes(secret), false);
      return true;
    });
  }
});
