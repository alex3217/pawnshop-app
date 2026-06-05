import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const WEB_BASE = process.env.WEB_BASE || "http://127.0.0.1:5176";
const API_BASE = process.env.API_BASE || "http://127.0.0.1:6002/api";
const OUT = process.env.OUT || "reports/offers-route-probe";
const OWNER_EMAIL = process.env.OWNER_EMAIL || "owner1@pawn.local";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "Owner123!";

fs.mkdirSync(OUT, { recursive: true });

async function login() {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD }),
  });

  const json = await res.json();
  return json.token || json.accessToken || json.data?.token || json.data?.accessToken || "";
}

async function injectAuth(page, token) {
  await page.goto(WEB_BASE, { waitUntil: "domcontentloaded" });

  await page.evaluate(({ token, email }) => {
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
  }, { token, email: OWNER_EMAIL });
}

const token = await login();
if (!token) throw new Error("Owner login failed.");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

await injectAuth(page, token);

for (const route of ["/offers", "/owner/offers", "/buyer/offers"]) {
  await page.goto(`${WEB_BASE}${route}`, { waitUntil: "networkidle" });

  const result = await page.evaluate(() => ({
    url: window.location.href,
    pathname: window.location.pathname,
    body: document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 1500),
    hasOwnerOfferCenter: document.body.innerText.includes("Owner offer center"),
    hasBuyerOfferCenter: document.body.innerText.includes("Buyer offer center"),
    hasOfferActivity: document.body.innerText.includes("Offer activity"),
    hasHomeHero: document.body.innerText.includes("LIVE MARKETPLACE"),
  }));

  fs.writeFileSync(
    path.join(OUT, `route-${route.replaceAll("/", "_") || "root"}.json`),
    JSON.stringify(result, null, 2),
  );

  console.log(route, JSON.stringify(result, null, 2));
}

await browser.close();
