import assert from "node:assert/strict";
import test from "node:test";
import { redactUrl, verifyProductionUploadReadiness } from "./verify-production-upload-readiness.mjs";

const readyUrl = "https://api.example.test/api/ready";
const readyBody = {
  ok: true,
  ready: true,
  env: "production",
  dependencies: { database: "ok", storage: "ok", imageProcessing: "ok" },
};

function response({ status = 200, body = readyBody, type = "application/json" } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name.toLowerCase() === "content-type" ? type : null },
    async json() { return body; },
  };
}

test("offline success checks readiness plus optional item and auction images with GET/HEAD only", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), ...options });
    return options.method === "GET" ? response() : response({ type: "image/webp" });
  };
  const result = await verifyProductionUploadReadiness({
    readyUrl,
    itemImageUrls: ["https://images.example.test/uploads/item.webp"],
    auctionImageUrls: ["https://images.example.test/uploads/auction.webp"],
    fetchImpl,
  });
  assert.deepEqual(result, { ready: true, checkedImages: 2 });
  assert.deepEqual(calls.map(({ method }) => method), ["GET", "HEAD", "HEAD"]);
  assert.equal(calls.every(({ redirect }) => redirect === "error"), true);
});

test("missing dependency evidence exits the verification path", async () => {
  await assert.rejects(
    verifyProductionUploadReadiness({ readyUrl, fetchImpl: async () => response({ body: { ...readyBody, dependencies: { database: "ok", storage: "missing", imageProcessing: "ok" } } }) }),
    /storage evidence/,
  );
});

test("not-ready response fails even at HTTP 200", async () => {
  await assert.rejects(
    verifyProductionUploadReadiness({ readyUrl, fetchImpl: async () => response({ body: { ...readyBody, ready: false } }) }),
    /not ready/,
  );
});

test("bounded timeout is reported without exposing query strings", async () => {
  const fetchImpl = async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  await assert.rejects(
    verifyProductionUploadReadiness({ readyUrl: `${readyUrl}?token=private`, timeoutMs: 5, fetchImpl }),
    (error) => /timeout/.test(error.message) && !/token|private/.test(error.message),
  );
});

test("unsafe URLs and non-HTTPS URLs are rejected outside fixture mode", async () => {
  for (const value of [
    "http://api.example.test/api/ready",
    "https://user:pass@api.example.test/api/ready",
    "file:///api/ready",
  ]) {
    await assert.rejects(verifyProductionUploadReadiness({ readyUrl: value, fetchImpl: async () => response() }), /HTTPS|required|Unsafe/);
  }
});

test("HTTP 404 fails with safely redacted URL", async () => {
  await assert.rejects(
    verifyProductionUploadReadiness({ readyUrl: `${readyUrl}?signature=private`, fetchImpl: async () => response({ status: 404 }) }),
    (error) => /HTTP 404/.test(error.message) && !/signature|private/.test(error.message),
  );
});

test("redirects are disabled and surfaced as a request error", async () => {
  const fetchImpl = async (_url, { redirect }) => {
    assert.equal(redirect, "error");
    throw new TypeError("redirect blocked");
  };
  await assert.rejects(verifyProductionUploadReadiness({ readyUrl, fetchImpl }), /request error/);
});

test("redaction removes query strings, fragments, and credentials", () => {
  const redacted = redactUrl("https://user:pass@images.example.test/a.png?signature=private#fragment");
  assert.equal(redacted, "https://images.example.test/a.png");
  assert.doesNotMatch(redacted, /user|pass|signature|private|fragment/);
});
