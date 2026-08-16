import assert from "node:assert/strict";
import test from "node:test";
import { verifyProductionContainment } from "../verify-production-containment.mjs";

const sha = "0123456789abcdef0123456789abcdef01234567";
const env = () => ({
  RENDER_API_KEY: "test-token-never-logged", PRODUCTION_RENDER_SERVICE_ID: "srv-production123",
  PRODUCTION_RENDER_ENVIRONMENT_ID: "evm-production123", PRODUCTION_RENDER_SERVICE_NAME: "pawnshop-app",
  PRODUCTION_RENDER_SOURCE_SHA: sha, PRODUCTION_API_ORIGIN: "https://api.pawnloop.com",
  PRODUCTION_RENDER_ORIGIN: "https://pawnshop-app-bu8g.onrender.com",
});
const service = () => ({ id: "srv-production123", environmentId: "evm-production123", name: "pawnshop-app", autoDeploy: "no", autoDeployTrigger: "off", serviceDetails: { url: "https://pawnshop-app-bu8g.onrender.com", maintenanceMode: { enabled: true } } });
const deploys = () => [{ deploy: { id: "dep-production123", status: "live", commit: { id: sha } } }];
const jsonResponse = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => value });

function fetcher({ serviceValue = service(), deployValue = deploys(), status = 503, fail = false, malformed = false } = {}) {
  return async (url, options = {}) => {
    assert.doesNotMatch(String(url), /test-token/);
    if (fail) throw new Error("network down");
    if (url.includes("api.render.com") && url.includes("/deploys")) return malformed ? { ok: true, status: 200, json: async () => { throw new Error("bad json"); } } : jsonResponse(deployValue);
    if (url.includes("api.render.com")) { assert.equal(options.headers.Authorization, "Bearer test-token-never-logged"); return jsonResponse(serviceValue); }
    return jsonResponse({}, status);
  };
}

test("accepts exact independently queried maintenance containment", async () => {
  assert.equal((await verifyProductionContainment({ env: env(), fetchImpl: fetcher() })).verified, true);
});

test("fails closed for missing environment variables", async () => {
  for (const key of Object.keys(env())) { const value = env(); delete value[key]; await assert.rejects(verifyProductionContainment({ env: value, fetchImpl: fetcher() })); }
});

test("rejects maintenance disabled, auto-deploy, wrong service/environment/origin, and stale source", async () => {
  const cases = [
    () => { const v = service(); v.serviceDetails.maintenanceMode.enabled = false; return { serviceValue: v }; },
    () => { const v = service(); v.autoDeploy = "yes"; return { serviceValue: v }; },
    () => { const v = service(); v.id = "srv-wrong"; return { serviceValue: v }; },
    () => { const v = service(); v.environmentId = "evm-wrong"; return { serviceValue: v }; },
    () => { const v = service(); v.serviceDetails.url = "https://staging.invalid"; return { serviceValue: v }; },
    () => { const v = deploys(); v[0].deploy.commit.id = `f${sha.slice(1)}`; return { deployValue: v }; },
  ];
  for (const make of cases) await assert.rejects(verifyProductionContainment({ env: env(), fetchImpl: fetcher(make()) }));
});

test("rejects writable health, missing write-gate deployment evidence, request failure, and malformed provider JSON", async () => {
  await assert.rejects(verifyProductionContainment({ env: env(), fetchImpl: fetcher({ status: 200 }) }));
  await assert.rejects(verifyProductionContainment({ env: env(), fetchImpl: fetcher({ deployValue: [] }) }));
  await assert.rejects(verifyProductionContainment({ env: env(), fetchImpl: fetcher({ fail: true }) }));
  await assert.rejects(verifyProductionContainment({ env: env(), fetchImpl: fetcher({ malformed: true }) }));
});
