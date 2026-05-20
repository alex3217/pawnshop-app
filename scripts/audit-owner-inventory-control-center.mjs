import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const outDir = "reports/owner-inventory-control-audit";
fs.mkdirSync(outDir, { recursive: true });

const BASE = "http://127.0.0.1:6002/api";
const WEB = "http://127.0.0.1:5176";
const email = process.env.OWNER_EMAIL || "owner1@pawn.local";
const password = process.env.OWNER_PASSWORD || "Owner123!";

const requiredTexts = [
  "Owner Inventory",
  "Add Item",
  "Bulk Upload",
  "Scan Console",
  "Export CSV",
  "Refresh",
  "Inventory Command Center",
  "Total Items",
  "Active",
  "Sold",
  "Showing",
  "Select visible",
  "Clear selection",
  "Bulk mark sold",
  "Bulk delete / archive",
  "Select item",
  "View",
  "Edit",
  "Shop",
  "Create Auction",
  "Mark Sold",
  "Delete / Archive",
];

function parseRgb(value) {
  const match = String(value || "").match(/rgba?\(([^)]+)\)/);
  if (!match) return null;
  const parts = match[1].split(",").map((part) => Number.parseFloat(part.trim()));
  if (parts.length < 3) return null;
  return {
    r: parts[0],
    g: parts[1],
    b: parts[2],
    a: Number.isFinite(parts[3]) ? parts[3] : 1,
  };
}

function luminance({ r, g, b }) {
  const convert = (channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * convert(r) + 0.7152 * convert(g) + 0.0722 * convert(b);
}

function contrastRatio(fg, bg) {
  const L1 = luminance(fg);
  const L2 = luminance(bg);
  const light = Math.max(L1, L2);
  const dark = Math.min(L1, L2);
  return (light + 0.05) / (dark + 0.05);
}

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
    throw new Error(`Owner login failed: HTTP ${response.status} ${JSON.stringify(json)}`);
  }

  return token;
}

async function inspectTheme(theme, token) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });

  await context.addInitScript(
    ({ theme, token }) => {
      localStorage.setItem("pawnloop-theme-v2", theme);
      localStorage.setItem("token", token);
      localStorage.setItem("authToken", token);
      localStorage.setItem("accessToken", token);
      localStorage.setItem("pawnloop-token", token);
      localStorage.setItem("pawnloop-auth-token", token);
      localStorage.setItem("role", "OWNER");
      localStorage.setItem("userRole", "OWNER");
    },
    { theme, token },
  );

  const page = await context.newPage();
  await page.goto(`${WEB}/owner/inventory?fresh=${Date.now()}`, {
    waitUntil: "networkidle",
  });

  const pageData = await page.evaluate((requiredTexts) => {
    function getEffectiveBackground(el) {
      let current = el;
      while (current) {
        const bg = window.getComputedStyle(current).backgroundColor;
        if (bg && !bg.includes("rgba(0, 0, 0, 0)") && bg !== "transparent") return bg;
        current = current.parentElement;
      }
      return window.getComputedStyle(document.body).backgroundColor;
    }

    const bodyText = document.body.innerText || "";
    const normalizedBodyText = bodyText.toLowerCase();
    const missingTexts = requiredTexts.filter(
      (text) => !normalizedBodyText.includes(String(text).toLowerCase()),
    );

    const createAuctionLinks = Array.from(
      document.querySelectorAll('a[href*="/owner/auctions/new?itemId="]'),
    ).map((link) => ({
      text: (link.textContent || "").trim(),
      href: link.getAttribute("href"),
    }));

    const buttonsAndLinks = Array.from(document.querySelectorAll("a, button, input, select"))
      .map((el, index) => {
        const styles = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();

        return {
          index,
          tag: el.tagName,
          text: (el.textContent || el.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 120),
          href: el.getAttribute("href"),
          disabled: "disabled" in el ? el.disabled : null,
          color: styles.color,
          backgroundColor: styles.backgroundColor,
          effectiveBackgroundColor: getEffectiveBackground(el),
          borderColor: styles.borderColor,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          x: Math.round(rect.x),
          y: Math.round(rect.y),
        };
      })
      .filter((item) => item.width > 0 && item.height > 0);

    return {
      url: location.href,
      title: document.title,
      missingTexts,
      createAuctionLinks,
      buttonsAndLinks,
    };
  }, requiredTexts);

  const lowContrast = pageData.buttonsAndLinks
    .map((item) => {
      const fg = parseRgb(item.color);
      const bg = parseRgb(item.effectiveBackgroundColor);
      const ratio = fg && bg ? Number(contrastRatio(fg, bg).toFixed(2)) : null;
      return { ...item, contrastRatio: ratio };
    })
    .filter((item) => {
      const text = String(item.text || "").trim();
      return text && item.contrastRatio !== null && item.contrastRatio < 3;
    });

  await page.screenshot({
    path: path.join(outDir, `owner-inventory-${theme}.png`),
    fullPage: true,
  });

  await browser.close();

  return {
    theme,
    ...pageData,
    lowContrast,
  };
}

async function testAuctionHandoff(token) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });

  await context.addInitScript(
    ({ token }) => {
      localStorage.setItem("pawnloop-theme-v2", "light");
      localStorage.setItem("token", token);
      localStorage.setItem("authToken", token);
      localStorage.setItem("accessToken", token);
      localStorage.setItem("pawnloop-token", token);
      localStorage.setItem("pawnloop-auth-token", token);
      localStorage.setItem("role", "OWNER");
      localStorage.setItem("userRole", "OWNER");
    },
    { token },
  );

  const page = await context.newPage();
  await page.goto(`${WEB}/owner/inventory?fresh=${Date.now()}`, {
    waitUntil: "networkidle",
  });

  const firstHref = await page
    .locator('a[href*="/owner/auctions/new?itemId="]')
    .first()
    .getAttribute("href")
    .catch(() => null);

  if (!firstHref) {
    await browser.close();
    return {
      ok: false,
      reason: "No Create Auction item handoff link found.",
    };
  }

  const expectedItemId = new URL(firstHref, WEB).searchParams.get("itemId");
  await page.goto(new URL(firstHref, WEB).toString(), { waitUntil: "networkidle" });

  const formState = await page.evaluate(() => {
    const select = document.querySelector("select");
    const selectedOption = select?.selectedOptions?.[0];

    return {
      url: location.href,
      selectValue: select?.value || "",
      selectedText: selectedOption?.textContent?.trim() || "",
      hasPreselectedText: (document.body.innerText || "").includes("Preselected from inventory"),
    };
  });

  await page.screenshot({
    path: path.join(outDir, "create-auction-handoff.png"),
    fullPage: true,
  });

  await browser.close();

  return {
    ok: Boolean(expectedItemId && formState.selectValue === expectedItemId),
    expectedItemId,
    ...formState,
  };
}

const token = await loginToken();
const light = await inspectTheme("light", token);
const dark = await inspectTheme("dark", token);
const handoff = await testAuctionHandoff(token);

const summary = {
  generatedAt: new Date().toISOString(),
  light: {
    missingTexts: light.missingTexts,
    createAuctionLinkCount: light.createAuctionLinks.length,
    lowContrastCount: light.lowContrast.length,
    lowContrast: light.lowContrast.slice(0, 25),
  },
  dark: {
    missingTexts: dark.missingTexts,
    createAuctionLinkCount: dark.createAuctionLinks.length,
    lowContrastCount: dark.lowContrast.length,
    lowContrast: dark.lowContrast.slice(0, 25),
  },
  handoff,
  verdict:
    light.missingTexts.length === 0 &&
    dark.missingTexts.length === 0 &&
    light.createAuctionLinks.length > 0 &&
    handoff.ok
      ? "PASS"
      : "REVIEW_NEEDED",
};

fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(outDir, "light.json"), JSON.stringify(light, null, 2));
fs.writeFileSync(path.join(outDir, "dark.json"), JSON.stringify(dark, null, 2));

console.log(JSON.stringify(summary, null, 2));
console.log("");
console.log(`Saved: ${outDir}/summary.json`);
console.log(`Saved: ${outDir}/light.json`);
console.log(`Saved: ${outDir}/dark.json`);
console.log(`Saved screenshots in ${outDir}/`);
