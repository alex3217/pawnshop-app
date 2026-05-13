import { chromium } from "playwright";

const WEB_BASE = process.env.WEB_BASE || "http://127.0.0.1:5176";
const OWNER_EMAIL = process.env.OWNER_EMAIL || "owner1@pawn.local";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "Owner123!";

const origin = new URL(WEB_BASE).origin;
const errors = [];
const warnings = [];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function includesText(elements, expected) {
  const needle = normalize(expected).toLowerCase();

  return elements.some((entry) => {
    const haystack = normalize(
      [entry.text, entry.ariaLabel, entry.placeholder, entry.value].filter(Boolean).join(" "),
    ).toLowerCase();

    return haystack.includes(needle);
  });
}

function sameOrigin(href) {
  if (!href) return true;

  try {
    const url = new URL(href, WEB_BASE);
    return url.origin === origin;
  } catch {
    return false;
  }
}

async function collectElements(page) {
  return page.locator("a,button,input,select,textarea").evaluateAll((elements) =>
    elements.map((element) => {
      const style = window.getComputedStyle(element);
      const visible =
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        Boolean(element.offsetWidth || element.offsetHeight || element.getClientRects().length);

      return {
        tag: element.tagName.toLowerCase(),
        text: (element.innerText || element.textContent || "").trim(),
        value: element.value || "",
        placeholder: element.getAttribute("placeholder") || "",
        ariaLabel: element.getAttribute("aria-label") || "",
        href: element.href || element.getAttribute("href") || "",
        disabled:
          Boolean(element.disabled) ||
          element.getAttribute("aria-disabled") === "true" ||
          element.getAttribute("disabled") !== null,
        visible,
      };
    }),
  );
}

async function ensureOwnerShop(page, token) {
  const headers = { Authorization: `Bearer ${token}` };

  const response = await page.request.get(`${WEB_BASE}/api/shops/mine`, {
    headers,
  });

  if (!response.ok()) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to check owner shops: ${response.status()} ${body}`);
  }

  const payload = await response.json();

  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.rows)
      ? payload.rows
      : Array.isArray(payload.shops)
        ? payload.shops
        : Array.isArray(payload.data)
          ? payload.data
          : [];

  if (rows.length > 0) {
    console.log(`Owner shop check: ${rows.length} shop(s) found.`);
    return;
  }

  console.log("Owner shop check: no shops found. Creating audit shop so /owner dashboard can render.");

  const createResponse = await page.request.post(`${WEB_BASE}/api/shops`, {
    headers,
    data: {
      name: `Owner Audit Shop ${Date.now()}`,
      address: "123 Audit Street",
      phone: "555-0100",
      description: "Created automatically by owner button/link audit.",
      hours: "Mon-Fri 9am-5pm",
    },
  });

  if (!createResponse.ok()) {
    const body = await createResponse.text().catch(() => "");
    throw new Error(`Failed to create owner audit shop: ${createResponse.status()} ${body}`);
  }

  console.log("✅ Owner audit shop created.");
}

async function login(page) {
  console.log(`Logging in owner through API: ${OWNER_EMAIL}`);

  const response = await page.request.post(`${WEB_BASE}/api/auth/login`, {
    data: {
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
    },
  });

  if (!response.ok()) {
    const text = await response.text().catch(() => "");
    throw new Error(`Owner API login failed: ${response.status()} ${text}`);
  }

  const payload = await response.json();

  const nested = payload?.data && typeof payload.data === "object" ? payload.data : {};
  const token =
    payload?.token ||
    payload?.accessToken ||
    nested?.token ||
    nested?.accessToken ||
    "";

  const user =
    payload?.user ||
    nested?.user ||
    nested?.profile ||
    payload?.profile ||
    null;

  if (!token || !user?.role) {
    throw new Error(`Owner API login response missing token/user: ${JSON.stringify(payload, null, 2)}`);
  }

  await ensureOwnerShop(page, token);

  await page.goto(WEB_BASE, { waitUntil: "networkidle" });

  await page.evaluate(
    ({ token, user }) => {
      window.localStorage.setItem("auth_token", token);
      window.localStorage.setItem("auth_role", user.role);
      window.localStorage.setItem("auth_user", JSON.stringify(user));
      window.localStorage.setItem("owner_token", token);

      window.localStorage.removeItem("consumer_token");
      window.localStorage.removeItem("admin_token");
      window.localStorage.removeItem("super_admin_token");
      window.localStorage.removeItem("token");
      window.localStorage.removeItem("accessToken");
      window.sessionStorage.removeItem("token");
    },
    { token, user },
  );

  await page.goto(`${WEB_BASE}/owner`, { waitUntil: "networkidle" });

  const currentPath = new URL(page.url()).pathname;
  console.log(`After API login URL: ${page.url()}`);

  if (currentPath === "/login") {
    const visibleText = await page.locator("body").innerText().catch(() => "");
    const storage = await page.evaluate(() => ({
      localStorage: Object.fromEntries(Object.entries(window.localStorage)),
      sessionStorage: Object.fromEntries(Object.entries(window.sessionStorage)),
    }));

    console.error("❌ Owner API login seeded storage, but app still redirected to /login.");
    console.error("Visible page text:");
    console.error(visibleText.slice(0, 1500));
    console.error("Browser storage:");
    console.error(JSON.stringify(storage, null, 2));

    throw new Error("Owner auth seeding failed. Check RequireRole/auth storage keys.");
  }
}

async function auditPage(page, pageConfig) {
  console.log(`\n===== AUDIT ${pageConfig.path} =====`);

  await page.goto(`${WEB_BASE}${pageConfig.path}`, { waitUntil: "networkidle" });

  const elements = await collectElements(page);
  const visibleElements = elements.filter((entry) => entry.visible);
  const bodyText = normalize(await page.locator("body").innerText().catch(() => ""));
  const bodyTextLower = bodyText.toLowerCase();

  console.log(`Visible controls/fields found: ${visibleElements.length}`);

  for (const expected of pageConfig.expectedText) {
    const needle = normalize(expected).toLowerCase();
    const ok = bodyTextLower.includes(needle) || includesText(visibleElements, expected);
    console.log(`${ok ? "✅" : "❌"} visible text/control: ${expected}`);
    if (!ok) errors.push(`${pageConfig.path}: missing visible text/control "${expected}"`);
  }

  for (const expectedPath of pageConfig.expectedRoutes) {
    const matchingLinks = visibleElements.filter((entry) => {
      if (entry.tag !== "a" || !entry.href) return false;
      const url = new URL(entry.href, WEB_BASE);
      return url.pathname === expectedPath;
    });

    const ok = matchingLinks.length > 0;
    console.log(`${ok ? "✅" : "❌"} visible link route: ${expectedPath}`);

    if (!ok) {
      errors.push(`${pageConfig.path}: missing visible link to "${expectedPath}"`);
      continue;
    }

    for (const link of matchingLinks) {
      if (!sameOrigin(link.href)) {
        errors.push(`${pageConfig.path}: external/off-origin link "${link.href}"`);
      }
    }

    const response = await page.request.get(`${WEB_BASE}${expectedPath}`);
    const status = response.status();

    if (status >= 400) {
      errors.push(`${pageConfig.path}: route "${expectedPath}" returned ${status}`);
      console.log(`❌ route request: ${expectedPath} -> ${status}`);
    } else {
      console.log(`✅ route request: ${expectedPath} -> ${status}`);
    }
  }

  const badLinks = visibleElements.filter(
    (entry) => entry.tag === "a" && entry.href && !sameOrigin(entry.href),
  );

  for (const link of badLinks) {
    errors.push(`${pageConfig.path}: link is not same-origin: ${link.href}`);
  }

  const hashOnlyLinks = visibleElements.filter((entry) => {
    if (entry.tag !== "a" || !entry.href) return false;
    const url = new URL(entry.href, WEB_BASE);
    return url.hash && url.pathname === new URL(page.url()).pathname;
  });

  for (const link of hashOnlyLinks) {
    warnings.push(`${pageConfig.path}: hash-only link found: ${link.text || link.href}`);
  }

  const visibleButtons = visibleElements.filter((entry) => entry.tag === "button");
  const disabledButtons = visibleButtons.filter((entry) => entry.disabled);

  console.log("\nVisible buttons:");
  for (const button of visibleButtons) {
    console.log(`- ${normalize(button.text || button.ariaLabel || button.value) || "(unnamed button)"}${button.disabled ? " [disabled]" : ""}`);
  }

  console.log("\nVisible links:");
  for (const link of visibleElements.filter((entry) => entry.tag === "a")) {
    const url = link.href ? new URL(link.href, WEB_BASE) : null;
    console.log(`- ${normalize(link.text || link.ariaLabel) || "(unnamed link)"} -> ${url ? url.pathname : "(no href)"}`);
  }

  if (disabledButtons.length) {
    console.log(`\nℹ️ Disabled buttons visible: ${disabledButtons.length}`);
  }
}

const pages = [
  {
    path: "/owner",
    expectedText: [
      "Owner Command Center",
      "Shop Operating Hub",
      "Shop Health",
      "Inventory Health",
      "Revenue / Offers / Auctions",
      "Operations",
      "Add Item",
      "Bulk Upload",
      "Scan Console",
      "Create Auction",
      "Integrations",
      "Offers",
      "Auctions",
      "Settlements",
      "Staff",
      "Locations",
      "Subscription",
    ],
    expectedRoutes: [
      "/owner/items/new",
      "/owner/bulk-upload",
      "/owner/scan-console",
      "/owner/auctions/new",
      "/owner/integrations",
      "/offers",
      "/owner/auctions",
      "/settlements",
      "/owner/staff",
      "/owner/locations",
      "/owner/subscription",
    ],
  },
  {
    path: "/owner/inventory",
    expectedText: [
      "Inventory Command Center",
      "Daily Inventory Controls",
      "Search",
      "Add Item",
      "Bulk Upload",
      "Scan Console",
      "Export CSV",
      "Refresh",
      "View",
      "Edit",
      "Mark Sold",
      "Delete / Archive",
    ],
    expectedRoutes: [
      "/owner/items/new",
      "/owner/bulk-upload",
      "/owner/scan-console",
    ],
  },
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await login(page);

  for (const pageConfig of pages) {
    await auditPage(page, pageConfig);
  }

  console.log("\n===== WARNINGS =====");
  if (warnings.length === 0) {
    console.log("No warnings.");
  } else {
    for (const warning of warnings) console.log(`⚠️ ${warning}`);
  }

  console.log("\n===== RESULT =====");
  if (errors.length > 0) {
    for (const error of errors) console.error(`❌ ${error}`);
    process.exitCode = 1;
  } else {
    console.log("✅ OWNER BUTTON/LINK UI AUDIT PASSED");
  }
} finally {
  await browser.close();
}
