import assert from "node:assert/strict";
import test from "node:test";
import { parseCloudflareContainmentResponse } from "../lib/cloudflare-containment.mjs";

const base = () => ({ success: true, result: { name: "pawnloop-frontend", source: { config: { production_branch: "main", production_deployments_enabled: false, preview_deployment_setting: "all" } }, canonical_deployment: { id: "8fe20474-1e86-4454-80ef-18f7e671f747" } } });
test("accepts expected Cloudflare project response", () => assert.equal(parseCloudflareContainmentResponse(base()).verified, true));
for (const [name, change, message] of [
  ["production deployments enabled", p => { p.result.source.config.production_deployments_enabled = true; }, /not disabled/],
  ["preview none", p => { p.result.source.config.preview_deployment_setting = "none"; }, /preview/],
  ["wrong canonical", p => { p.result.canonical_deployment.id = "wrong"; }, /canonical/],
  ["missing source", p => { delete p.result.source; }, /source/],
  ["missing config", p => { delete p.result.source.config; }, /configuration/],
  ["missing containment field", p => { delete p.result.source.config.preview_deployment_setting; }, /preview/],
  ["malformed response", () => {}, /malformed/],
]) test(`rejects ${name}`, () => { const payload = name === "malformed response" ? null : base(); if (payload) change(payload); assert.throws(() => parseCloudflareContainmentResponse(payload), message); });
test("errors do not expose environment values", () => { const payload = base(); payload.result.source.config.production_deployments_enabled = "secret-env-value"; assert.throws(() => parseCloudflareContainmentResponse(payload), error => !/secret-env-value|postgres|https?:/.test(error.message)); });
