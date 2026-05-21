import { chromium } from "playwright";
import fs from "node:fs";

const outDir = "reports/my-bids-focused-audit";
fs.mkdirSync(outDir, { recursive: true });

const BASE = "http://127.0.0.1:6002/api";
const WEB = "http://127.0.0.1:5176";
const email = process.env.BUYER_EMAIL || "buyer@pawn.local";
const password = process.env.BUYER_PASSWORD || "Buyer123!";

async function loginToken() {
  const response = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const json = await response.json().catch(() => ({}));
  const token = json.token || json.accessToken || json.data?.token || json.data?.accessToken;

  if (!response.ok || !token) {
    throw new Error(`Buyer login failed: HTTP ${response.status}`);
  }

  return token;
}

async function inspect(theme, token) {
  const browser = await chromium.launch({ headless: true, args: ["--disable-gpu"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });

  await context.addInitScript(({ theme, token }) => {
    try {
      localStorage.setItem("pawnloop-theme-v2", theme);
      localStorage.setItem("token", token);
      localStorage.setItem("authToken", token);
      localStorage.setItem("accessToken", token);
      localStorage.setItem("pawnloop-token", token);
      localStorage.setItem("pawnloop-auth-token", token);
      localStorage.setItem("role", "CONSUMER");
      localStorage.setItem("userRole", "CONSUMER");
    } catch {}
  }, { theme, token });

  const page = await context.newPage();

  await page.goto(`${WEB}/my-bids?fresh=${Date.now()}`, {
    waitUntil: "networkidle",
  });

  const result = await page.evaluate(() => {
    const bodyText = document.body.innerText || "";

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
    const linksByText = {};
    for (const control of controls) {
      const key = control.text || "(blank)";
      linksByText[key] = (linksByText[key] || 0) + 1;
    }

    return {
      bodyPreview: bodyText.slice(0, 3000),
      controlCount: controls.length,
      tinyCount: tiny.length,
      tinySample: tiny.slice(0, 80),
      mostRepeatedControls: Object.entries(linksByText)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 40),
      controlsSample: controls.slice(0, 120),
    };
  });

  await page.screenshot({
    path: `${outDir}/my-bids-${theme}.png`,
    fullPage: true,
  });

  await context.close().catch(() => {});
  await browser.close().catch(() => {});

  return { theme, ...result };
}

const token = await loginToken();

const light = await inspect("light", token);
const dark = await inspect("dark", token);

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
