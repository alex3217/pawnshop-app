import { createRequire } from "node:module";

const requireFromWeb = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { chromium } = requireFromWeb("@playwright/test");

const baseUrl = process.env.FRONTEND_URL || "http://127.0.0.1:5176";

const accounts = [
  {
    label: "buyer",
    email: process.env.BUYER_EMAIL || "buyer@pawn.local",
    password: process.env.BUYER_PASSWORD || "Buyer123!",
    startRoutes: [
      "/",
      "/marketplace",
      "/auctions",
      "/my-bids",
      "/my-wins",
      "/watchlist",
      "/saved-searches",
    ],
  },
  {
    label: "owner",
    email: process.env.OWNER_EMAIL || "owner1@pawn.local",
    password: process.env.OWNER_PASSWORD || "Owner123!",
    startRoutes: [
      "/",
      "/owner",
      "/owner/dashboard",
      "/owner/inventory",
      "/owner/auctions",
      "/owner/staff",
      "/owner/locations",
      "/owner/subscription",
      "/owner/items/new",
      "/owner/auctions/new",
    ],
  },
  {
    label: "admin",
    email: process.env.ADMIN_EMAIL || "admin1@example.com",
    password: process.env.ADMIN_PASSWORD || "Admin123",
    startRoutes: [
      "/admin",
      "/admin/users",
      "/admin/owners",
      "/admin/shops",
      "/admin/inventory",
      "/admin/auctions",
      "/admin/offers",
      "/admin/subscriptions",
    ],
  },
];

const hardFailStatuses = new Set([404, 500, 502, 503, 504]);

function isInternalHref(href) {
  if (!href) return false;
  if (href.startsWith("mailto:")) return false;
  if (href.startsWith("tel:")) return false;
  if (href.startsWith("#")) return false;
  try {
    const url = new URL(href, baseUrl);
    return url.origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

async function login(page, account) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });

  await page.locator('input[type="email"], input[name="email"]').first().fill(account.email);
  await page.locator('input[type="password"], input[name="password"]').first().fill(account.password);

  await Promise.all([
    page.waitForLoadState("networkidle").catch(() => {}),
    page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")').first().click(),
  ]);

  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (/unable|invalid|error|failed/i.test(bodyText) && /login|auth|credential/i.test(bodyText)) {
    throw new Error(`${account.label} login appears to have failed: ${bodyText.slice(0, 300)}`);
  }
}

async function auditRoute(page, account, route, failures) {
  const url = `${baseUrl}${route}`;
  const response = await page.goto(url, { waitUntil: "networkidle" }).catch((err) => {
    failures.push(`${account.label} ${route} navigation error: ${err.message}`);
    return null;
  });

  if (response && hardFailStatuses.has(response.status())) {
    failures.push(`${account.label} ${route} returned HTTP ${response.status()}`);
    return;
  }

  const title = await page.title().catch(() => "");
  const bodyText = await page.locator("body").innerText().catch(() => "");

  const normalizedBody = `${title}\n${bodyText}`.toLowerCase();

  const explicitRouteNotFound =
    normalizedBody.includes("page not found") ||
    normalizedBody.includes("shop not found.") ||
    normalizedBody.includes("item not found.") ||
    normalizedBody.includes("auction not found.");

  if (explicitRouteNotFound) {
    failures.push(`${account.label} ${route} appears to render a not-found page`);
  }

  const links = await page.locator("a[href]").evaluateAll((anchors) =>
    anchors
      .map((a) => a.href)
      .filter(Boolean)
      .slice(0, 80)
  );

  const uniqueLinks = [...new Set(links)].filter(isInternalHref);

  for (const href of uniqueLinks) {
    const target = new URL(href);
    const targetPath = `${target.pathname}${target.search}`;

    // Avoid logout/destructive/action-like links.
    if (/logout|delete|remove|cancel/i.test(targetPath)) continue;

    const res = await page.goto(`${target.origin}${targetPath}`, { waitUntil: "networkidle" }).catch((err) => {
      failures.push(`${account.label} link ${targetPath} from ${route} navigation error: ${err.message}`);
      return null;
    });

    if (res && hardFailStatuses.has(res.status())) {
      failures.push(`${account.label} link ${targetPath} from ${route} returned HTTP ${res.status()}`);
    }

    await page.waitForTimeout(2500);

    const pageText = await page.locator("body").innerText().catch(() => "");
    const normalizedText = pageText.toLowerCase();

    const explicitNotFound =
      normalizedText.includes("page not found") ||
      normalizedText.includes("shop not found.") ||
      normalizedText.includes("item not found.") ||
      normalizedText.includes("auction not found.");

    if (explicitNotFound) {
      failures.push(`${account.label} link ${targetPath} from ${route} appears not found`);
    }

    await page.goto(url, { waitUntil: "networkidle" }).catch(() => {});
  }
}

const browser = await chromium.launch({ headless: true });
const failures = [];

for (const account of accounts) {
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on("pageerror", (err) => {
    failures.push(`${account.label} page error: ${err.message}`);
  });

  page.on("response", (response) => {
    const status = response.status();
    const url = response.url();
    if (hardFailStatuses.has(status) && url.startsWith(baseUrl)) {
      failures.push(`${account.label} HTTP ${status}: ${url}`);
    }
  });

  console.log(`\nAuditing ${account.label} routes...`);
  await login(page, account);

  for (const route of account.startRoutes) {
    console.log(`- ${account.label}: ${route}`);
    await auditRoute(page, account, route, failures);
  }

  await context.close();
}

await browser.close();

const uniqueFailures = [...new Set(failures)];

if (uniqueFailures.length) {
  console.error("\n❌ Route click audit failures:");
  for (const failure of uniqueFailures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("\n✅ Route click audit passed.");
