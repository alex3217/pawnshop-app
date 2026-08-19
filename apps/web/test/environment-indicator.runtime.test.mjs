import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import EnvironmentIndicator from "../src/components/EnvironmentIndicator.mjs";
import { resolveEnvironmentContract } from "../src/environmentContract.mjs";
import { PRODUCTION_API_ORIGIN, STAGING_API_ORIGIN } from "../scripts/deploymentTargets.mjs";

const deployed = (deployEnv, origin) => resolveEnvironmentContract({
  deployEnv,
  apiOrigin: origin,
  apiPath: "/api",
  socketUrl: origin,
  socketPath: "/socket.io",
});

function render(environment) {
  return renderToStaticMarkup(EnvironmentIndicator({ environment }));
}

test("Preview renders accessible staging-data status text", () => {
  const html = render(deployed("preview", STAGING_API_ORIGIN));
  assert.match(html, /role="status"/);
  assert.match(html, /PREVIEW · STAGING DATA/);
});

test("staging renders truthful accessible staging status text", () => {
  const html = render(deployed("staging", STAGING_API_ORIGIN));
  assert.match(html, /role="status"/);
  assert.match(html, /STAGING · STAGING DATA/);
});

test("Production and development do not render an indicator", () => {
  assert.equal(render(deployed("production", PRODUCTION_API_ORIGIN)), "");
  assert.equal(render(resolveEnvironmentContract({}, { isDev: true })), "");
});
