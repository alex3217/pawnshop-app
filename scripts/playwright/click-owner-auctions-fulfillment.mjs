import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const WEB_BASE = process.env.WEB_BASE || "http://127.0.0.1:5176";
const API_BASE = process.env.API_BASE || "http://127.0.0.1:6002/api";
const OWNER_EMAIL = process.env.OWNER_EMAIL || "owner1@pawn.local";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "Owner123!";
const OUT = process.env.OUT || `reports/owner-auctions-fulfillment-click-${Date.now()}`;

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

if (!token) {
  throw new Error("Owner login failed. No token returned.");
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1600 } });

await injectAuth(page, token);
await page.goto(`${WEB_BASE}/owner/auctions`, { waitUntil: "networkidle" });

const before = await page.evaluate(() => document.body.innerText);
const readyButton = page
  .locator("[data-owner-auction-fulfillment-controls]")
  .getByRole("button", { name: /ready for pickup/i })
  .first();

if (!(await readyButton.count())) {
  throw new Error("No Ready for pickup button found.");
}

await readyButton.click();
await page.waitForTimeout(1000);

const afterReady = await page.evaluate(() => document.body.innerText);

await page.screenshot({
  path: path.join(OUT, "after-ready-for-pickup.png"),
  fullPage: true,
});

const completedButton = page
  .locator("[data-owner-auction-fulfillment-controls]")
  .getByRole("button", { name: /mark completed/i })
  .first();

if (!(await completedButton.count())) {
  throw new Error("No Mark completed button found.");
}

await completedButton.click();
await page.waitForTimeout(1000);

const afterCompleted = await page.evaluate(() => document.body.innerText);

await page.screenshot({
  path: path.join(OUT, "after-mark-completed.png"),
  fullPage: true,
});

const result = {
  success: true,
  url: page.url(),
  beforeHadPaymentPending: before.includes("PAYMENT PENDING"),
  afterReadyHasReadyForPickup: afterReady.includes("READY FOR PICKUP"),
  afterCompletedHasCompleted: afterCompleted.includes("COMPLETED"),
  reportDir: OUT,
};

fs.writeFileSync(path.join(OUT, "click-result.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));

await browser.close();
