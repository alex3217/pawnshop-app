import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const WEB_BASE = process.env.WEB_BASE || "http://127.0.0.1:5176";
const API_BASE = process.env.API_BASE || "http://127.0.0.1:6002/api";
const OWNER_EMAIL = process.env.OWNER_EMAIL || "owner1@pawn.local";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "Owner123!";
const OUT = process.env.OUT || `reports/owner-auctions-authenticated-audit-${Date.now()}`;

fs.mkdirSync(OUT, { recursive: true });

function writeJson(name, data) {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 2));
}

async function apiLogin() {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD }),
  });

  const json = await response.json().catch(() => ({}));
  const token =
    json.token ||
    json.accessToken ||
    json.access_token ||
    json.jwt ||
    json.data?.token ||
    json.data?.accessToken ||
    json.data?.access_token ||
    "";

  return {
    ok: response.ok,
    status: response.status,
    token,
    json,
  };
}

async function apiGet(pathname, token) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const body = await response.text();
  let json = null;

  try {
    json = JSON.parse(body);
  } catch {
    json = body;
  }

  return {
    ok: response.ok,
    status: response.status,
    json,
  };
}

async function injectAuth(page, token) {
  await page.goto(WEB_BASE, { waitUntil: "domcontentloaded" });

  await page.evaluate(
    ({ token, email }) => {
      const authPayload = {
        token,
        accessToken: token,
        email,
        role: "OWNER",
        user: {
          email,
          role: "OWNER",
        },
      };

      const tokenKeys = [
        "token",
        "authToken",
        "accessToken",
        "jwt",
        "pawnshop_token",
        "pawnshop-auth-token",
        "pawnshop.auth.token",
        "auth.token",
      ];

      for (const key of tokenKeys) {
        localStorage.setItem(key, token);
      }

      const objectKeys = [
        "auth",
        "user",
        "pawnshop-auth",
        "pawnshop.auth",
        "authUser",
      ];

      for (const key of objectKeys) {
        localStorage.setItem(key, JSON.stringify(authPayload));
      }

      localStorage.setItem("role", "OWNER");
      localStorage.setItem("email", email);
    },
    { token, email: OWNER_EMAIL },
  );
}

async function collectVisibleActions(page) {
  return page.evaluate(() => {
    function text(el) {
      return String(el.innerText || el.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
    }

    function box(el) {
      const rect = el.getBoundingClientRect();
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    }

    return Array.from(document.querySelectorAll("button, a"))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const visible =
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          Number(style.opacity) !== 0;

        return {
          tag: el.tagName.toLowerCase(),
          text: text(el),
          href: el.getAttribute("href"),
          dataAttrs: Array.from(el.attributes)
            .filter((attr) => attr.name.startsWith("data-"))
            .map((attr) => `${attr.name}=${attr.value}`),
          disabled: Boolean(el.disabled),
          visible,
          box: box(el),
        };
      })
      .filter((item) => item.visible);
  });
}

async function collectPageSignals(page) {
  return page.evaluate(() => {
    const bodyText = document.body.innerText || "";

    return {
      title: document.title,
      url: window.location.href,
      markerCounts: {
        settlementSummary: document.querySelectorAll(
          "[data-owner-auction-settlement-summary]",
        ).length,
        fulfillmentControls: document.querySelectorAll(
          "[data-owner-auction-fulfillment-controls]",
        ).length,
        relistButtons: document.querySelectorAll("[data-owner-auction-relist]").length,
      },
      textSignals: {
        hasOwnerAuctions: /Owner|auction/i.test(bodyText),
        hasSettlementSummary: bodyText.includes("Settlement Summary"),
        hasReadyForPickup: bodyText.includes("Ready for pickup"),
        hasMarkCompleted: bodyText.includes("Mark completed"),
        hasPaymentStatus: /Payment status|Status:/i.test(bodyText),
        hasWinner: /Winner:/i.test(bodyText),
        hasFinalAmount: /Final amount:/i.test(bodyText),
        hasSettlementId: /Settlement ID:/i.test(bodyText),
        hasNoSettlementWarning: bodyText.includes("No settlement is attached yet"),
        hasRelist: bodyText.includes("Relist"),
        stillOnLogin: window.location.pathname.includes("/login"),
      },
      bodyPreview: bodyText.replace(/\s+/g, " ").trim().slice(0, 3500),
    };
  });
}

const login = await apiLogin();

writeJson("api-login.json", {
  ok: login.ok,
  status: login.status,
  tokenPresent: Boolean(login.token),
});

if (!login.ok || !login.token) {
  console.error("Owner API login failed.");
  console.error(JSON.stringify(login, null, 2));
  process.exit(1);
}

const [auctionsMine, settlementsMine] = await Promise.all([
  apiGet("/auctions/mine?limit=25", login.token),
  apiGet("/settlements/mine", login.token),
]);

writeJson("api-auctions-mine.json", auctionsMine);
writeJson("api-settlements-mine.json", settlementsMine);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });

await injectAuth(page, login.token);

await page.goto(`${WEB_BASE}/owner/auctions`, {
  waitUntil: "networkidle",
});

await page.screenshot({
  path: path.join(OUT, "owner-auctions-full.png"),
  fullPage: true,
});

const actions = await collectVisibleActions(page);
const signals = await collectPageSignals(page);

writeJson("visible-actions.json", actions);
writeJson("page-signals.json", signals);

const buttons = actions
  .filter((item) => item.tag === "button")
  .map((item) => ({
    text: item.text,
    disabled: item.disabled,
    dataAttrs: item.dataAttrs,
    box: item.box,
  }));

const links = actions
  .filter((item) => item.tag === "a")
  .map((item) => ({
    text: item.text,
    href: item.href,
    dataAttrs: item.dataAttrs,
    box: item.box,
  }));

const issues = [];

if (signals.textSignals.stillOnLogin) {
  issues.push("Still on login after auth injection.");
}

if (!signals.textSignals.hasSettlementSummary) {
  issues.push("Missing visible Settlement Summary text.");
}

if (signals.markerCounts.fulfillmentControls === 0) {
  issues.push(
    "No owner fulfillment controls rendered. This is only acceptable if no CHARGED settlements are visible.",
  );
}

if (!buttons.some((button) => /refresh/i.test(button.text))) {
  issues.push("No visible refresh button found.");
}

if (
  signals.markerCounts.fulfillmentControls > 0 &&
  !buttons.some((button) => /ready for pickup/i.test(button.text))
) {
  issues.push("Fulfillment controls exist but Ready for pickup button was not found.");
}

if (
  signals.markerCounts.fulfillmentControls > 0 &&
  !buttons.some((button) => /mark completed/i.test(button.text))
) {
  issues.push("Fulfillment controls exist but Mark completed button was not found.");
}

const summary = {
  url: signals.url,
  markerCounts: signals.markerCounts,
  textSignals: signals.textSignals,
  buttons,
  links: links.slice(0, 40),
  api: {
    auctionsMineStatus: auctionsMine.status,
    settlementsMineStatus: settlementsMine.status,
    chargedSettlements:
      Array.isArray(settlementsMine.json)
        ? settlementsMine.json.filter((row) => String(row.status).toUpperCase() === "CHARGED").length
        : null,
  },
  issues,
  reportDir: OUT,
};

writeJson("audit-summary.json", summary);

console.log("===== OWNER AUCTIONS AUTHENTICATED AUDIT SUMMARY =====");
console.log(JSON.stringify(summary, null, 2));

await browser.close();
