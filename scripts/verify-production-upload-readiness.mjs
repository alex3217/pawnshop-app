#!/usr/bin/env node

import { isIP } from "node:net";
import { pathToFileURL } from "node:url";

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1_000;
const MAX_BODY_BYTES = 64 * 1024;
const SHA = /^[0-9a-f]{40}$/;
const MANAGED_IMAGE_PATH = /^\/uploads\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:jpg|png|webp)$/;

export function redactUrl(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}${url.pathname}`;
  } catch {
    return "[invalid URL]";
  }
}

function unsafeHostname(value) {
  const hostname = String(value || "").toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) return true;
  if (isIP(hostname) === 4) {
    const [a, b] = hostname.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 0) ||
      (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19));
  }
  if (isIP(hostname) === 6) return hostname === "::" || hostname === "::1" || /^f[cd]/.test(hostname) || /^fe[89ab]/.test(hostname) || /^::ffff:/.test(hostname);
  return false;
}

function parseOrigin(value, label, fixture) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${label} is malformed: [invalid URL]`); }
  const allowedProtocol = fixture ? new Set(["http:", "https:"]) : new Set(["https:"]);
  if (!allowedProtocol.has(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash || value !== url.origin || (!fixture && unsafeHostname(url.hostname))) {
    throw new Error(`${label} must be a canonical public ${fixture ? "HTTP(S)" : "HTTPS"} origin: ${redactUrl(value)}`);
  }
  return url.origin;
}

function parseImageUrl(value, storageOrigin, fixture) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`Image URL is malformed: [invalid URL]`); }
  if ((!fixture && unsafeHostname(url.hostname)) || url.origin !== storageOrigin || url.username || url.password || url.search || url.hash || !MANAGED_IMAGE_PATH.test(url.pathname)) {
    throw new Error(`Image URL is outside the managed durable delivery origin or prefix: ${redactUrl(value)}`);
  }
  return url;
}

async function boundedFetch(fetchImpl, url, method, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("request timed out")), timeoutMs);
  try {
    const response = await fetchImpl(url, { method, signal: controller.signal, redirect: "manual" });
    if (response.status >= 300 && response.status < 400) throw new Error("redirect rejected");
    return response;
  } catch (error) {
    const reason = error?.name === "AbortError" || controller.signal.aborted ? "timeout" : "request error";
    throw new Error(`${method} ${redactUrl(url)} failed: ${reason}`);
  } finally {
    clearTimeout(timer);
  }
}

async function boundedJson(response, label) {
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new Error(`${label} response is oversized`);
  let bytes;
  try { bytes = new Uint8Array(await response.arrayBuffer()); } catch { throw new Error(`${label} response could not be read`); }
  if (bytes.length > MAX_BODY_BYTES) throw new Error(`${label} response is oversized`);
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error(`${label} response is not valid JSON`); }
}

function requireFreshTimestamp(value, now, maxAgeMs, label) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp) || timestamp > now + 5 * 60_000 || now - timestamp > maxAgeMs) {
    throw new Error(`${label} timestamp is malformed, future-dated, or stale`);
  }
}

export async function verifyProductionUploadReadiness({
  apiOrigin,
  frontendOrigin,
  storageOrigin,
  expectedSha,
  itemImageUrls = [],
  auctionImageUrls = [],
  fixture = false,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  now = Date.now(),
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!SHA.test(String(expectedSha || ""))) throw new Error("--expected-sha must be an exact lowercase 40-character Git SHA");
  const api = parseOrigin(apiOrigin, "API origin", fixture);
  const frontend = parseOrigin(frontendOrigin, "Frontend origin", fixture);
  const storage = parseOrigin(storageOrigin, "Storage origin", fixture);
  if (new Set([api, frontend, storage]).size !== 3) throw new Error("API, frontend, and storage origins must be distinct");

  const readyUrl = new URL("/api/ready", api);
  const releaseUrl = new URL("/release.json", frontend);
  const [readyResponse, releaseResponse] = await Promise.all([
    boundedFetch(fetchImpl, readyUrl, "GET", timeoutMs),
    boundedFetch(fetchImpl, releaseUrl, "GET", timeoutMs),
  ]);
  if (!readyResponse.ok) throw new Error(`Readiness evidence failed with HTTP ${readyResponse.status}: ${redactUrl(readyUrl)}`);
  if (!releaseResponse.ok) throw new Error(`Frontend release evidence failed with HTTP ${releaseResponse.status}: ${redactUrl(releaseUrl)}`);
  const [readyBody, releaseBody] = await Promise.all([
    boundedJson(readyResponse, "Readiness"),
    boundedJson(releaseResponse, "Frontend release"),
  ]);
  if (readyBody?.env !== "production" || readyBody?.ready !== true || readyBody?.ok !== true) throw new Error("Readiness response does not identify a ready production service");
  if (!SHA.test(String(readyBody?.revision || "")) || readyBody.revision !== expectedSha) throw new Error("Readiness revision does not match --expected-sha");
  if (!SHA.test(String(releaseBody?.revision || "")) || releaseBody.revision !== expectedSha) throw new Error("Frontend revision does not match --expected-sha");
  requireFreshTimestamp(readyBody.ts, now, maxAgeMs, "Readiness");
  requireFreshTimestamp(releaseBody.generatedAt, now, maxAgeMs, "Frontend release");
  for (const dependency of ["database", "storage", "imageProcessing"]) {
    if (readyBody?.dependencies?.[dependency] !== "ok") throw new Error(`Readiness response lacks ${dependency} evidence`);
  }

  const imageUrls = [...itemImageUrls.map((url) => ["item", url]), ...auctionImageUrls.map((url) => ["auction", url])];
  for (const [kind, value] of imageUrls) {
    const url = parseImageUrl(value, storage, fixture);
    const image = await boundedFetch(fetchImpl, url, "HEAD", timeoutMs);
    if (!image.ok) throw new Error(`Public ${kind} image failed with HTTP ${image.status}: ${redactUrl(url)}`);
    const contentType = String(image.headers?.get?.("content-type") || "").toLowerCase();
    if (!contentType.startsWith("image/")) throw new Error(`Public ${kind} URL did not return an image: ${redactUrl(url)}`);
  }
  return { ready: true, checkedImages: imageUrls.length, revision: expectedSha };
}

function parseArgs(argv) {
  const options = { itemImageUrls: [], auctionImageUrls: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--fixture") options.fixture = true;
    else if (arg === "--api-origin") options.apiOrigin = argv[++index];
    else if (arg === "--frontend-origin") options.frontendOrigin = argv[++index];
    else if (arg === "--storage-origin") options.storageOrigin = argv[++index];
    else if (arg === "--expected-sha") options.expectedSha = argv[++index];
    else if (arg === "--item-image-url") options.itemImageUrls.push(argv[++index]);
    else if (arg === "--auction-image-url") options.auctionImageUrls.push(argv[++index]);
    else if (arg === "--timeout-ms") options.timeoutMs = Number(argv[++index]);
    else if (arg === "--max-age-ms") options.maxAgeMs = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  for (const [name, value, maximum] of [["--timeout-ms", options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 30_000], ["--max-age-ms", options.maxAgeMs ?? DEFAULT_MAX_AGE_MS, 7 * 24 * 60 * 60 * 1_000]]) {
    if (!Number.isInteger(value) || value < 1 || value > maximum) throw new Error(`${name} is outside its bounded range`);
  }
  return options;
}

async function main() {
  try {
    const result = await verifyProductionUploadReadiness(parseArgs(process.argv.slice(2)));
    console.log(`Production upload readiness evidence passed for ${result.revision}; checked ${result.checkedImages} public image URL(s).`);
  } catch (error) {
    console.error(`Production upload readiness evidence failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) await main();
