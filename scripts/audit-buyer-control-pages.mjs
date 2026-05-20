import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = "reports/buyer-control-pages-audit";
fs.mkdirSync(outDir, { recursive: true });

const BASE = "http://127.0.0.1:6002/api";
const WEB = "http://127.0.0.1:5176";
const email = process.env.BUYER_EMAIL || "buyer@pawn.local";
const password = process.env.BUYER_PASSWORD || "Buyer123!";

const pages = [
  {
    name: "buyer-dashboard",
    path: "/buyer/dashboard",
    expected: ["Buyer", "Marketplace", "Item Locator", "Watchlist", "My bids", "Offers", "Saved"],
  },
  {
    name: "marketplace",
    path: "/marketplace",
    expected: ["Marketplace", "Search", "Filter", "Watchlist", "Make offer"],
  },
  {
    name: "item-locator",
    path: "/buyer/item-locator",
    expected: ["Item Locator", "Search", "Shops", "Radius", "Saved searches"],
  },
  {
    name: "auctions",
    path: "/auctions",
    expected: ["Auctions", "Browse live", "Refresh", "LIVE", "ENDED", "CANCELED", "ALL"],
  },
  {
    name: "my-bids",
    path: "/my-bids",
    expected: ["Buyer bidding center", "Total bids", "Leading", "Outbid", "Refresh bids", "Open auction"],
  },
  {
    name: "my-wins",
    path: "/my-wins",
    expected: ["won auctions", "settlement", "payment", "My bids", "Auctions"],
  },
  {
    name: "watchlist",
    path: "/watchlist",
    expected: [
      "watchlist",
      "Find an item",
      "My offers",
      "Buyer dashboard",
      "Search",
      "Status",
      "Sort",
      "Select visible",
      "Bulk remove",
      "Make offer",
      "Check auctions",
      "Find similar",
    ],
  },
  {
    name: "saved-searches",
    path: "/saved-searches",
    expected: [
      "Saved",
      "Create",
      "Save search",
      "Quick starters",
      "Marketplace",
      "Item locator",
      "Remove",
      "Watchlist",
    ],
  },
  {
    name: "offers",
    path: "/offers",
    expected: ["Buyer offer center", "Create", "Cancel", "Counter", "View item", "View shop"],
  },
  {
    name: "sell-pawn-item",
    path: "/buyer/sell-item",
    expected: ["Scan", "photograph", "offers", "Submit", "Shop offers"],
  },
  {
    name: "shops",
    path: "/shops",
    expected: ["Shops", "inventory", "Auctions", "Saved"],
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
    throw new Error(`Buyer login failed: HTTP ${response.status} ${JSON.stringify(json)}`);
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
      localStorage.setItem("role", "CONSUMER");
      localStorage.setItem("userRole", "CONSUMER");
    },
    { theme, token },
  );

  const page = await context.newPage();

  await page.goto(`${WEB}${pageConfig.path}?fresh=${Date.now()}`, {
    waitUntil: "networkidle",
  });

  const result = await page.evaluate((expected) => {
    const bodyTextRaw = document.body.innerText || "";
    const bodyText = bodyTextRaw.toLowerCase();

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
      missing,
      bodyPreview: bodyTextRaw.slice(0, 3000),
      controlCount: controls.length,
      controls: controls.slice(0, 100),
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
