import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = "reports/owner-auctions-control-audit";
fs.mkdirSync(outDir, { recursive: true });

const BASE = "http://127.0.0.1:6002/api";
const WEB = "http://127.0.0.1:5176";
const email = process.env.OWNER_EMAIL || "owner1@pawn.local";
const password = process.env.OWNER_PASSWORD || "Owner123!";

const requiredTexts = [
  "Owner Auctions",
  "Create",
  "Refresh",
  "Export",
  "Search",
  "Live",
  "Scheduled",
  "Ended",
  "Canceled",
  "View auction",
  "View item",
];

async function loginToken() {
  const response = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const json = await response.json().catch(() => ({}));
  const token = json.token || json.accessToken || json.data?.token || json.data?.accessToken;

  if (!response.ok || !token) {
    throw new Error(`Owner login failed: HTTP ${response.status} ${JSON.stringify(json)}`);
  }

  return token;
}

async function inspectTheme(theme, token) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });

  await context.addInitScript(
    ({ theme, token }) => {
      localStorage.setItem("pawnloop-theme-v2", theme);
      localStorage.setItem("token", token);
      localStorage.setItem("authToken", token);
      localStorage.setItem("accessToken", token);
      localStorage.setItem("pawnloop-token", token);
      localStorage.setItem("pawnloop-auth-token", token);
      localStorage.setItem("role", "OWNER");
      localStorage.setItem("userRole", "OWNER");
    },
    { theme, token },
  );

  const page = await context.newPage();

  await page.goto(`${WEB}/owner/auctions?fresh=${Date.now()}`, {
    waitUntil: "networkidle",
  });

  const result = await page.evaluate((requiredTexts) => {
    const bodyText = (document.body.innerText || "").toLowerCase();
    const missingTexts = requiredTexts.filter(
      (text) => !bodyText.includes(String(text).toLowerCase()),
    );

    const controls = Array.from(
      document.querySelectorAll("a, button, input, select, textarea"),
    )
      .map((el, index) => {
        const rect = el.getBoundingClientRect();
        const styles = window.getComputedStyle(el);

        return {
          index,
          tag: el.tagName,
          text: (el.textContent || el.getAttribute("placeholder") || "")
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 120),
          href: el.getAttribute("href"),
          disabled: "disabled" in el ? el.disabled : null,
          color: styles.color,
          backgroundColor: styles.backgroundColor,
          borderColor: styles.borderColor,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      })
      .filter((item) => item.width > 0 && item.height > 0);

    return {
      url: location.href,
      missingTexts,
      controlCount: controls.length,
      controls,
    };
  }, requiredTexts);

  await page.screenshot({
    path: path.join(outDir, `owner-auctions-${theme}.png`),
    fullPage: true,
  });

  await browser.close();

  return {
    theme,
    ...result,
  };
}

const token = await loginToken();

const light = await inspectTheme("light", token);
const dark = await inspectTheme("dark", token);

const summary = {
  generatedAt: new Date().toISOString(),
  light: {
    missingTexts: light.missingTexts,
    controlCount: light.controlCount,
  },
  dark: {
    missingTexts: dark.missingTexts,
    controlCount: dark.controlCount,
  },
  verdict:
    light.missingTexts.length === 0 && dark.missingTexts.length === 0
      ? "PASS"
      : "REVIEW_NEEDED",
};

fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(outDir, "light.json"), JSON.stringify(light, null, 2));
fs.writeFileSync(path.join(outDir, "dark.json"), JSON.stringify(dark, null, 2));

console.log(JSON.stringify(summary, null, 2));
console.log("");
console.log(`Saved: ${outDir}/summary.json`);
console.log(`Saved: ${outDir}/light.json`);
console.log(`Saved: ${outDir}/dark.json`);
