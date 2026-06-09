#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:5176";
const API_BASE = process.env.API_BASE || "http://127.0.0.1:6002/api";

const OUT_DIR =
  process.env.READABILITY_OUT ||
  path.join("reports", `readability-audit-${new Date().toISOString().replace(/[:.]/g, "-")}`);

const THEMES = (process.env.READABILITY_THEMES || "light,dark")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const MAX_ISSUES_PER_PAGE = Number(process.env.READABILITY_MAX_ISSUES || 250);

const CREDENTIALS = {
  public: null,
  buyer: {
    email: process.env.BUYER_EMAIL || "buyer@pawn.local",
    passwords: [process.env.BUYER_PASSWORD || "Buyer123!"],
  },
  owner: {
    email: process.env.OWNER_EMAIL || "owner1@pawn.local",
    passwords: [process.env.OWNER_PASSWORD || "Owner123!"],
  },
  admin: {
    email: process.env.ADMIN_EMAIL || "admin1@example.com",
    passwords: [
      process.env.ADMIN_PASSWORD,
      "Admin123!",
      "Admin123",
    ].filter(Boolean),
  },
  superAdmin: process.env.SUPER_ADMIN_EMAIL
    ? {
        email: process.env.SUPER_ADMIN_EMAIL,
        passwords: [process.env.SUPER_ADMIN_PASSWORD].filter(Boolean),
      }
    : null,
};

const ROUTES = [
  // Public / buyer-facing
  { role: "public", name: "home", path: "/" },
  { role: "public", name: "marketplace", path: "/marketplace" },
  { role: "public", name: "shops", path: "/shops" },
  { role: "public", name: "auctions", path: "/auctions" },
  { role: "public", name: "login", path: "/login" },
  { role: "public", name: "register", path: "/register" },

  // Buyer
  { role: "buyer", name: "buyer-dashboard", path: "/buyer/dashboard" },
  { role: "buyer", name: "buyer-item-locator", path: "/buyer/item-locator" },
  { role: "buyer", name: "buyer-sell-item", path: "/buyer/sell-item" },
  { role: "buyer", name: "my-bids", path: "/my-bids" },
  { role: "buyer", name: "my-wins", path: "/my-wins" },
  { role: "buyer", name: "offers", path: "/offers" },
  { role: "buyer", name: "watchlist", path: "/watchlist" },
  { role: "buyer", name: "saved-searches", path: "/saved-searches" },

  // Owner
  { role: "owner", name: "owner-dashboard", path: "/owner" },
  { role: "owner", name: "owner-inventory", path: "/owner/inventory" },
  { role: "owner", name: "owner-auctions", path: "/owner/auctions" },
  { role: "owner", name: "owner-staff", path: "/owner/staff" },
  { role: "owner", name: "owner-locations", path: "/owner/locations" },
  { role: "owner", name: "owner-integrations", path: "/owner/integrations" },
  { role: "owner", name: "owner-subscription", path: "/owner/subscription" },

  // Admin
  { role: "admin", name: "admin-overview", path: "/admin" },
  { role: "admin", name: "admin-users", path: "/admin/users" },
  { role: "admin", name: "admin-items", path: "/admin/items" },
  { role: "admin", name: "admin-shops", path: "/admin/shops" },
  { role: "admin", name: "admin-subscriptions", path: "/admin/subscriptions" },
  { role: "admin", name: "admin-offers", path: "/admin/offers" },
  { role: "admin", name: "admin-auctions", path: "/admin/auctions" },
];

if (CREDENTIALS.superAdmin) {
  ROUTES.push(
    { role: "superAdmin", name: "super-admin-overview", path: "/super-admin" },
    { role: "superAdmin", name: "super-admin-users", path: "/super-admin/users" },
    { role: "superAdmin", name: "super-admin-shops", path: "/super-admin/shops" },
    { role: "superAdmin", name: "super-admin-pricing", path: "/super-admin/pricing" },
    { role: "superAdmin", name: "super-admin-revenue", path: "/super-admin/revenue" },
    { role: "superAdmin", name: "super-admin-audit", path: "/super-admin/audit" },
    { role: "superAdmin", name: "super-admin-system-health", path: "/super-admin/system-health" },
  );
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(path.join(OUT_DIR, "screenshots"), { recursive: true });

function safeName(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
}

async function apiLogin(role) {
  const creds = CREDENTIALS[role];
  if (!creds) return null;

  for (const password of creds.passwords) {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: creds.email, password }),
      });

      const payload = await res.json().catch(() => ({}));
      const token =
        payload.token ||
        payload.accessToken ||
        payload.access_token ||
        payload.data?.token ||
        payload.data?.accessToken ||
        payload.data?.access_token;

      const user = payload.user || payload.data?.user || { email: creds.email, role };

      if (res.ok && token) {
        return { token, user, email: creds.email };
      }
    } catch {
      // Try next password.
    }
  }

  return null;
}

async function fallbackUiLogin(page, role) {
  const creds = CREDENTIALS[role];
  if (!creds) return false;

  for (const password of creds.passwords) {
    try {
      await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(500);

      const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="Email" i]').first();
      const passwordInput = page.locator('input[type="password"], input[name="password"], input[placeholder*="Password" i]').first();

      if (!(await emailInput.count()) || !(await passwordInput.count())) continue;

      await emailInput.fill(creds.email);
      await passwordInput.fill(password);

      const loginButton = page
        .locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")')
        .first();

      if (await loginButton.count()) {
        await loginButton.click();
        await page.waitForTimeout(1500);
        return !page.url().includes("/login");
      }
    } catch {
      // Try next password.
    }
  }

  return false;
}

async function createContext(browser, theme, login) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true,
  });

  await context.addInitScript(({ themeValue, token, user }) => {
    try {
      localStorage.setItem("theme", themeValue);
      localStorage.setItem("pawnshop-theme", themeValue);
      document.documentElement.setAttribute("data-theme", themeValue);
      document.documentElement.classList.toggle("dark", themeValue === "dark");

      if (token) {
        const tokenKeys = [
          "token",
          "accessToken",
          "authToken",
          "jwt",
          "pawnshopToken",
          "pawnshop-token",
          "pawnshop.auth.token",
        ];

        for (const key of tokenKeys) {
          localStorage.setItem(key, token);
        }

        localStorage.setItem("user", JSON.stringify(user || {}));
        localStorage.setItem("authUser", JSON.stringify(user || {}));
        localStorage.setItem("pawnshopUser", JSON.stringify(user || {}));
      }
    } catch {
      // Ignore localStorage failures.
    }
  }, {
    themeValue: theme,
    token: login?.token || "",
    user: login?.user || null,
  });

  return context;
}

function evaluateReadabilityInPage() {
  const CONFIG = {
    normalContrast: 4.5,
    largeContrast: 3.0,
    placeholderContrast: 3.0,
    minFontSize: 12,
    minControlTextSize: 13,
    maxIssues: 250,
  };

  function parseColor(input) {
    const value = String(input || "").trim();

    if (!value || value === "transparent" || value === "rgba(0, 0, 0, 0)") {
      return { r: 0, g: 0, b: 0, a: 0 };
    }

    const rgbMatch = value.match(/rgba?\(([^)]+)\)/i);
    if (rgbMatch) {
      const parts = rgbMatch[1]
        .split(",")
        .map((part) => part.trim())
        .map((part) => part.endsWith("%") ? Number(part.slice(0, -1)) * 2.55 : Number(part));

      return {
        r: Math.max(0, Math.min(255, parts[0] || 0)),
        g: Math.max(0, Math.min(255, parts[1] || 0)),
        b: Math.max(0, Math.min(255, parts[2] || 0)),
        a: parts.length >= 4 && Number.isFinite(parts[3]) ? Math.max(0, Math.min(1, parts[3])) : 1,
      };
    }

    return { r: 0, g: 0, b: 0, a: 1 };
  }

  function blend(fg, bg) {
    const a = fg.a + bg.a * (1 - fg.a);
    if (a === 0) return { r: 255, g: 255, b: 255, a: 1 };

    return {
      r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
      g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
      b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
      a,
    };
  }

  function luminance(color) {
    const channels = [color.r, color.g, color.b].map((channel) => {
      const c = channel / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  function contrastRatio(fg, bg) {
    const l1 = luminance(fg);
    const l2 = luminance(bg);
    const light = Math.max(l1, l2);
    const dark = Math.min(l1, l2);
    return (light + 0.05) / (dark + 0.05);
  }

  function directText(element) {
    const pieces = [];

    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const value = node.textContent.replace(/\s+/g, " ").trim();
        if (value) pieces.push(value);
      }
    }

    const tag = element.tagName.toLowerCase();

    if (["button", "a", "label", "summary", "option"].includes(tag)) {
      const value = element.innerText.replace(/\s+/g, " ").trim();
      if (value) pieces.push(value);
    }
if (tag === "input" || tag === "textarea") {
      const value = element.value || element.getAttribute("placeholder") || "";
      if (value.trim()) pieces.push(value.trim());
    }

    return [...new Set(pieces)]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isVisible(element) {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    if (style.display === "none") return false;
    if (style.visibility === "hidden" || style.visibility === "collapse") return false;
    if (Number(style.opacity) <= 0.03) return false;
    if (rect.width < 1 || rect.height < 1) return false;

    return true;
  }

  function effectiveBackground(element) {
    const theme = document.documentElement.getAttribute("data-theme") || localStorage.getItem("theme") || "";
    let color = theme === "dark"
      ? { r: 15, g: 23, b: 42, a: 1 }
      : { r: 255, g: 255, b: 255, a: 1 };

    const chain = [];
    let cursor = element;

    while (cursor && cursor.nodeType === Node.ELEMENT_NODE) {
      chain.push(cursor);
      cursor = cursor.parentElement;
    }

    chain.reverse();

    for (const node of chain) {
      const bg = parseColor(getComputedStyle(node).backgroundColor);
      if (bg.a > 0) color = blend(bg, color);
    }

    return color;
  }

  function cssPath(element) {
    const parts = [];
    let cursor = element;

    while (cursor && cursor.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
      let part = cursor.tagName.toLowerCase();

      if (cursor.id) {
        part += `#${cursor.id}`;
        parts.unshift(part);
        break;
      }

      const className = String(cursor.className || "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .join(".");

      if (className) part += `.${className}`;

      parts.unshift(part);
      cursor = cursor.parentElement;
    }

    return parts.join(" > ");
  }

  function isLargeText(fontSize, fontWeight) {
    return fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
  }

  function addIssue(issues, issue) {
    if (issues.length < CONFIG.maxIssues) {
      issues.push(issue);
    }
  }

  const elements = Array.from(document.querySelectorAll("body *"));
  const issues = [];
  const stats = {
    checkedElements: 0,
    textElements: 0,
    contrastFailures: 0,
    tinyTextWarnings: 0,
    clippedTextWarnings: 0,
    placeholderFailures: 0,
    lowOpacityWarnings: 0,
  };

  for (const element of elements) {
    if (!isVisible(element)) continue;

    const text = directText(element);
    if (!text) continue;

      const normalizedTextForAudit = text.trim().replace(/\s+/g, " ").toLowerCase();

      // Ignore accessible-only landmark labels. These are not painted text.
      if (
        normalizedTextForAudit.endsWith(" navigation") ||
        normalizedTextForAudit === "command center navigation" ||
        normalizedTextForAudit === "marketplace operations navigation" ||
        normalizedTextForAudit === "growth & billing navigation" ||
        normalizedTextForAudit === "system navigation"
      ) {
        continue;
      }

    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const tag = element.tagName.toLowerCase();

    stats.checkedElements += 1;
    stats.textElements += 1;

    const fontSize = Number.parseFloat(style.fontSize || "16");
    const fontWeight = Number.parseInt(style.fontWeight || "400", 10) || 400;
    const opacity = Number.parseFloat(style.opacity || "1");

    const bg = effectiveBackground(element);
    const rawFg = parseColor(style.color);
    const fg = rawFg.a < 1 ? blend(rawFg, bg) : rawFg;
    const ratio = contrastRatio(fg, bg);
    const required = isLargeText(fontSize, fontWeight) ? CONFIG.largeContrast : CONFIG.normalContrast;

    const isMutedDisabled =
      element.disabled ||
      element.getAttribute("aria-disabled") === "true" ||
      element.closest("[aria-disabled='true']");

    if (!isMutedDisabled && ratio < required) {
      stats.contrastFailures += 1;
      addIssue(issues, {
        type: "LOW_CONTRAST",
        severity: "fail",
        text: text.slice(0, 160),
        tag,
        path: cssPath(element),
        contrast: Number(ratio.toFixed(2)),
        required,
        fontSize,
        fontWeight,
        color: style.color,
        backgroundColor: style.backgroundColor,
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      });
    }

    const hasLetters = /[a-z0-9]/i.test(text);
    const controlText = ["button", "a", "input", "textarea", "select", "label"].includes(tag);

    if (hasLetters && fontSize < (controlText ? CONFIG.minControlTextSize : CONFIG.minFontSize)) {
      stats.tinyTextWarnings += 1;
      addIssue(issues, {
        type: "TINY_TEXT",
        severity: "warning",
        text: text.slice(0, 160),
        tag,
        path: cssPath(element),
        fontSize,
        minExpected: controlText ? CONFIG.minControlTextSize : CONFIG.minFontSize,
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      });
    }

    const overflowX = ["hidden", "clip"].includes(style.overflowX);
    const overflowY = ["hidden", "clip"].includes(style.overflowY);
    const clippedX = overflowX && element.scrollWidth > Math.ceil(rect.width) + 2;
    const clippedY = overflowY && element.scrollHeight > Math.ceil(rect.height) + 2;

    if ((clippedX || clippedY) && text.length > 8) {
      stats.clippedTextWarnings += 1;
      addIssue(issues, {
        type: "CLIPPED_TEXT",
        severity: "warning",
        text: text.slice(0, 160),
        tag,
        path: cssPath(element),
        clippedX,
        clippedY,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
      });
    }

    if (!isMutedDisabled && opacity < 0.55 && hasLetters) {
      stats.lowOpacityWarnings += 1;
      addIssue(issues, {
        type: "LOW_OPACITY_TEXT",
        severity: "warning",
        text: text.slice(0, 160),
        tag,
        path: cssPath(element),
        opacity,
      });
    }

    if ((tag === "input" || tag === "textarea") && element.getAttribute("placeholder")) {
      const placeholderStyle = getComputedStyle(element, "::placeholder");
      const placeholderFgRaw = parseColor(placeholderStyle.color || style.color);
      const placeholderFg = placeholderFgRaw.a < 1 ? blend(placeholderFgRaw, bg) : placeholderFgRaw;
      const placeholderRatio = contrastRatio(placeholderFg, bg);

      if (placeholderRatio < CONFIG.placeholderContrast) {
        stats.placeholderFailures += 1;
        addIssue(issues, {
          type: "LOW_PLACEHOLDER_CONTRAST",
          severity: "fail",
          text: element.getAttribute("placeholder").slice(0, 160),
          tag,
          path: cssPath(element),
          contrast: Number(placeholderRatio.toFixed(2)),
          required: CONFIG.placeholderContrast,
          color: placeholderStyle.color,
          backgroundColor: style.backgroundColor,
        });
      }
    }
  }

  const failCount = issues.filter((issue) => issue.severity === "fail").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;

  return {
    url: location.href,
    title: document.title,
    theme: document.documentElement.getAttribute("data-theme") || localStorage.getItem("theme") || "",
    stats,
    failCount,
    warningCount,
    verdict: failCount === 0 ? "PASS" : "FAIL",
    issues,
  };
}

async function auditRoute({ browser, route, theme, login }) {
  const context = await createContext(browser, theme, login);
  const page = await context.newPage();

  const pageErrors = [];
  const consoleWarnings = [];

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleWarnings.push(`${message.type()}: ${message.text()}`);
    }
  });

  const url = `${BASE_URL}${route.path}`;
  const screenshotName = `${safeName(route.role)}-${safeName(route.name)}-${theme}.png`;
  const screenshotPath = path.join(OUT_DIR, "screenshots", screenshotName);

  let result;

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForTimeout(1200);

    if (route.role !== "public" && page.url().includes("/login")) {
      const loggedIn = await fallbackUiLogin(page, route.role);
      if (loggedIn) {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
        await page.waitForTimeout(1200);
      }
    }

    await page.evaluate((themeValue) => {
      try {
        document.documentElement.setAttribute("data-theme", themeValue);
        document.documentElement.classList.toggle("dark", themeValue === "dark");
        localStorage.setItem("theme", themeValue);
      } catch {
        // Ignore.
      }
    }, theme);

    await page.waitForTimeout(500);

    result = await page.evaluate(evaluateReadabilityInPage);
    result.role = route.role;
    result.name = route.name;
    result.path = route.path;
    result.expectedUrl = url;
    result.finalUrl = page.url();
    result.pageErrors = pageErrors;
    result.consoleWarnings = consoleWarnings.slice(0, 25);

    if (pageErrors.length > 0) {
      result.verdict = "FAIL";
      result.failCount += pageErrors.length;
      result.issues.unshift(...pageErrors.slice(0, 10).map((message) => ({
        type: "PAGE_ERROR",
        severity: "fail",
        text: message,
      })));
    }

    await page.screenshot({ path: screenshotPath, fullPage: true });
    result.screenshot = screenshotPath;
  } catch (error) {
    result = {
      role: route.role,
      name: route.name,
      path: route.path,
      expectedUrl: url,
      finalUrl: page.url(),
      theme,
      verdict: "FAIL",
      failCount: 1,
      warningCount: 0,
      stats: {},
      pageErrors,
      consoleWarnings,
      issues: [
        {
          type: "AUDIT_ERROR",
          severity: "fail",
          text: error?.message || String(error),
        },
      ],
      screenshot: null,
    };
  } finally {
    await context.close();
  }

  return result;
}

function writeMarkdownReport(summary, details) {
  const lines = [];

  lines.push("# PawnShop Readability Audit");
  lines.push("");
  lines.push(`Generated: ${summary.generatedAt}`);
  lines.push(`Base URL: ${summary.baseUrl}`);
  lines.push(`API Base: ${summary.apiBase}`);
  lines.push(`Overall verdict: **${summary.verdict}**`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Count |");
  lines.push("|---|---:|");
  lines.push(`| Pages checked | ${summary.pageCount} |`);
  lines.push(`| Failed pages | ${summary.failedPages.length} |`);
  lines.push(`| Pages with warnings | ${summary.warningPages.length} |`);
  lines.push(`| Total failures | ${summary.totalFailures} |`);
  lines.push(`| Total warnings | ${summary.totalWarnings} |`);
  lines.push(`| Contrast failures | ${summary.issueTotals.LOW_CONTRAST || 0} |`);
  lines.push(`| Placeholder contrast failures | ${summary.issueTotals.LOW_PLACEHOLDER_CONTRAST || 0} |`);
  lines.push(`| Tiny text warnings | ${summary.issueTotals.TINY_TEXT || 0} |`);
  lines.push(`| Clipped text warnings | ${summary.issueTotals.CLIPPED_TEXT || 0} |`);
  lines.push(`| Low opacity warnings | ${summary.issueTotals.LOW_OPACITY_TEXT || 0} |`);
  lines.push("");

  lines.push("## Page Results");
  lines.push("");
  lines.push("| Verdict | Role | Page | Theme | Failures | Warnings | Screenshot |");
  lines.push("|---|---|---|---|---:|---:|---|");

  for (const page of details) {
    const screenshot = page.screenshot ? page.screenshot : "";
    lines.push(
      `| ${page.verdict} | ${page.role} | ${page.path} | ${page.theme} | ${page.failCount} | ${page.warningCount} | ${screenshot} |`,
    );
  }

  const failed = details.filter((page) => page.verdict === "FAIL");

  if (failed.length) {
    lines.push("");
    lines.push("## Failures To Fix First");
    lines.push("");

    for (const page of failed) {
      lines.push(`### ${page.role} ${page.path} (${page.theme})`);
      lines.push("");

      for (const issue of page.issues.filter((item) => item.severity === "fail").slice(0, 12)) {
        lines.push(`- **${issue.type}**: ${issue.text || "(no text)"}`);
        if (issue.contrast) lines.push(`  - Contrast: ${issue.contrast} / required ${issue.required}`);
        if (issue.path) lines.push(`  - Element: \`${issue.path}\``);
      }

      lines.push("");
    }
  }

  lines.push("## Notes");
  lines.push("");
  lines.push("- `FAIL` means at least one true readability failure was found, usually low contrast or page error.");
  lines.push("- `PASS` with warnings means the page is readable, but still has polish items like tiny text or clipped text.");
  lines.push("- Screenshots are saved for visual review.");

  fs.writeFileSync(path.join(OUT_DIR, "summary.md"), lines.join("\n"));
}

async function main() {
  console.log("===== PAWNSHOP READABILITY AUDIT =====");
  console.log("Base URL:", BASE_URL);
  console.log("API Base:", API_BASE);
  console.log("Report:", OUT_DIR);

  const loginByRole = new Map();

  for (const role of ["buyer", "owner", "admin", "superAdmin"]) {
    if (!CREDENTIALS[role]) continue;

    const login = await apiLogin(role);
    loginByRole.set(role, login);

    if (login) {
      console.log(`✅ ${role} API login OK: ${login.email}`);
    } else {
      console.log(`⚠️  ${role} API login failed or skipped. UI login fallback will be attempted.`);
    }
  }

  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== "false",
  });

  const details = [];

  try {
    for (const theme of THEMES) {
      for (const route of ROUTES) {
        const login = loginByRole.get(route.role) || null;
        console.log(`Auditing ${theme} ${route.role} ${route.path}`);

        const result = await auditRoute({ browser, route, theme, login });
        result.issues = result.issues.slice(0, MAX_ISSUES_PER_PAGE);
        details.push(result);
      }
    }
  } finally {
    await browser.close();
  }

  const issueTotals = {};

  for (const page of details) {
    for (const issue of page.issues || []) {
      issueTotals[issue.type] = (issueTotals[issue.type] || 0) + 1;
    }
  }

  const failedPages = details
    .filter((page) => page.verdict === "FAIL")
    .map((page) => ({
      role: page.role,
      name: page.name,
      path: page.path,
      theme: page.theme,
      failCount: page.failCount,
      screenshot: page.screenshot,
    }));

  const warningPages = details
    .filter((page) => page.verdict !== "FAIL" && page.warningCount > 0)
    .map((page) => ({
      role: page.role,
      name: page.name,
      path: page.path,
      theme: page.theme,
      warningCount: page.warningCount,
      screenshot: page.screenshot,
    }));

  const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    apiBase: API_BASE,
    themes: THEMES,
    pageCount: details.length,
    totalFailures: details.reduce((sum, page) => sum + (page.failCount || 0), 0),
    totalWarnings: details.reduce((sum, page) => sum + (page.warningCount || 0), 0),
    issueTotals,
    failedPages,
    warningPages,
    verdict: failedPages.length === 0 ? "PASS" : "FAIL",
  };

  fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "details.json"), JSON.stringify(details, null, 2));
  writeMarkdownReport(summary, details);

  console.log("");
  console.log("===== READABILITY SUMMARY =====");
  console.log(JSON.stringify(summary, null, 2));
  console.log("");
  console.log("Saved:");
  console.log(path.join(OUT_DIR, "summary.md"));
  console.log(path.join(OUT_DIR, "summary.json"));
  console.log(path.join(OUT_DIR, "details.json"));

  process.exitCode = summary.verdict === "PASS" ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
