import { pathToFileURL } from "node:url";

export const STAGING_ORIGIN = "https://pawnshop-staging-api.onrender.com";
export const PRODUCTION_ORIGIN = "https://api.pawnloop.com";
export const PREVIEW_ORIGIN = "https://smoke-check.pawnloop-frontend.pages.dev";
const timeoutMs = 15_000;

async function checkedFetch(fetchImpl, label, url, init = {}) {
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw new Error(`${label} request failed before an HTTP response: ${error.message}`);
  }
}

export async function runPreviewCorsSmoke(fetchImpl = fetch) {
  for (const [label, origin] of [["Staging health", STAGING_ORIGIN], ["Production health", PRODUCTION_ORIGIN]]) {
    const response = await checkedFetch(fetchImpl, label, `${origin}/api/health`);
    if (response.status !== 200) throw new Error(`${label} expected HTTP 200, received ${response.status}.`);
  }

  const headers = {
    Origin: PREVIEW_ORIGIN,
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "content-type",
  };
  const staging = await checkedFetch(fetchImpl, "Staging preflight", `${STAGING_ORIGIN}/api/auth/login`, { method: "OPTIONS", headers });
  if (staging.status !== 204) throw new Error(`Staging preflight expected HTTP 204, received ${staging.status}.`);
  if (staging.headers.get("access-control-allow-origin") !== PREVIEW_ORIGIN) throw new Error("Staging did not echo the verified PawnLoop preview origin exactly.");
  if (staging.headers.get("access-control-allow-credentials") !== "true") throw new Error("Staging did not enable credentialed CORS for the verified preview origin.");

  const production = await checkedFetch(fetchImpl, "Production preflight", `${PRODUCTION_ORIGIN}/api/auth/login`, { method: "OPTIONS", headers });
  if (production.status !== 403) throw new Error(`Production preflight expected deliberate HTTP 403 rejection, received ${production.status}.`);
  if (production.headers.get("access-control-allow-origin") === PREVIEW_ORIGIN) throw new Error("Production unexpectedly accepted a PawnLoop preview origin.");

  return { stagingStatus: staging.status, productionStatus: production.status };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPreviewCorsSmoke()
    .then(() => console.log("Staging health/Preview CORS passed; healthy Production deliberately rejected the Preview origin."))
    .catch((error) => {
      console.error(`Preview CORS smoke failed: ${error.message}`);
      process.exitCode = 1;
    });
}
