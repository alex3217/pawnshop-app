import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = "reports/buyer-clickability-audit";
fs.mkdirSync(outDir, { recursive: true });

const BASE = "http://127.0.0.1:6002/api";
const WEB = "http://127.0.0.1:5176";
const email = process.env.BUYER_EMAIL || "buyer@pawn.local";
const password = process.env.BUYER_PASSWORD || "Buyer123!";

const pages = [
  { name: "buyer-dashboard", path: "/buyer/dashboard" },
  { name: "marketplace", path: "/marketplace" },
  { name: "item-locator", path: "/buyer/item-locator" },
  { name: "auctions", path: "/auctions" },
  { name: "my-bids", path: "/my-bids" },
  { name: "my-wins", path: "/my-wins" },
  { name: "watchlist", path: "/watchlist" },
  { name: "saved-searches", path: "/saved-searches" },
  { name: "offers", path: "/offers" },
  { name: "sell-pawn-item", path: "/buyer/sell-item" },
  { name: "shops", path: "/shops" },
];

async function loginToken() {
  const response = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const json = await response.json().catch(() => ({}));
  const token =
    json.token ||
    json.accessToken ||
    json.data?.token ||
    json.data?.accessToken;

  if (!response.ok || !token) {
    throw new Error(`Buyer login failed: HTTP ${response.status} ${JSON.stringify(json)}`);
  }

  return token;
}

async function inspectPage(browser, token, pageConfig, theme) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });

  await context.addInitScript(
    ({ token, theme }) => {
      localStorage.setItem("pawnloop-theme-v2", theme);
      localStorage.setItem("token", token);
      localStorage.setItem("authToken", token);
      localStorage.setItem("accessToken", token);
      localStorage.setItem("pawnloop-token", token);
      localStorage.setItem("pawnloop-auth-token", token);
      localStorage.setItem("role", "CONSUMER");
      localStorage.setItem("userRole", "CONSUMER");
    },
    { token, theme },
  );

  const page = await context.newPage();

  await page.goto(`${WEB}${pageConfig.path}?fresh=${Date.now()}`, {
    waitUntil: "networkidle",
  });

  const result = await page.evaluate(() => {
    const controls = Array.from(document.querySelectorAll("a, button, input, select, textarea"))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const styles = window.getComputedStyle(el);
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const topElement = document.elementFromPoint(centerX, centerY);

        return {
          tag: el.tagName,
          text: (el.textContent || el.getAttribute("placeholder") || "")
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 120),
          href: el.getAttribute("href"),
          disabled: "disabled" in el ? el.disabled : null,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          color: styles.color,
          backgroundColor: styles.backgroundColor,
          pointerEvents: styles.pointerEvents,
          visibility: styles.visibility,
          display: styles.display,
          topElementTag: topElement?.tagName || null,
          topElementText: (topElement?.textContent || "")
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 120),
          blocked:
            rect.width > 0 &&
            rect.height > 0 &&
            topElement &&
            topElement !== el &&
            !el.contains(topElement) &&
            !topElement.contains(el),
        };
      })
      .filter((item) => item.width > 0 && item.height > 0);

    return {
      controlCount: controls.length,
      blocked: controls.filter((item) => item.blocked),
      disabledImportant: controls.filter((item) => {
        const text = item.text.toLowerCase();
        return item.disabled && /save|create|remove|search|offer|bid|refresh/.test(text);
      }),
      tinyControls: controls.filter((item) => item.width < 28 || item.height < 24),
      controls: controls.slice(0, 140),
    };
  });

  await page.screenshot({
    path: path.join(outDir, `${pageConfig.name}-${theme}.png`),
    fullPage: true,
  });

  await context.close();

  return {
    name: pageConfig.name,
    path: pageConfig.path,
    theme,
    ...result,
  };
}

const token = await loginToken();
const browser = await chromium.launch({ headless: true });

const results = [];

for (const pageConfig of pages) {
  for (const theme of ["light", "dark"]) {
    results.push(await inspectPage(browser, token, pageConfig, theme));
  }
}

await browser.close();

const summary = {
  generatedAt: new Date().toISOString(),
  pages: results.map((row) => ({
    name: row.name,
    theme: row.theme,
    path: row.path,
    controlCount: row.controlCount,
    blockedCount: row.blocked.length,
    tinyControlCount: row.tinyControls.length,
    disabledImportantCount: row.disabledImportant.length,
  })),
  needsReview: results.filter((row) => row.blocked.length > 0),
  tinyControlWarnings: results.filter(
    (row) => row.blocked.length === 0 && row.tinyControls.length > 0,
  ),
  verdict: results.every((row) => row.blocked.length === 0)
    ? "PASS"
    : "REVIEW_NEEDED",
};

fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(outDir, "details.json"), JSON.stringify(results, null, 2));

console.log(JSON.stringify(summary, null, 2));
