function fail(message) { throw new Error(`Cloudflare containment failed: ${message}`); }

export function parseCloudflareContainmentResponse(payload, expected = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || payload.success !== true) fail("malformed API response");
  const result = payload.result;
  const source = result?.source;
  const config = source?.config;
  const canonical = result?.canonical_deployment;
  if (!result || typeof result !== "object" || Array.isArray(result)) fail("missing result");
  if (Object.prototype.hasOwnProperty.call(result, "production_deployments_enabled") || Object.prototype.hasOwnProperty.call(result, "preview_deployment_setting")) fail("containment fields are in an unexpected location");
  if (result.name !== (expected.projectName || "pawnloop-frontend")) fail("wrong project");
  if (!source || typeof source !== "object" || Array.isArray(source)) fail("missing source");
  if (!config || typeof config !== "object" || Array.isArray(config)) fail("missing source configuration");
  if (typeof config.production_branch !== "string" || config.production_branch !== "main") fail("production branch is invalid");
  if (typeof config.production_deployments_enabled !== "boolean" || config.production_deployments_enabled !== false) fail("production deployments are not disabled");
  if (typeof config.preview_deployment_setting !== "string" || config.preview_deployment_setting !== "all") fail("preview deployment setting is invalid");
  if (!canonical || typeof canonical !== "object" || Array.isArray(canonical) || typeof canonical.id !== "string" || canonical.id !== (expected.canonicalDeploymentId || "8fe20474-1e86-4454-80ef-18f7e671f747")) fail("canonical deployment is invalid");
  return { verified: true, projectName: result.name, canonicalDeploymentId: canonical.id };
}
