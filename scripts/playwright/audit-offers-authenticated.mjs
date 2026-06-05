import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const WEB_BASE = process.env.WEB_BASE || "http://127.0.0.1:5176";
const API_BASE = process.env.API_BASE || "http://127.0.0.1:6002/api";
const OWNER_EMAIL = process.env.OWNER_EMAIL || "owner1@pawn.local";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "Owner123!";
const OUT = process.env.OUT || `reports/offers-authenticated-audit-${Date.now()}`;

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
      const payload = {
        token,
        accessToken: token,
        email,
        role: "OWNER",
        user: { email, role: "OWNER" },
      };

      for (const key of ["token", "authToken", "accessToken", "jwt"]) {
        localStorage.setItem(key, token);
      }

      for (const key of ["auth", "user", "authUser", "pawnshop-auth"]) {
        localStorage.setItem(key, JSON.stringify(payload));
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
        offerFulfillmentControls: document.querySelectorAll(
          "[data-offer-fulfillment-controls]",
        ).length,
      },
      textSignals: {
        hasOwnerOfferCenter: bodyText.toLowerCase().includes("owner offer center"),
        hasAccepted: bodyText.includes("ACCEPTED"),
        hasSettlement: bodyText.includes("Settlement"),
        hasPaymentCharged: bodyText.includes("CHARGED"),
        hasFulfillment: bodyText.includes("Fulfillment"),
        hasReadyForPickup: bodyText.includes("Ready for pickup"),
        hasMarkCompleted: bodyText.includes("Mark completed"),
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

const ownerOffers = await apiGet("/offers/owner", login.token);
writeJson("api-offers-owner.json", ownerOffers);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });

await injectAuth(page, login.token);

await page.goto(`${WEB_BASE}/offers`, {
  waitUntil: "networkidle",
});

await page.screenshot({
  path: path.join(OUT, "offers-full.png"),
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

const offersArray = Array.isArray(ownerOffers.json)
  ? ownerOffers.json
  : ownerOffers.json?.rows || ownerOffers.json?.offers || ownerOffers.json?.data || [];

const chargedAcceptedOffers = Array.isArray(offersArray)
  ? offersArray.filter((offer) => {
      const status = String(offer.status || "").toUpperCase();
      const settlementStatus = String(offer.settlement?.status || "").toUpperCase();
      return status === "ACCEPTED" && settlementStatus === "CHARGED";
    }).length
  : null;

const issues = [];

if (signals.textSignals.stillOnLogin) {
  issues.push("Still on login after auth injection.");
}

if (!signals.textSignals.hasOwnerOfferCenter) {
  issues.push("Owner offer center text not visible.");
}

if (chargedAcceptedOffers && signals.markerCounts.offerFulfillmentControls === 0) {
  issues.push("Charged accepted offers exist, but no fulfillment controls rendered.");
}

if (
  signals.markerCounts.offerFulfillmentControls > 0 &&
  !buttons.some((button) => /ready for pickup/i.test(button.text))
) {
  issues.push("Fulfillment controls exist but Ready for pickup button was not found.");
}

if (
  signals.markerCounts.offerFulfillmentControls > 0 &&
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
    ownerOffersStatus: ownerOffers.status,
    chargedAcceptedOffers,
  },
  issues,
  reportDir: OUT,
};

writeJson("audit-summary.json", summary);

console.log("===== OFFERS AUTHENTICATED AUDIT SUMMARY =====");
console.log(JSON.stringify(summary, null, 2));

await browser.close();
