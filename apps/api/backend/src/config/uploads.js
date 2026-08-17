import { isUnsafePublicDestinationHostname } from "./publicNetworkAddress.js";

const DEFAULTS = Object.freeze({
  maxFileBytes: 10 * 1024 * 1024,
  maxFiles: 10,
  maxAggregateBytes: 50 * 1024 * 1024,
  maxWidth: 12_000,
  maxHeight: 12_000,
  maxPixels: 40_000_000,
  rateLimitWindowMs: 60_000,
  rateLimitUserMax: 20,
  rateLimitIpMax: 60,
  maxConcurrent: 1,
  storageTimeoutMs: 10_000,
});

const HARD_MAXIMUMS = Object.freeze({
  maxFileBytes: 10 * 1024 * 1024,
  maxFiles: 10,
  maxAggregateBytes: 50 * 1024 * 1024,
  maxWidth: 12_000,
  maxHeight: 12_000,
  maxPixels: 40_000_000,
  rateLimitWindowMs: 15 * 60_000,
  rateLimitUserMax: 300,
  rateLimitIpMax: 600,
  maxConcurrent: 4,
  storageTimeoutMs: 30_000,
});

function positiveInteger(env, name, fallback, hardMaximum) {
  const raw = String(env[name] ?? "").trim();
  if (!raw) return fallback;
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
    throw new Error(`${name} must be a positive integer`);
  }
  const value = Number(raw);
  if (value > hardMaximum) throw new Error(`${name} exceeds the immutable safety ceiling`);
  return value;
}

function required(env, name) {
  const value = String(env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required when durable uploads are enabled`);
  return value;
}

function canonicalStorageUrl(value, name) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${name} must be a canonical public HTTPS origin`); }
  if (
    url.protocol !== "https:" || url.username || url.password || url.port ||
    url.pathname !== "/" || url.search || url.hash || value !== url.origin ||
    isUnsafePublicDestinationHostname(url.hostname)
  ) throw new Error(`${name} must be a canonical public HTTPS origin`);
  return url.origin;
}

export function loadUploadLimits(env = process.env) {
  const limits = {
    maxFileBytes: positiveInteger(env, "UPLOAD_MAX_FILE_BYTES", DEFAULTS.maxFileBytes, HARD_MAXIMUMS.maxFileBytes),
    maxFiles: positiveInteger(env, "UPLOAD_MAX_FILES", DEFAULTS.maxFiles, HARD_MAXIMUMS.maxFiles),
    maxAggregateBytes: positiveInteger(env, "UPLOAD_MAX_AGGREGATE_BYTES", DEFAULTS.maxAggregateBytes, HARD_MAXIMUMS.maxAggregateBytes),
    maxWidth: positiveInteger(env, "UPLOAD_MAX_WIDTH", DEFAULTS.maxWidth, HARD_MAXIMUMS.maxWidth),
    maxHeight: positiveInteger(env, "UPLOAD_MAX_HEIGHT", DEFAULTS.maxHeight, HARD_MAXIMUMS.maxHeight),
    maxPixels: positiveInteger(env, "UPLOAD_MAX_PIXELS", DEFAULTS.maxPixels, HARD_MAXIMUMS.maxPixels),
    rateLimitWindowMs: positiveInteger(env, "UPLOAD_RATE_LIMIT_WINDOW_MS", DEFAULTS.rateLimitWindowMs, HARD_MAXIMUMS.rateLimitWindowMs),
    rateLimitUserMax: positiveInteger(env, "UPLOAD_RATE_LIMIT_USER_MAX", DEFAULTS.rateLimitUserMax, HARD_MAXIMUMS.rateLimitUserMax),
    rateLimitIpMax: positiveInteger(env, "UPLOAD_RATE_LIMIT_IP_MAX", DEFAULTS.rateLimitIpMax, HARD_MAXIMUMS.rateLimitIpMax),
    maxConcurrent: positiveInteger(env, "UPLOAD_MAX_CONCURRENT", DEFAULTS.maxConcurrent, HARD_MAXIMUMS.maxConcurrent),
    storageTimeoutMs: positiveInteger(env, "UPLOAD_STORAGE_TIMEOUT_MS", DEFAULTS.storageTimeoutMs, HARD_MAXIMUMS.storageTimeoutMs),
  };
  if (limits.maxAggregateBytes < limits.maxFileBytes) {
    throw new Error("UPLOAD_MAX_AGGREGATE_BYTES must be at least UPLOAD_MAX_FILE_BYTES");
  }
  if (limits.maxPixels > limits.maxWidth * limits.maxHeight) {
    throw new Error("UPLOAD_MAX_PIXELS cannot exceed UPLOAD_MAX_WIDTH multiplied by UPLOAD_MAX_HEIGHT");
  }
  return Object.freeze(limits);
}

export function loadDurableUploadConfig(env = process.env) {
  const rawEnabled = String(env.DURABLE_UPLOADS_ENABLED ?? "false").trim();
  if (rawEnabled !== "true" && rawEnabled !== "false") {
    throw new Error("DURABLE_UPLOADS_ENABLED must be exactly true or false");
  }
  const enabled = rawEnabled === "true";
  if (!enabled) return Object.freeze({ enabled: false, limits: loadUploadLimits(env) });

  const publicBaseUrl = canonicalStorageUrl(required(env, "UPLOAD_STORAGE_PUBLIC_BASE_URL"), "UPLOAD_STORAGE_PUBLIC_BASE_URL");
  const endpoint = canonicalStorageUrl(required(env, "UPLOAD_STORAGE_ENDPOINT"), "UPLOAD_STORAGE_ENDPOINT");
  const rawForcePathStyle = String(env.UPLOAD_STORAGE_FORCE_PATH_STYLE ?? "false").trim();
  if (rawForcePathStyle !== "true" && rawForcePathStyle !== "false") {
    throw new Error("UPLOAD_STORAGE_FORCE_PATH_STYLE must be exactly true or false");
  }

  return Object.freeze({
    enabled: true,
    endpoint,
    region: required(env, "UPLOAD_STORAGE_REGION"),
    bucket: required(env, "UPLOAD_STORAGE_BUCKET"),
    accessKeyId: required(env, "UPLOAD_STORAGE_ACCESS_KEY_ID"),
    secretAccessKey: required(env, "UPLOAD_STORAGE_SECRET_ACCESS_KEY"),
    publicBaseUrl,
    forcePathStyle: rawForcePathStyle === "true",
    limits: loadUploadLimits(env),
  });
}

export { DEFAULTS as DEFAULT_UPLOAD_LIMITS, HARD_MAXIMUMS as HARD_UPLOAD_LIMITS };
