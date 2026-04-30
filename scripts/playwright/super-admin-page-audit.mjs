import { createRequire } from "node:module";

const requireFromWeb = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { chromium } = requireFromWeb("@playwright/test");

const baseUrl = process.env.FRONTEND_URL || "http://127.0.0.1:5176";
const email = process.env.SUPER_ADMIN_EMAIL || "superadmin@pawn.local";
const password = process.env.SUPER_ADMIN_PASSWORD || "SuperAdmin123!";

const routesToCheck = [
  "/super-admin",
  "/super-admin/users",
  "/super-admin/shops",
  "/super-admin/settlements",
  "/super-admin/buyer-subscriptions",
  "/super-admin/platform-settings",
  "/super-admin/inventory",
];

const hardFailStatuses = new Set([404, 500, 502, 503, 504]);
const failures = [];

function isInternalSuperAdminHref(href) {
  if (!href) return false;

  try {
    const url = new URL(href, baseUrl);
    return url.origin === new URL(baseUrl).origin && url.pathname.startsWith("/super-admin");
  } catch {
    return false;
  }
}

function isDangerousPath(pathname) {
  return /delete|remove|destroy|logout|cancel|block|disable/i.test(pathname);
}

async function login(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });

  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"], input[name="password"]').first().fill(password);

  await Promise.all([
    page.waitForLoadState("networkidle").catch(() => {}),
    page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")').first().click(),
  ]);

  await page.waitForTimeout(1000);

  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (/unable|invalid|failed|error/i.test(bodyText) && /login|auth|credential/i.test(bodyText)) {
    throw new Error(`Super Admin login appears to have failed: ${bodyText.slice(0, 400)}`);
  }
}

async function assertHealthyPage(page, label, sourceRoute = "") {
  await page.waitForTimeout(1200);

  const title = await page.title().catch(() => "");
  const bodyText = await page.locator("body").innerText().catch(() => "");
  const normalized = `${title}\n${bodyText}`.toLowerCase();

  const explicitNotFound =
    normalized.includes("page not found") ||
    normalized.includes("route not found") ||
    normalized.includes("super admin page not found") ||
    normalized.includes("not authorized") ||
    normalized.includes("unauthorized") ||
    normalized.includes("forbidden");

  if (explicitNotFound) {
    failures.push(`${label}${sourceRoute ? ` from ${sourceRoute}` : ""} appears invalid/unauthorized`);
  }
}

async function visitRoute(page, route) {
  console.log(`- super-admin: ${route}`);

  const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" }).catch((error) => {
    failures.push(`${route} navigation error: ${error.message}`);
    return null;
  });

  if (response && hardFailStatuses.has(response.status())) {
    failures.push(`${route} returned HTTP ${response.status()}`);
    return;
  }

  await assertHealthyPage(page, route);

  const hrefs = await page.locator("a[href]").evaluateAll((anchors) =>
    anchors.map((anchor) => anchor.href).filter(Boolean),
  );

  const internalLinks = [...new Set(hrefs)]
    .filter(isInternalSuperAdminHref)
    .map((href) => new URL(href))
    .filter((url) => !isDangerousPath(url.pathname));

  for (const url of internalLinks) {
    const targetPath = `${url.pathname}${url.search}`;

    const linkedResponse = await page.goto(`${url.origin}${targetPath}`, {
      waitUntil: "networkidle",
    }).catch((error) => {
      failures.push(`${targetPath} linked from ${route} navigation error: ${error.message}`);
      return null;
    });

    if (linkedResponse && hardFailStatuses.has(linkedResponse.status())) {
      failures.push(`${targetPath} linked from ${route} returned HTTP ${linkedResponse.status()}`);
    }

    await assertHealthyPage(page, targetPath, route);

    await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" }).catch(() => {});
  }
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

page.on("pageerror", (error) => {
  failures.push(`Page error: ${error.message}`);
});

page.on("response", (response) => {
  const status = response.status();
  const url = response.url();

  if (hardFailStatuses.has(status) && url.startsWith(baseUrl)) {
    failures.push(`HTTP ${status}: ${url}`);
  }
});

console.log("\nLogging in as Super Admin...");
await login(page);

console.log("\nAuditing Super Admin pages...");
for (const route of routesToCheck) {
  await visitRoute(page, route);
}

await context.close();
await browser.close();

const uniqueFailures = [...new Set(failures)];

if (uniqueFailures.length) {
  console.error("\n❌ Super Admin page audit failures:");
  for (const failure of uniqueFailures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("\n✅ Super Admin page audit passed.");
