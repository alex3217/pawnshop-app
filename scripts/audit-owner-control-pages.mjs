import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = "reports/owner-control-pages-audit";
fs.mkdirSync(outDir, { recursive: true });

const BASE = "http://127.0.0.1:6002/api";
const WEB = "http://127.0.0.1:5176";
const email = process.env.OWNER_EMAIL || "owner1@pawn.local";
const password = process.env.OWNER_PASSWORD || "Owner123!";

const pages = [
  {
    name: "owner-dashboard",
    path: "/owner",
    expected: ["Owner", "Create Item", "Create Auction", "Refresh"],
  },
  {
    name: "owner-inventory",
    path: "/owner/inventory",
    expected: [
      "Owner Inventory",
      "Add Item",
      "Bulk Upload",
      "Scan Console",
      "Export CSV",
      "Select visible",
      "Bulk mark sold",
      "Bulk delete / archive",
      "Create Auction",
    ],
  },
  {
    name: "owner-auctions",
    path: "/owner/auctions",
    expected: ["Owner Auctions", "Create", "Refresh", "Export"],
  },
  {
    name: "owner-staff",
    path: "/owner/staff",
    expected: ["Staff", "Role", "Search", "Remove access"],
  },
  {
    name: "owner-locations",
    path: "/owner/locations",
    expected: ["Locations", "Refresh", "Add location", "View inventory", "View staff"],
  },
  {
    name: "owner-integrations",
    path: "/owner/integrations",
    expected: ["Integrations"],
  },
  {
    name: "owner-subscription",
    path: "/owner/subscription",
    expected: ["Subscription"],
  },
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
    throw new Error(`Owner login failed: HTTP ${response.status} ${JSON.stringify(json)}`);
  }

  return token;
}

async function inspectPage(browser, token, pageConfig, theme) {
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

  await page.goto(`${WEB}${pageConfig.path}?fresh=${Date.now()}`, {
    waitUntil: "networkidle",
  });

  const result = await page.evaluate((expected) => {
    const bodyText = (document.body.innerText || "").toLowerCase();

    const missing = expected.filter(
      (text) => !bodyText.includes(String(text).toLowerCase()),
    );

    const controls = Array.from(
      document.querySelectorAll("a, button, input, select, textarea"),
    )
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const styles = window.getComputedStyle(el);

        return {
          tag: el.tagName,
          text: (el.textContent || el.getAttribute("placeholder") || "")
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 100),
          href: el.getAttribute("href"),
          disabled: "disabled" in el ? el.disabled : null,
          color: styles.color,
          backgroundColor: styles.backgroundColor,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      })
      .filter((item) => item.width > 0 && item.height > 0);

    return {
      url: location.href,
      missing,
      controlCount: controls.length,
      controls: controls.slice(0, 80),
    };
  }, pageConfig.expected);

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
    missing: row.missing,
    controlCount: row.controlCount,
  })),
  needsReview: results.filter((row) => row.missing.length > 0),
  verdict: results.every((row) => row.missing.length === 0) ? "PASS" : "REVIEW_NEEDED",
};

fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(outDir, "details.json"), JSON.stringify(results, null, 2));

console.log(JSON.stringify(summary, null, 2));
console.log("");
console.log(`Saved: ${outDir}/summary.json`);
console.log(`Saved: ${outDir}/details.json`);
console.log(`Saved screenshots in ${outDir}/`);
