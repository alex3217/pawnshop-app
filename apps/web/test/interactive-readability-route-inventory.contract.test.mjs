import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const inventory = readFileSync(
  new URL("../e2e-marketplace/fixtures/interactiveReadabilityRoutes.ts", import.meta.url),
  "utf8",
);

function unique(values) {
  return [...new Set(values)].sort();
}

test("interactive readability inventory cannot omit registered literal routes", () => {
  const registered = unique(
    [...app.matchAll(/path\s*[:=]\s*["'`]([^"'`]+)["'`]/g)]
      .map((match) => match[1])
      .filter((path) => !path.includes("${")),
  );
  const registryBlock = inventory.match(/REGISTERED_ROUTE_PATTERNS = \[([\s\S]*?)\] as const;/)?.[1] || "";
  const auditedPatterns = unique([...registryBlock.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]));
  assert.deepEqual(auditedPatterns, registered);
});

test("buyer navigation destinations participate in the concrete audit", () => {
  const buyerNavigation = readFileSync(new URL("../src/navigation/buyerNavigation.ts", import.meta.url), "utf8");
  const destinations = unique([...buyerNavigation.matchAll(/to:\s*"([^"]+)"/g)].map((match) => match[1]));
  for (const destination of destinations) {
    assert.match(inventory, new RegExp(`"${destination.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  }
});
