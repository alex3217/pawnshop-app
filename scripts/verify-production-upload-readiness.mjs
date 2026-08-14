#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const DEFAULT_TIMEOUT_MS = 5_000;

export function redactUrl(value) {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return "[invalid URL]";
  }
}

function parseUrl(value, { fixture, ready = false }) {
  const url = new URL(value);
  if (url.username || url.password || url.hash) throw new Error(`Unsafe URL: ${redactUrl(value)}`);
  if (!fixture && url.protocol !== "https:") throw new Error(`HTTPS is required: ${redactUrl(value)}`);
  if (fixture && !new Set(["http:", "https:"]).has(url.protocol)) throw new Error(`Unsafe URL: ${redactUrl(value)}`);
  if (ready && !url.pathname.endsWith("/api/ready")) throw new Error(`Readiness URL must end in /api/ready: ${redactUrl(value)}`);
  return url;
}

async function boundedFetch(fetchImpl, url, method, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("request timed out")), timeoutMs);
  try {
    return await fetchImpl(url, { method, signal: controller.signal, redirect: "error" });
  } catch (error) {
    throw new Error(`${method} ${redactUrl(url)} failed: ${error?.name === "AbortError" || controller.signal.aborted ? "timeout" : "request error"}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyProductionUploadReadiness({
  readyUrl,
  expectedSha,
  itemImageUrls = [],
  auctionImageUrls = [],
  fixture = false,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!readyUrl) throw new Error("--ready-url is required");
  if (typeof expectedSha !== "string" || !/^[0-9a-f]{40}$/.test(expectedSha)) {
    throw new Error("--expected-sha must be an exact lowercase 40-character Git SHA");
  }
  const ready = parseUrl(readyUrl, { fixture, ready: true });
  const response = await boundedFetch(fetchImpl, ready, "GET", timeoutMs);
  if (!response.ok) throw new Error(`Readiness evidence failed with HTTP ${response.status}: ${redactUrl(ready)}`);
  let body;
  try { body = await response.json(); } catch { throw new Error("Readiness response is not valid JSON"); }
  if (body?.env !== "production") throw new Error("Readiness response does not identify production");
  if (body?.ready !== true || body?.ok !== true) throw new Error("Readiness response is not ready");
  if (typeof body?.revision !== "string" || !/^[0-9a-f]{40}$/.test(body.revision)) {
    throw new Error("Readiness response revision is not an exact lowercase 40-character Git SHA");
  }
  if (body.revision !== expectedSha) throw new Error("Readiness response revision does not match --expected-sha");
  for (const dependency of ["database", "storage", "imageProcessing"]) {
    if (body?.dependencies?.[dependency] !== "ok") throw new Error(`Readiness response lacks ${dependency} evidence`);
  }

  const imageUrls = [
    ...itemImageUrls.map((url) => ["item", url]),
    ...auctionImageUrls.map((url) => ["auction", url]),
  ];
  for (const [kind, value] of imageUrls) {
    const url = parseUrl(value, { fixture });
    const image = await boundedFetch(fetchImpl, url, "HEAD", timeoutMs);
    if (!image.ok) throw new Error(`Public ${kind} image failed with HTTP ${image.status}: ${redactUrl(url)}`);
    const contentType = String(image.headers?.get?.("content-type") || "").toLowerCase();
    if (!contentType.startsWith("image/")) throw new Error(`Public ${kind} URL did not return an image: ${redactUrl(url)}`);
  }
  return { ready: true, checkedImages: imageUrls.length };
}

function parseArgs(argv) {
  const options = { itemImageUrls: [], auctionImageUrls: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--fixture") options.fixture = true;
    else if (arg === "--ready-url") options.readyUrl = argv[++index];
    else if (arg === "--expected-sha") options.expectedSha = argv[++index];
    else if (arg === "--item-image-url") options.itemImageUrls.push(argv[++index]);
    else if (arg === "--auction-image-url") options.auctionImageUrls.push(argv[++index]);
    else if (arg === "--timeout-ms") options.timeoutMs = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(options.timeoutMs ?? DEFAULT_TIMEOUT_MS) || (options.timeoutMs ?? DEFAULT_TIMEOUT_MS) < 1 || (options.timeoutMs ?? DEFAULT_TIMEOUT_MS) > 30_000) {
    throw new Error("--timeout-ms must be an integer from 1 through 30000");
  }
  return options;
}

async function main() {
  try {
    const result = await verifyProductionUploadReadiness(parseArgs(process.argv.slice(2)));
    console.log(`Production upload readiness evidence passed; checked ${result.checkedImages} public image URL(s).`);
    console.log("One successful request does not prove survival across redeploys or beyond a signed-URL TTL.");
  } catch (error) {
    console.error(`Production upload readiness evidence failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) await main();
