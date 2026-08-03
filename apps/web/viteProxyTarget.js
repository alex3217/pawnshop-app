export const DEFAULT_VITE_API_TARGET = "http://127.0.0.1:6002";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function resolveViteApiTarget(value) {
  const raw = String(value ?? "").trim();
  const candidate = raw || DEFAULT_VITE_API_TARGET;
  let target;

  try {
    target = new URL(candidate);
  } catch {
    throw new Error("VITE_API_TARGET must be a valid HTTP or HTTPS URL.");
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error("VITE_API_TARGET must use HTTP or HTTPS.");
  }
  if (target.username || target.password) {
    throw new Error("VITE_API_TARGET must not contain credentials.");
  }
  if (target.search || target.hash) {
    throw new Error("VITE_API_TARGET must not contain a query string or hash.");
  }
  if (target.pathname !== "/") {
    throw new Error("VITE_API_TARGET pathname must be root (/).");
  }
  if (!LOOPBACK_HOSTS.has(target.hostname.toLowerCase())) {
    throw new Error("VITE_API_TARGET must use a loopback hostname.");
  }
  if (target.port !== "6002") {
    throw new Error("VITE_API_TARGET must use port 6002.");
  }

  return target.origin;
}
