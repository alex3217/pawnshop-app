const DEFAULT_FRONTEND_ORIGIN = "https://staging.pawnloop-frontend.pages.dev";
const DEFAULT_API_ORIGIN = "https://pawnshop-staging-api.onrender.com";

export function canonicalHttpsOrigin(name: string, fallback: string) {
  const raw = String(process.env[name] || fallback).trim();

  if (
    !raw ||
    /(?:placeholder|replace(?:[_ -]?me)?|example|your[_ -]|todo|dummy)/i.test(raw)
  ) {
    throw new Error(`${name} must be a non-placeholder canonical HTTPS origin.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${name} must be a valid canonical HTTPS origin.`);
  }

  const hostname = parsed.hostname.toLowerCase();
  const isLocal =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    /^127(?:\.|$)/.test(hostname);

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    raw !== parsed.origin ||
    raw.endsWith("/") ||
    hostname.includes("*") ||
    isLocal
  ) {
    throw new Error(
      `${name} must be a credential-free canonical HTTPS origin without wildcards, paths, queries, fragments, or a trailing slash.`,
    );
  }

  return parsed.origin;
}

export const stagingFrontendOrigin = canonicalHttpsOrigin(
  "STAGING_FRONTEND_URL",
  DEFAULT_FRONTEND_ORIGIN,
);

export const stagingApiOrigin = canonicalHttpsOrigin(
  "STAGING_API_URL",
  DEFAULT_API_ORIGIN,
);
