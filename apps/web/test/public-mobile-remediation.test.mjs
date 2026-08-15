import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const webRoot = new URL("../", import.meta.url);

function relativeLuminance(hex) {
  const channels = hex.match(/[a-f\d]{2}/gi).map((value) => Number.parseInt(value, 16) / 255);
  const [red, green, blue] = channels.map((value) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(foreground, background) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

test("environment banner colors exceed WCAG AA in light and dark themes", async () => {
  const css = await readFile(new URL("src/styles/site-layout.css", webRoot), "utf8");
  assert.match(css, /\.site-environment-indicator[\s\S]*background: #7c2d12;[\s\S]*color: #ffffff;/);
  assert.match(css, /data-theme="dark"[\s\S]*background: #431407;[\s\S]*color: #ffffff;/);
  assert.ok(contrast("ffffff", "7c2d12") >= 4.5);
  assert.ok(contrast("ffffff", "431407") >= 4.5);
  assert.match(css, /\.site-environment-indicator a,[\s\S]*\.site-environment-indicator button[\s\S]*color: inherit;/);
});

test("audited public pages defer to the application main landmark", async () => {
  for (const filename of [
    "HomePage.tsx",
    "MarketplacePage.tsx",
    "ShopsPage.tsx",
    "TermsPage.tsx",
    "PrivacyPage.tsx",
  ]) {
    const source = await readFile(new URL(`src/pages/${filename}`, webRoot), "utf8");
    assert.doesNotMatch(source, /<\/?main\b/, filename);
  }

  const layout = await readFile(new URL("src/components/SiteLayout.tsx", webRoot), "utf8");
  assert.match(layout, /<main className="site-main"/);
});

test("marketplace renders one Clear filters action for every result state", async () => {
  const source = await readFile(new URL("src/pages/MarketplacePage.tsx", webRoot), "utf8");
  assert.equal(source.match(/>\s*Clear filters\s*</g)?.length, 1);
  assert.doesNotMatch(source, />\s*Reset filters\s*</);
  assert.match(source, /onClick=\{clearFilters\}/);
  assert.doesNotMatch(source, /onClick=\{clearFilters\} disabled=/);
});

test("mobile non-home tutorial launcher is in flow with safe-area spacing", async () => {
  const css = await readFile(new URL("src/styles/navigation-tour.css", webRoot), "utf8");
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*\.navigation-tour-floating \{[\s\S]*position: relative;[\s\S]*env\(safe-area-inset-bottom/);
  assert.match(css, /body:has\(\.home2-page\) \.navigation-tour-floating \{[\s\S]*position: fixed;/);
  assert.match(css, /\.navigation-tour-dismiss \{[\s\S]*width: 44px;[\s\S]*height: 44px;/);
});
