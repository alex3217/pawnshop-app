const DEFAULTS = Object.freeze({
  maxFileBytes: 10 * 1024 * 1024,
  maxFiles: 10,
  maxAggregateBytes: 50 * 1024 * 1024,
  maxWidth: 12_000,
  maxHeight: 12_000,
  maxPixels: 40_000_000,
});

function positiveInteger(env, name, fallback) {
  const raw = String(env[name] ?? "").trim();
  if (!raw) return fallback;
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
    throw new Error(`${name} must be a positive integer`);
  }
  return Number(raw);
}

function required(env, name) {
  const value = String(env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required when durable uploads are enabled`);
  return value;
}

export function loadUploadLimits(env = process.env) {
  const limits = {
    maxFileBytes: positiveInteger(env, "UPLOAD_MAX_FILE_BYTES", DEFAULTS.maxFileBytes),
    maxFiles: positiveInteger(env, "UPLOAD_MAX_FILES", DEFAULTS.maxFiles),
    maxAggregateBytes: positiveInteger(env, "UPLOAD_MAX_AGGREGATE_BYTES", DEFAULTS.maxAggregateBytes),
    maxWidth: positiveInteger(env, "UPLOAD_MAX_WIDTH", DEFAULTS.maxWidth),
    maxHeight: positiveInteger(env, "UPLOAD_MAX_HEIGHT", DEFAULTS.maxHeight),
    maxPixels: positiveInteger(env, "UPLOAD_MAX_PIXELS", DEFAULTS.maxPixels),
  };
  if (limits.maxAggregateBytes < limits.maxFileBytes) {
    throw new Error("UPLOAD_MAX_AGGREGATE_BYTES must be at least UPLOAD_MAX_FILE_BYTES");
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

  const publicBaseUrl = required(env, "UPLOAD_STORAGE_PUBLIC_BASE_URL");
  let parsedPublicUrl;
  try {
    parsedPublicUrl = new URL(publicBaseUrl);
  } catch {
    throw new Error("UPLOAD_STORAGE_PUBLIC_BASE_URL must be a valid URL");
  }
  if (parsedPublicUrl.protocol !== "https:" || parsedPublicUrl.username || parsedPublicUrl.password) {
    throw new Error("UPLOAD_STORAGE_PUBLIC_BASE_URL must be an HTTPS URL without credentials");
  }

  const endpoint = required(env, "UPLOAD_STORAGE_ENDPOINT");
  let parsedEndpoint;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    throw new Error("UPLOAD_STORAGE_ENDPOINT must be a valid URL");
  }
  if (!new Set(["http:", "https:"]).has(parsedEndpoint.protocol) || parsedEndpoint.username || parsedEndpoint.password) {
    throw new Error("UPLOAD_STORAGE_ENDPOINT must be HTTP(S) without embedded credentials");
  }
  const rawForcePathStyle = String(env.UPLOAD_STORAGE_FORCE_PATH_STYLE ?? "false").trim();
  if (rawForcePathStyle !== "true" && rawForcePathStyle !== "false") {
    throw new Error("UPLOAD_STORAGE_FORCE_PATH_STYLE must be exactly true or false");
  }

  return Object.freeze({
    enabled: true,
    endpoint: parsedEndpoint.href.replace(/\/+$/, ""),
    region: required(env, "UPLOAD_STORAGE_REGION"),
    bucket: required(env, "UPLOAD_STORAGE_BUCKET"),
    accessKeyId: required(env, "UPLOAD_STORAGE_ACCESS_KEY_ID"),
    secretAccessKey: required(env, "UPLOAD_STORAGE_SECRET_ACCESS_KEY"),
    publicBaseUrl: parsedPublicUrl.href.replace(/\/+$/, ""),
    forcePathStyle: rawForcePathStyle === "true",
    limits: loadUploadLimits(env),
  });
}

export { DEFAULTS as DEFAULT_UPLOAD_LIMITS };
