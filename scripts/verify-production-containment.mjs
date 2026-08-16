const SHA = /^[0-9a-f]{40}$/;
const RENDER_SERVICE = /^srv-[a-z0-9]+$/;
const RENDER_ENVIRONMENT = /^evm-[a-z0-9]+$/;
const RENDER_DEPLOY = /^dep-[a-z0-9]+$/;

function required(env, name, pattern) {
  const value = env[name];
  if (!value || (pattern && !pattern.test(value))) throw new Error(`${name} is missing or malformed`);
  return value;
}

function origin(value, name) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${name} is malformed`); }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error(`${name} must be a credential-free HTTPS origin`);
  return url.origin;
}

async function responseJson(response, label) {
  if (!response?.ok) throw new Error(`${label} request failed with HTTP ${response?.status ?? "unknown"}`);
  try { return await response.json(); } catch { throw new Error(`${label} returned malformed JSON`); }
}

export async function verifyProductionContainment({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") throw new Error("Fetch implementation is unavailable");
  const token = required(env, "RENDER_API_KEY");
  const serviceId = required(env, "PRODUCTION_RENDER_SERVICE_ID", RENDER_SERVICE);
  const environmentId = required(env, "PRODUCTION_RENDER_ENVIRONMENT_ID", RENDER_ENVIRONMENT);
  const serviceName = required(env, "PRODUCTION_RENDER_SERVICE_NAME");
  const expectedSourceSha = required(env, "PRODUCTION_RENDER_SOURCE_SHA", SHA);
  const apiOrigin = origin(required(env, "PRODUCTION_API_ORIGIN"), "PRODUCTION_API_ORIGIN");
  const renderOrigin = origin(required(env, "PRODUCTION_RENDER_ORIGIN"), "PRODUCTION_RENDER_ORIGIN");
  const headers = { Accept: "application/json", Authorization: `Bearer ${token}` };
  let serviceResponse;
  let deployResponse;
  try {
    [serviceResponse, deployResponse] = await Promise.all([
      fetchImpl(`https://api.render.com/v1/services/${serviceId}`, { headers, redirect: "error" }),
      fetchImpl(`https://api.render.com/v1/services/${serviceId}/deploys?limit=20`, { headers, redirect: "error" }),
    ]);
  } catch { throw new Error("Render provider request failed"); }
  const service = await responseJson(serviceResponse, "Render service");
  const deployRecords = await responseJson(deployResponse, "Render deploys");
  if (service.id !== serviceId || service.name !== serviceName) throw new Error("Wrong Render production service identity");
  if (service.environmentId !== environmentId) throw new Error("Wrong Render production environment identity");
  if (service.serviceDetails?.maintenanceMode?.enabled !== true) throw new Error("Render production maintenance mode is not enabled");
  if (service.autoDeploy !== "no" || service.autoDeployTrigger !== "off") throw new Error("Render production automatic deployment is enabled");
  if (origin(service.serviceDetails?.url || "", "Render service URL") !== renderOrigin) throw new Error("Wrong Render production origin");
  if (!Array.isArray(deployRecords) || deployRecords.length === 0) throw new Error("Render deploy records are missing or malformed");
  const live = deployRecords.find((record) => record?.deploy?.status === "live")?.deploy ?? deployRecords.find((record) => record?.status === "live");
  if (!live || !RENDER_DEPLOY.test(String(live.id || "")) || !SHA.test(String(live.commit?.id || ""))) throw new Error("Render live deployment evidence is missing or malformed");
  if (live.commit.id !== expectedSourceSha) throw new Error("Render live source SHA is stale or mismatched");
  for (const path of ["/api/health", "/api/ready"]) {
    for (const base of [renderOrigin, apiOrigin]) {
      let response;
      try { response = await fetchImpl(`${base}${path}`, { method: "GET", redirect: "error" }); } catch { throw new Error(`Production ${path} request failed`); }
      if (response.status !== 503) throw new Error(`Production ${path} unexpectedly returned HTTP ${response.status}`);
    }
  }
  return { verified: true, serviceId, environmentId, deploymentId: live.id, sourceSha: expectedSourceSha };
}

async function main() {
  const result = await verifyProductionContainment();
  process.stdout.write(`Production containment verified for service ${result.serviceId} and deployment ${result.deploymentId}.\n`);
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch((error) => { process.stderr.write(`Production containment verification failed: ${error.message}\n`); process.exitCode = 1; });
}
