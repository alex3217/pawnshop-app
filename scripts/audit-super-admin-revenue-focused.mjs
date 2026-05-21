import { chromium } from "playwright";
import fs from "node:fs";

const outDir = "reports/super-admin-revenue-focused-audit";
fs.mkdirSync(outDir, { recursive: true });

const BASE = "http://127.0.0.1:6002/api";
const WEB = "http://127.0.0.1:5176";
const email = process.env.SUPER_ADMIN_EMAIL || "superadmin@pawn.local";
const password = process.env.SUPER_ADMIN_PASSWORD || "SuperAdmin123!";

const expected = [
  "Revenue",
  "Commission",
  "Platform",
  "Settlement",
  "Payout",
  "Refresh",
  "Export",
  "Status",
  "Date",
];

async function loginToken() {
  for (const endpoint of ["/super-admin/login", "/admin/login", "/auth/login"]) {
    const response = await fetch(`${BASE}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const json = await response.json().catch(() => ({}));
    const token = json.token || json.accessToken || json.data?.token || json.data?.accessToken;
    if (response.ok && token) return token;
  }

  throw new Error("Super Admin login failed.");
}

async function inspect(theme, token) {
  const browser = await chromium.launch({ headless: true, args: ["--disable-gpu"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });

  await context.addInitScript(({ theme, token }) => {
    try {
      localStorage.setItem("pawnloop-theme-v2", theme);
      localStorage.setItem("token", token);
      localStorage.setItem("authToken", token);
      localStorage.setItem("accessToken", token);
      localStorage.setItem("pawnloop-token", token);
      localStorage.setItem("pawnloop-auth-token", token);
      localStorage.setItem("role", "SUPER_ADMIN");
      localStorage.setItem("userRole", "SUPER_ADMIN");
    } catch {}
  }, { theme, token });

  const page = await context.newPage();

  await page.goto(`${WEB}/super-admin/revenue?fresh=${Date.now()}`, {
    waitUntil: "networkidle",
  });

  const result = await page.evaluate((expected) => {
    const bodyText = document.body.innerText || "";
    const lower = bodyText.toLowerCase();

    const controls = Array.from(document.querySelectorAll("a, button, input, select, textarea"))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const styles = window.getComputedStyle(el);
        const text = (el.textContent || el.getAttribute("placeholder") || "")
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 140);

        return {
          tag: el.tagName,
          text,
          href: el.getAttribute("href"),
          disabled: "disabled" in el ? el.disabled : null,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          color: styles.color,
          backgroundColor: styles.backgroundColor,
          className: String(el.getAttribute("class") || "").slice(0, 140),
        };
      })
      .filter((item) => item.width > 0 && item.height > 0);

    return {
      missing: expected.filter((word) => !lower.includes(String(word).toLowerCase())),
      bodyPreview: bodyText.slice(0, 3500),
      controlCount: controls.length,
      tinyCount: controls.filter((item) => item.width < 44 || item.height < 36).length,
      controls: controls.slice(0, 160),
    };
  }, expected);

  await page.screenshot({
    path: `${outDir}/super-admin-revenue-${theme}.png`,
    fullPage: true,
  });

  await context.close().catch(() => {});
  await browser.close().catch(() => {});

  return { theme, ...result };
}

const token = await loginToken();
const light = await inspect("light", token);
const dark = await inspect("dark", token);

const summary = {
  generatedAt: new Date().toISOString(),
  light: {
    controlCount: light.controlCount,
    tinyCount: light.tinyCount,
    missing: light.missing,
  },
  dark: {
    controlCount: dark.controlCount,
    tinyCount: dark.tinyCount,
    missing: dark.missing,
  },
};

fs.writeFileSync(`${outDir}/summary.json`, JSON.stringify(summary, null, 2));
fs.writeFileSync(`${outDir}/details.json`, JSON.stringify({ light, dark }, null, 2));

console.log(JSON.stringify(summary, null, 2));
