import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { verifyProductionContainment } from "../verify-production-containment.mjs";

const sha = "0123456789abcdef0123456789abcdef01234567";
const maintenance = Buffer.from("<html><title>Maintenance</title><p>Temporarily unavailable.</p></html>");
const digest = createHash("sha256").update(maintenance).digest("hex");
const env = () => ({ RENDER_API_KEY: "secret-never-logged", PRODUCTION_RENDER_SERVICE_ID: "srv-production123", PRODUCTION_RENDER_SERVICE_NAME: "pawnshop-app", PRODUCTION_RENDER_ENVIRONMENT_ID: "evm-production123", PRODUCTION_RENDER_ENVIRONMENT_NAME: "Production", PRODUCTION_RENDER_DEPLOYMENT_ID: "dep-frozen123", PRODUCTION_RENDER_SOURCE_SHA: sha, PRODUCTION_MAINTENANCE_BODY_SHA256: digest, PRODUCTION_API_ORIGIN: "https://api.pawnloop.com", PRODUCTION_RENDER_ORIGIN: "https://pawnshop-app-bu8g.onrender.com" });
const service = () => ({ id: "srv-production123", name: "pawnshop-app", environmentId: "evm-production123", environment: { name: "Production" }, autoDeploy: "no", autoDeployTrigger: "off", activeDeploys: [{ id: "dep-frozen123", status: "live" }], serviceDetails: { url: "https://pawnshop-app-bu8g.onrender.com", maintenanceMode: { enabled: true } } });
const deploy = () => ({ id: "dep-frozen123", serviceId: "srv-production123", status: "live", commit: { id: sha }, createdAt: "2025-01-01T00:00:00Z" });
const headers = (type, length) => ({ get: (name) => name.toLowerCase() === "content-type" ? type : name.toLowerCase() === "content-length" && length != null ? String(length) : null });
const response = (body, status, type) => ({ status, headers: headers(type, body.length), arrayBuffer: async () => body });
const lookup = async () => [{ address: "104.16.1.2", family: 4 }];

function fetcher(options = {}) {
  return async (input, init = {}) => {
    const url = String(input); assert.doesNotMatch(url, /secret-never-logged/); assert.equal(init.redirect, "manual"); assert.ok(init.signal);
    if (options.abort) return new Promise((resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
    if (url.includes("api.render.com") && url.endsWith("/dep-frozen123")) return response(Buffer.from(JSON.stringify(options.deploy || deploy())), options.redirect ? 302 : 200, options.providerType || "application/json");
    if (url.includes("api.render.com")) return response(Buffer.from(JSON.stringify(options.service || service())), 200, options.providerType || "application/json");
    const body = options.body || maintenance; return response(body, options.status ?? 503, options.publicType || "text/html");
  };
}
async function rejectsWith(change, pattern) {
  await assert.rejects(verifyProductionContainment({ env: change.env || env(), fetchImpl: change.fetch || fetcher(change), lookup: change.lookup || lookup }), (error) => { assert.match(error.message, pattern); assert.doesNotMatch(error.message, /secret-never-logged|Authorization|Temporarily unavailable/); return true; });
}

test("accepts exact directly retrieved frozen deployment and signed maintenance response", async () => {
  assert.deepEqual(await verifyProductionContainment({ env: env(), fetchImpl: fetcher(), lookup }), { verified: true, serviceId: "srv-production123", environmentId: "evm-production123", deploymentId: "dep-frozen123", sourceSha: sha });
});
test("rejects URL injection, ports, lookalikes, suffixes, paths, and non-HTTPS", async () => {
  for (const value of ["http://api.pawnloop.com", "https://u:p@api.pawnloop.com", "https://api.pawnloop.com:443", "https://api.pawnloop.com.evil.test", "https://api-pawnloop.com", "https://api.pawnloop.com/?x=1", "https://api.pawnloop.com/#x", "https://api.pawnloop.com/api/ready"]) { const valueEnv = env(); valueEnv.PRODUCTION_API_ORIGIN = value; await rejectsWith({ env: valueEnv }, /allowlisted HTTPS URL/); }
});
test("rejects loopback, private, link-local, reserved, and empty DNS answers", async () => {
  for (const address of ["127.0.0.1", "10.0.0.1", "169.254.1.1", "192.168.1.1", "224.0.0.1", "::1", "fe80::1", "2001:db8::1"]) await rejectsWith({ lookup: async () => [{ address }] }, /DNS resolution.*unsafe/);
  await rejectsWith({ lookup: async () => [] }, /DNS resolution.*unsafe/);
});
test("rejects timeout, redirect, oversized body, and content type failures by their intended guard", async () => {
  await rejectsWith({ abort: true }, /failed or timed out/);
  await rejectsWith({ redirect: true }, /unexpected HTTP 302/);
  await rejectsWith({ body: Buffer.alloc(65 * 1024) }, /oversized/);
  await rejectsWith({ publicType: "application/json" }, /content type/);
  await rejectsWith({ providerType: "text/html" }, /content type/);
});
test("rejects generic 503, missing signature, and writable facade", async () => {
  await rejectsWith({ body: Buffer.from("generic upstream failure") }, /maintenance signature/);
  const writable = Buffer.from("<html><form>write enabled</form></html>"); const valueEnv = env(); valueEnv.PRODUCTION_MAINTENANCE_BODY_SHA256 = createHash("sha256").update(writable).digest("hex");
  await rejectsWith({ env: valueEnv, fetch: fetcher({ body: writable }) }, /writable application behavior/);
});
test("rejects wrong expected deployment, stale source, maintenance off, and conflicting active deployment", async () => {
  const wrong = deploy(); wrong.id = "dep-other123"; await rejectsWith({ deploy: wrong }, /Expected Render deployment/);
  const stale = deploy(); stale.commit.id = `f${sha.slice(1)}`; await rejectsWith({ deploy: stale }, /source SHA/);
  const off = service(); off.serviceDetails.maintenanceMode.enabled = false; await rejectsWith({ service: off }, /maintenance mode/);
  const conflict = service(); conflict.activeDeploys.push({ id: "dep-other123", status: "live" }); await rejectsWith({ service: conflict }, /conflicting active/);
});
test("uses direct deployment retrieval rather than a bounded latest-deploy search", async () => {
  const seen = []; await verifyProductionContainment({ env: env(), lookup, fetchImpl: async (url, init) => { seen.push(String(url)); return fetcher()(url, init); } });
  assert.ok(seen.some((url) => url.endsWith("/deploys/dep-frozen123"))); assert.ok(!seen.some((url) => url.includes("?limit=")));
});
