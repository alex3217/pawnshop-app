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
  assert.match(css, /:root \.site-header > \.site-environment-indicator :is\(span, a, button\) \{[\s\S]*color: #ffffff !important;[\s\S]*-webkit-text-fill-color: #ffffff !important;/);
  assert.match(css, /:root \.site-header > \.site-environment-indicator svg \{[\s\S]*fill: currentColor;[\s\S]*stroke: currentColor;/);
  assert.match(css, /:root \.site-header > \.site-environment-indicator a:hover,[\s\S]*color: #ffedd5 !important;/);
  assert.match(css, /:root \.site-header > \.site-environment-indicator a:focus-visible,[\s\S]*outline: 3px solid #ffffff;/);
  assert.ok(contrast("ffedd5", "7c2d12") >= 4.5);
  assert.ok(contrast("ffedd5", "431407") >= 4.5);
});

test("tutorial primary button states exceed WCAG AA without shrinking its target", async () => {
  const css = await readFile(new URL("src/styles/navigation-tour.css", webRoot), "utf8");
  assert.match(css, /#react-joyride-portal \[data-testid="button-primary"\] \{[\s\S]*min-width: 44px;[\s\S]*min-height: 44px;[\s\S]*background: #1d4ed8 !important;[\s\S]*color: #ffffff !important;/);
  assert.match(css, /\[data-testid="button-primary"\]:hover \{[\s\S]*background: #1e40af !important;/);
  assert.match(css, /\[data-testid="button-primary"\]:active \{[\s\S]*background: #1e3a8a !important;/);
  assert.match(css, /\[data-testid="button-primary"\]:focus-visible \{[\s\S]*outline: 3px solid #0f172a;/);
  assert.match(css, /\[data-testid="button-primary"\]:disabled \{[\s\S]*background: #475569 !important;[\s\S]*opacity: 1;/);

  for (const background of ["1d4ed8", "1e40af", "1e3a8a", "475569"]) {
    assert.ok(contrast("ffffff", background) >= 4.5, background);
  }
});

test("homepage card labels exceed WCAG AA in light and dark themes", async () => {
  const css = await readFile(new URL("src/styles/home-page-v2.css", webRoot), "utf8");
  assert.match(css, /\.home2-section-title span \{[\s\S]*color: #4f46e5;/);
  assert.match(css, /data-theme="dark"\] \.home2-section-title > span \{[\s\S]*color: #a5b4fc;/);
  assert.match(css, /not\(\[data-theme="dark"\]\) \.home2-page \.home2-section-title > span \{[\s\S]*color: #4338ca !important;/);
  assert.ok(contrast("a5b4fc", "111827") >= 4.5);
  assert.ok(contrast("4338ca", "ffffff") >= 4.5);
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
