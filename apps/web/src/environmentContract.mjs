export const PRODUCTION_API_ORIGIN = "https://api.pawnloop.com";
export const STAGING_API_ORIGIN = "https://pawnshop-staging-api.onrender.com";

const DEPLOYED_ENVIRONMENTS = new Set(["preview", "staging", "production"]);

function normalizeOrigin(name, value) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error(`${name} is required for deployed builds.`);

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${name} must be a valid HTTPS origin.`);
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`${name} must be a credential-free HTTPS origin with no path, query, or fragment.`);
  }

  return parsed.origin;
}

function normalizePath(name, value, fallback) {
  const raw = String(value || fallback).trim();
  if (
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.includes("\\") ||
    /%(?:2f|5c)/i.test(raw) ||
    raw.includes("?") ||
    raw.includes("#")
  ) {
    throw new Error(`${name} must be an absolute path beginning with one slash.`);
  }
  return raw;
}

function resolveApiPath(input) {
  const primary = String(input.apiPath || "").trim();
  const compatibility = String(input.apiPathAlias || "").trim();

  if (primary && compatibility && primary !== compatibility) {
    throw new Error("apiPath and apiPathAlias must match when both are supplied.");
  }

  const apiPath = normalizePath("apiPath", primary || compatibility, "/api");
  if (apiPath !== "/api") {
    throw new Error("apiPath must equal the repository API path /api.");
  }
  return apiPath;
}

function resolveSocketPath(input, { required = true } = {}) {
  const raw = String(input.socketPath || "").trim();
  if (!raw && required) {
    throw new Error("socketPath is required for deployed builds.");
  }

  const socketPath = normalizePath("socketPath", raw, "/socket.io");
  if (socketPath !== "/socket.io") {
    throw new Error("socketPath must equal the repository Socket.IO path /socket.io.");
  }
  return socketPath;
}

export function resolveEnvironmentContract(input, options = {}) {
  const isDev = options.isDev === true;
  const deployEnv = String(input.deployEnv || "").trim().toLowerCase();

  if (isDev) {
    if (deployEnv && deployEnv !== "development") {
      throw new Error("deployEnv must be development when running the Vite development server.");
    }
    return {
      deployEnv: "development",
      apiBase: "/api",
      apiOrigin: "",
      socketUrl: options.browserOrigin || "http://127.0.0.1:5176",
      socketPath: resolveSocketPath(input, { required: false }),
      showEnvironmentIndicator: false,
    };
  }

  if (!DEPLOYED_ENVIRONMENTS.has(deployEnv)) {
    throw new Error("deployEnv must be preview, staging, or production for deployed builds.");
  }

  const apiOrigin = normalizeOrigin("apiOrigin", input.apiOrigin);
  const socketUrl = normalizeOrigin("socketUrl", input.socketUrl);
  const expectedOrigin = deployEnv === "production" ? PRODUCTION_API_ORIGIN : STAGING_API_ORIGIN;

  if (apiOrigin !== expectedOrigin) {
    throw new Error(`${deployEnv} builds must use ${expectedOrigin} as apiOrigin.`);
  }
  if (socketUrl !== expectedOrigin) {
    throw new Error(`${deployEnv} builds must use ${expectedOrigin} as socketUrl.`);
  }

  const apiPath = resolveApiPath(input);
  const socketPath = resolveSocketPath(input);

  return {
    deployEnv,
    apiBase: `${apiOrigin}${apiPath}`,
    apiOrigin,
    socketUrl,
    socketPath,
    showEnvironmentIndicator: deployEnv !== "production",
  };
}
