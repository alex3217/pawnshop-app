import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflows = fs.readdirSync(".github/workflows").filter((name) => name.endsWith(".yml"));
const sources = workflows.map((name) => [name, fs.readFileSync(`.github/workflows/${name}`, "utf8")]);
const core = sources.find(([name]) => name === "core-ci.yml")[1];

test("all third-party actions are pinned and checkout credentials are disabled", () => {
  for (const [name, source] of sources) {
    for (const line of source.split("\n").filter((value) => /^\s*uses:/.test(value))) {
      assert.match(line, /@[0-9a-f]{40}(?:\s+#.*)?$/, `${name}: ${line.trim()}`);
    }
    const checkoutSteps = source.split(/(?=\n\s*- (?:name:.*\n\s+)?uses: actions\/checkout@)/);
    for (const step of checkoutSteps.filter((value) => value.includes("uses: actions/checkout@"))) {
      assert.match(step, /persist-credentials:\s*false/);
    }
  }
});

test("history scan is read-only, complete, redacted, immutable, and least privilege", () => {
  assert.match(core, /permissions:\n\s+contents: read/);
  assert.match(core, /fetch-depth:\s*0/);
  assert.match(core, /ghcr\.io\/gitleaks\/gitleaks:v8\.28\.0@sha256:cdbb7c955abce02001a9f6c9f602fb195b7fadc1e812065883f695d1eeaba854/);
  assert.match(core, /:\/repo:ro/);
  assert.match(core, /--redact=100/);
  assert.doesNotMatch(core, /GITLEAKS_LICENSE|secrets\./);
});
