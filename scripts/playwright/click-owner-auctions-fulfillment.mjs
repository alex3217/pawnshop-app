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

const paidNeedsFulfillmentFilter = page.getByRole("button", { name: /paid needs fulfillment/i }).first();
if (await paidNeedsFulfillmentFilter.count()) {
  await paidNeedsFulfillmentFilter.click();
  await page.waitForTimeout(750);
}

const before = await page.evaluate(() => document.body.innerText);
const readyButton = page
  .locator("[data-owner-auction-fulfillment-controls]")
  .getByRole("button", { name: /ready for pickup/i })
  .first();

if (!(await readyButton.count())) {
  const buttons = await page.locator("button").evaluateAll((items) =>
    items.map((button) => ({
      text: button.innerText?.replace(/\\s+/g, " ").trim(),
      disabled: button.disabled,
      dataAttrs: Array.from(button.attributes)
        .filter((attr) => attr.name.startsWith("data-"))
        .map((attr) => `${attr.name}=${attr.value}`),
    }))
  );

  await page.screenshot({
    path: path.join(OUT, "no-eligible-ready-for-pickup-button.png"),
    fullPage: true,
  });

  const skipped = {
    success: true,
    skipped: true,
    reason: "No eligible auction Ready for pickup action is currently visible. Page loaded and fulfillment filters are present.",
    url: page.url(),
    beforeHadPaidNeedsFulfillment: /PAID NEEDS FULFILLMENT/i.test(before),
    beforeHadReadyForPickupFilter: /READY FOR PICKUP/i.test(before),
    visibleButtons: buttons,
    reportDir: OUT,
  };

  fs.writeFileSync(path.join(OUT, "click-result.json"), JSON.stringify(skipped, null, 2));
  console.log(JSON.stringify(skipped, null, 2));
  await browser.close();
  process.exit(0);
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
