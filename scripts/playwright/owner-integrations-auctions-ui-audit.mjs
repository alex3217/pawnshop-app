import { chromium } from "playwright";

const WEB_BASE = process.env.WEB_BASE || "http://127.0.0.1:5176";
const OWNER_EMAIL = process.env.OWNER_EMAIL || "owner1@pawn.local";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "Owner123!";

const origin = new URL(WEB_BASE).origin;
const errors = [];

function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function sameOrigin(href) {
  if (!href) return true;
  try {
    return new URL(href, WEB_BASE).origin === origin;
  } catch {
    return false;
  }
}

async function seedOwnerAuth(page) {
  const response = await page.request.post(`${WEB_BASE}/api/auth/login`, {
    data: {
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
    },
  });

  if (!response.ok()) {
    throw new Error(`Owner login failed: ${response.status()} ${await response.text()}`);
  }

  const payload = await response.json();
  const nested = payload?.data && typeof payload.data === "object" ? payload.data : {};
  const token =
    payload?.token ||
    payload?.accessToken ||
    nested?.token ||
    nested?.accessToken ||
    "";
  const user = payload?.user || nested?.user || payload?.profile || nested?.profile;

  if (!token || !user?.role) {
    throw new Error(`Owner login missing token/user: ${JSON.stringify(payload, null, 2)}`);
  }

  await page.goto(WEB_BASE, { waitUntil: "networkidle" });

  await page.evaluate(
    ({ token, user }) => {
      localStorage.setItem("auth_token", token);
      localStorage.setItem("auth_role", user.role);
      localStorage.setItem("auth_user", JSON.stringify(user));
      localStorage.setItem("owner_token", token);
    },
    { token, user },
  );
}

async function auditPage(page, path, expectedText, expectedRoutes) {
  console.log(`\n===== AUDIT ${path} =====`);

  await page.goto(`${WEB_BASE}${path}`, { waitUntil: "networkidle" });

  const bodyText = normalize(await page.locator("body").innerText());
  const bodyTextLower = bodyText.toLowerCase();

  const controlText = normalize(
    await page.locator("a,button,input,select,textarea").evaluateAll((elements) =>
      elements
        .map((element) =>
          [
            element.innerText || element.textContent || "",
            element.getAttribute("aria-label") || "",
            element.getAttribute("placeholder") || "",
            element.getAttribute("value") || "",
          ].join(" "),
        )
        .join(" "),
    ),
  );
  const controlTextLower = controlText.toLowerCase();


  // Owner Auctions UX V2 clutter guard:
  // ended/canceled auctions should not spam owner action buttons.
  if (path === "/owner/auctions") {
    const actionButtons = await page
      .locator("button", { hasText: /Cancel Auction|End Auction/i })
      .count();

    const closedNotes = await page
      .locator("[data-owner-auction-closed='true']")
      .count();

    console.log(`Owner Auctions UX V2 clutter guard: ${actionButtons} active action buttons, ${closedNotes} closed notes`);

    if (closedNotes > 0 && actionButtons > 12) {
      errors.push(`${path}: too many active Cancel/End buttons shown on closed auctions`);
    }
  }

  for (const expected of expectedText) {
    const needle = normalize(expected).toLowerCase();
    const ok = bodyTextLower.includes(needle) || controlTextLower.includes(needle);
    console.log(`${ok ? "✅" : "❌"} visible text: ${expected}`);
    if (!ok) errors.push(`${path}: missing visible text "${expected}"`);
  }

  const links = await page.locator("a").evaluateAll((anchors) =>
    anchors.map((anchor) => ({
      text: (anchor.innerText || anchor.textContent || "").trim(),
      href: anchor.href || anchor.getAttribute("href") || "",
    })),
  );

  for (const route of expectedRoutes) {
    const ok = links.some((link) => {
      if (!link.href) return false;
      const url = new URL(link.href, WEB_BASE);
      return url.pathname === route;
    });

    console.log(`${ok ? "✅" : "❌"} visible link route: ${route}`);
    if (!ok) errors.push(`${path}: missing link route "${route}"`);

    const response = await page.request.get(`${WEB_BASE}${route}`);
    if (response.status() >= 400) {
      errors.push(`${path}: route "${route}" returned ${response.status()}`);
    }
  }

  for (const link of links) {
    if (link.href && !sameOrigin(link.href)) {
      errors.push(`${path}: off-origin link ${link.href}`);
    }
  }

  const buttons = await page.locator("button").evaluateAll((buttons) =>
    buttons.map((button) => (button.innerText || button.textContent || "").trim()).filter(Boolean),
  );

  console.log("Visible buttons:");
  for (const button of buttons) console.log(`- ${button}`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await seedOwnerAuth(page);

  await auditPage(
    page,
    "/owner/integrations",
    [
      "Integration Command Center",
      "Search integrations",
      "Status Filter",
      "Provider Filter",
      "Connect Integration",
      "Sync Now",
      "Test",
      "View Jobs",
      "View Mappings",
      "Add Mapping",
      "Archive/Delete",
      "Field mappings",
    ],
    ["/owner/integrations", "/owner/inventory"],
  );

  await auditPage(
    page,
    "/owner/auctions",
    [
      "Auction Command Center",
      "Daily Auction Controls",
      "Search auctions",
      "Create Auction",
      "Inventory",
      "Export CSV",
    "Auction closed",
        ],
    ["/owner/auctions/new", "/owner/inventory"],
  );

  console.log("\n===== RESULT =====");

  if (errors.length) {
    for (const error of errors) console.error(`❌ ${error}`);
    process.exitCode = 1;
  } else {
    console.log("✅ OWNER INTEGRATIONS + AUCTIONS UI AUDIT PASSED");
  }
} finally {
  await browser.close();
}
