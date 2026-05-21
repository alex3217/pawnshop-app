import { chromium } from "playwright";
import fs from "node:fs";

const outDir = "reports/shops-focused-audit";
fs.mkdirSync(outDir, { recursive: true });

const WEB = "http://127.0.0.1:5176";

async function inspect(theme) {
  const browser = await chromium.launch({ headless: true, args: ["--disable-gpu"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });

  await context.addInitScript(({ theme }) => {
    try {
      localStorage.setItem("pawnloop-theme-v2", theme);
      localStorage.setItem("role", "CONSUMER");
      localStorage.setItem("userRole", "CONSUMER");
    } catch {}
  }, { theme });

  const page = await context.newPage();

  await page.goto(`${WEB}/shops?fresh=${Date.now()}`, {
    waitUntil: "networkidle",
  });

  const result = await page.evaluate(() => {
    const controls = Array.from(document.querySelectorAll("a, button, input, select, textarea"))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const styles = window.getComputedStyle(el);
        const text = (el.textContent || el.getAttribute("placeholder") || "")
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 140);

        return {
          tag: el.tagName,
          text,
          href: el.getAttribute("href"),
          disabled: "disabled" in el ? el.disabled : null,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          color: styles.color,
          backgroundColor: styles.backgroundColor,
          className: String(el.getAttribute("class") || "").slice(0, 140),
        };
      })
      .filter((item) => item.width > 0 && item.height > 0);

    const tiny = controls.filter((item) => item.width < 44 || item.height < 36);
    const repeated = {};
    for (const control of controls) {
      const key = control.text || "(blank)";
      repeated[key] = (repeated[key] || 0) + 1;
    }

    return {
      controlCount: controls.length,
      tinyCount: tiny.length,
      tinySample: tiny.slice(0, 80),
      mostRepeatedControls: Object.entries(repeated)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 40),
      controlsSample: controls.slice(0, 140),
    };
  });

  await page.screenshot({
    path: `${outDir}/shops-${theme}.png`,
    fullPage: true,
  });

  await context.close().catch(() => {});
  await browser.close().catch(() => {});

  return { theme, ...result };
}

const light = await inspect("light");
const dark = await inspect("dark");

const summary = {
  generatedAt: new Date().toISOString(),
  light: {
    controlCount: light.controlCount,
    tinyCount: light.tinyCount,
    mostRepeatedControls: light.mostRepeatedControls,
  },
  dark: {
    controlCount: dark.controlCount,
    tinyCount: dark.tinyCount,
    mostRepeatedControls: dark.mostRepeatedControls,
  },
};

fs.writeFileSync(`${outDir}/summary.json`, JSON.stringify(summary, null, 2));
fs.writeFileSync(`${outDir}/details.json`, JSON.stringify({ light, dark }, null, 2));

console.log(JSON.stringify(summary, null, 2));
