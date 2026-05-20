import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = "reports/owner-locations-inspect";
fs.mkdirSync(outDir, { recursive: true });

const BASE = "http://127.0.0.1:6002/api";
const WEB = "http://127.0.0.1:5176";
const email = process.env.OWNER_EMAIL || "owner1@pawn.local";
const password = process.env.OWNER_PASSWORD || "Owner123!";

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

      // Cover common auth storage keys used during app iterations.
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

  await page.goto(`${WEB}/owner/locations?fresh=${Date.now()}`, {
    waitUntil: "networkidle",
  });

  const result = await page.evaluate(() => {
    const interesting = [
      "Locations",
      "Refresh",
      "Add location",
      "Active locations",
      "Inventory across locations",
      "Staff assigned",
      "Downtown Pawn",
      "Phone",
      "Hours",
      "Inventory",
      "Staff",
      "View inventory",
      "View staff",
      "ACTIVE",
    ];

    const els = Array.from(document.querySelectorAll("a, button, input, select, textarea, article, section, div, h1, h2, h3, p, span, small, strong"));

    return els
      .map((el, index) => {
        const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120);
        const styles = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();

        return {
          index,
          tag: el.tagName,
          text,
          className: String(el.className || ""),
          inlineStyle: el.getAttribute("style"),
          color: styles.color,
          backgroundColor: styles.backgroundColor,
          borderColor: styles.borderColor,
          opacity: styles.opacity,
          fontWeight: styles.fontWeight,
          display: styles.display,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          x: Math.round(rect.x),
          y: Math.round(rect.y),
        };
      })
      .filter((item) =>
        item.width > 0 &&
        item.height > 0 &&
        interesting.some((word) => item.text.includes(word))
      );
  });

  fs.writeFileSync(
    path.join(outDir, `owner-locations-${theme}.json`),
    JSON.stringify(result, null, 2),
  );

  await page.screenshot({
    path: path.join(outDir, `owner-locations-${theme}.png`),
    fullPage: true,
  });

  console.log(`\n===== ${theme.toUpperCase()} MODE =====`);
  console.log(JSON.stringify(result.slice(0, 80), null, 2));
  console.log(`Saved: ${outDir}/owner-locations-${theme}.json`);
  console.log(`Saved: ${outDir}/owner-locations-${theme}.png`);

  await browser.close();
}

const token = await loginToken();
await inspectTheme("light", token);
await inspectTheme("dark", token);
