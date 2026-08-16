import { createHash } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { pathToFileURL } from "node:url";

const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const IDS = { service: /^srv-[a-z0-9]+$/, environment: /^evm-[a-z0-9]+$/, deploy: /^dep-[a-z0-9]+$/ };
const PROVIDER_HOST = "api.render.com";
const PATHS = ["/api/health", "/api/ready"];
const MAX_BYTES = 64 * 1024;
const TIMEOUT_MS = 10_000;

function fail(message) { const error = new Error(message); error.code = "PRODUCTION_CONTAINMENT_FAILED"; throw error; }
function required(env, name, pattern) {
  const value = String(env[name] || "");
  if (!value || (pattern && !pattern.test(value))) fail(`${name} is missing or malformed`);
  return value;
}
function exactHttps(value, name, allowedHosts, expectedPath = "/") {
  if (/^https:\/\/[^/?#]+:\d+(?:[/?#]|$)/i.test(String(value))) fail(`${name} is not an exact allowlisted HTTPS URL`);
  let url; try { url = new URL(value); } catch { fail(`${name} is malformed`); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== expectedPath || url.search || url.hash || !allowedHosts.has(url.hostname)) fail(`${name} is not an exact allowlisted HTTPS URL`);
  return url;
}
function unsafeAddress(address) {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    const parts = address.split(".").map(Number); const c = parts[2];
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168)) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113);
  }
  if (isIP(address) === 6) {
    const value = address.toLowerCase();
    return value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") || /^fe[89ab]/.test(value) || value.startsWith("ff") || value.startsWith("2001:db8:");
  }
  return true;
}
async function assertPublicDns(host, lookup) {
  let records; try { records = await lookup(host, { all: true, verbatim: true }); } catch { fail(`DNS resolution failed for ${host}`); }
  if (!Array.isArray(records) || records.length === 0 || records.some(({ address }) => unsafeAddress(address))) fail(`DNS resolution for ${host} is unsafe`);
}
async function boundedBody(response, label, expectedTypes) {
  const type = String(response.headers?.get?.("content-type") || "").toLowerCase().split(";", 1)[0].trim();
  if (!expectedTypes.includes(type)) fail(`${label} returned a wrong or missing content type`);
  if (response.status >= 300 && response.status < 400) fail(`${label} redirected`);
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) fail(`${label} response is oversized`);
  let bytes;
  try { bytes = new Uint8Array(await response.arrayBuffer()); } catch { fail(`${label} body could not be read`); }
  if (bytes.byteLength > MAX_BYTES) fail(`${label} response is oversized`);
  return bytes;
}
async function request(url, { fetchImpl, headers, expectedStatus, expectedTypes, label, method = "GET" }) {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response;
  try { response = await fetchImpl(url, { method, headers, redirect: "manual", signal: controller.signal }); }
  catch { fail(`${label} request failed or timed out`); }
  finally { clearTimeout(timeout); }
  if (response.status !== expectedStatus) fail(`${label} returned unexpected HTTP ${response.status}`);
  return boundedBody(response, label, expectedTypes);
}
async function jsonRequest(url, context) {
  const bytes = await request(url, { ...context, expectedStatus: 200, expectedTypes: ["application/json"] });
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { fail(`${context.label} returned malformed JSON`); }
}
function deployment(record) { return record?.deploy || record; }

export async function verifyProductionContainment({ env = process.env, fetchImpl = globalThis.fetch, lookup = dnsLookup } = {}) {
  if (typeof fetchImpl !== "function" || typeof lookup !== "function") fail("Network clients are unavailable");
  const token = required(env, "RENDER_API_KEY");
  const serviceId = required(env, "PRODUCTION_RENDER_SERVICE_ID", IDS.service);
  const serviceName = required(env, "PRODUCTION_RENDER_SERVICE_NAME");
  const environmentId = required(env, "PRODUCTION_RENDER_ENVIRONMENT_ID", IDS.environment);
  const environmentName = required(env, "PRODUCTION_RENDER_ENVIRONMENT_NAME");
  const deploymentId = required(env, "PRODUCTION_RENDER_DEPLOYMENT_ID", IDS.deploy);
  const expectedSourceSha = required(env, "PRODUCTION_RENDER_SOURCE_SHA", SHA);
  const maintenanceDigest = required(env, "PRODUCTION_MAINTENANCE_BODY_SHA256", DIGEST);
  const api = exactHttps(required(env, "PRODUCTION_API_ORIGIN"), "PRODUCTION_API_ORIGIN", new Set(["api.pawnloop.com"]));
  const render = exactHttps(required(env, "PRODUCTION_RENDER_ORIGIN"), "PRODUCTION_RENDER_ORIGIN", new Set(["pawnshop-app-bu8g.onrender.com"]));
  await Promise.all([...new Set([PROVIDER_HOST, api.hostname, render.hostname])].map((host) => assertPublicDns(host, lookup)));
  const providerHeaders = { Accept: "application/json", Authorization: `Bearer ${token}` };
  const serviceUrl = exactHttps(`https://${PROVIDER_HOST}/v1/services/${serviceId}`, "Render service API URL", new Set([PROVIDER_HOST]), `/v1/services/${serviceId}`);
  const deployUrl = exactHttps(`https://${PROVIDER_HOST}/v1/services/${serviceId}/deploys/${deploymentId}`, "Render deployment API URL", new Set([PROVIDER_HOST]), `/v1/services/${serviceId}/deploys/${deploymentId}`);
  const [service, deployRecord] = await Promise.all([
    jsonRequest(serviceUrl, { fetchImpl, headers: providerHeaders, label: "Render service" }),
    jsonRequest(deployUrl, { fetchImpl, headers: providerHeaders, label: "Render deployment" }),
  ]);
  const deploy = deployment(deployRecord);
  if (service.id !== serviceId || service.name !== serviceName || service.environmentId !== environmentId || service.environment?.name !== environmentName) fail("Wrong Render production service or environment identity");
  if (service.serviceDetails?.maintenanceMode?.enabled !== true) fail("Render production maintenance mode is not enabled");
  if (service.autoDeploy !== "no" || service.autoDeployTrigger !== "off") fail("Render production automatic deployment is enabled");
  exactHttps(service.serviceDetails?.url || "", "Render service origin", new Set([render.hostname]));
  if (deploy?.id !== deploymentId || deploy?.serviceId !== serviceId || deploy?.status !== "live" || deploy?.commit?.id !== expectedSourceSha) fail("Expected Render deployment identity, service, live status, or source SHA does not match");
  if (deploy?.createdAt && !Number.isFinite(Date.parse(deploy.createdAt))) fail("Render deployment timestamp is malformed");
  if (Array.isArray(service.activeDeploys) && service.activeDeploys.some((item) => item.id !== deploymentId && ["live", "build_in_progress", "update_in_progress"].includes(item.status))) fail("A conflicting active Render deployment exists");
  for (const base of [render, api]) for (const path of PATHS) {
    const url = exactHttps(`${base.origin}${path}`, "Maintenance endpoint", new Set([base.hostname]), path);
    const bytes = await request(url, { fetchImpl, label: `Production ${base.hostname}${path}`, expectedStatus: 503, expectedTypes: ["text/html"], headers: { Accept: "text/html" } });
    if (createHash("sha256").update(bytes).digest("hex") !== maintenanceDigest) fail(`Production ${base.hostname}${path} lacks the approved maintenance signature`);
    const allow = new TextDecoder().decode(bytes).toLowerCase();
    if (allow.includes("<form") || allow.includes("csrf") || allow.includes("write enabled")) fail(`Production ${base.hostname}${path} exposes writable application behavior`);
  }
  return { verified: true, serviceId, environmentId, deploymentId, sourceSha: expectedSourceSha };
}

async function main() {
  const result = await verifyProductionContainment();
  process.stdout.write(`Production containment verified for service ${result.serviceId} and deployment ${result.deploymentId}.\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { process.stderr.write(`Production containment verification failed: ${error.message}\n`); process.exitCode = 1; });
