import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const WEB = process.env.WEB_BASE || "http://127.0.0.1:5176";
const API = process.env.API_BASE || "http://127.0.0.1:6002/api";
const outDir = "reports/full-app-innovation-audit";

fs.mkdirSync(outDir, { recursive: true });

const credentials = {
  buyer: {
    email: process.env.BUYER_EMAIL || "buyer@pawn.local",
    password: process.env.BUYER_PASSWORD || "Buyer123!",
  },
  owner: {
    email: process.env.OWNER_EMAIL || "owner1@pawn.local",
    password: process.env.OWNER_PASSWORD || "Owner123!",
  },
  admin: {
    email: process.env.ADMIN_EMAIL || "admin1@example.com",
    password: process.env.ADMIN_PASSWORD || "Admin123!",
  },
  superAdmin: {
    email: process.env.SUPER_ADMIN_EMAIL || "superadmin@pawn.local",
    password: process.env.SUPER_ADMIN_PASSWORD || "SuperAdmin123!",
  },
};

const pageProfiles = [
  {
    group: "public",
    role: "buyer",
    name: "home",
    path: "/",
    expected: ["Marketplace", "Item Locator", "Sell", "Watchlist", "Offers"],
    innovation: ["buyer", "owner", "auctions", "offers", "shops"],
  },
  {
    group: "buyer",
    role: "buyer",
    name: "buyer-dashboard",
    path: "/buyer/dashboard",
    expected: ["Buyer", "Marketplace", "Item Locator", "Watchlist", "My bids", "Offers", "Saved"],
    innovation: ["Refresh dashboard", "Active bids", "Offers", "Watchlist", "Saved matches", "Won auctions"],
  },
  {
    group: "buyer",
    role: "buyer",
    name: "marketplace",
    path: "/marketplace",
    expected: ["Marketplace", "Search", "Filter", "Watchlist", "Make offer"],
    innovation: ["Make offer", "Watchlist", "Shop", "Item Locator", "Saved Searches"],
  },
  {
    group: "buyer",
    role: "buyer",
    name: "item-locator",
    path: "/buyer/item-locator",
    expected: ["Item Locator", "Search", "Shops", "Radius", "Saved searches"],
    innovation: ["Radius", "Shops", "Saved searches", "Marketplace"],
  },
  {
    group: "buyer",
    role: "buyer",
    name: "auctions",
    path: "/auctions",
    expected: ["Auctions", "Browse live", "Refresh", "LIVE", "ENDED", "CANCELED", "ALL"],
    innovation: ["LIVE", "ENDED", "CANCELED", "ALL", "Refresh"],
  },
  {
    group: "buyer",
    role: "buyer",
    name: "my-bids",
    path: "/my-bids",
    expected: ["Buyer bidding center", "Total bids", "Leading", "Outbid", "Refresh bids", "Open auction"],
    innovation: ["Bid again", "Monitor auction", "Watchlist", "My wins"],
  },
  {
    group: "buyer",
    role: "buyer",
    name: "my-wins",
    path: "/my-wins",
    expected: ["won auctions", "settlement", "payment", "My bids", "Auctions"],
    innovation: ["settlement", "payment", "Pay", "status"],
  },
  {
    group: "buyer",
    role: "buyer",
    name: "watchlist",
    path: "/watchlist",
    expected: [
      "watchlist",
      "Find an item",
      "My offers",
      "Buyer dashboard",
      "Search",
      "Status",
      "Sort",
      "Select visible",
      "Bulk remove",
      "Make offer",
      "Check auctions",
      "Find similar",
    ],
    innovation: ["Bulk remove", "Make offer", "Check auctions", "Find similar", "Sort", "Status"],
  },
  {
    group: "buyer",
    role: "buyer",
    name: "saved-searches",
    path: "/saved-searches",
    expected: [
      "Saved",
      "Create",
      "Save search",
      "Quick starters",
      "Marketplace",
      "Item locator",
      "Remove",
      "Watchlist",
    ],
    innovation: ["Save search", "Quick starters", "Search marketplace", "Search item locator"],
  },
  {
    group: "buyer",
    role: "buyer",
    name: "offers",
    path: "/offers",
    expected: ["Buyer offer center", "Create", "Cancel", "Counter", "View item", "View shop"],
    innovation: ["Create offer", "Counter", "Cancel", "View item", "View shop"],
  },
  {
    group: "buyer",
    role: "buyer",
    name: "sell-pawn-item",
    path: "/buyer/sell-item",
    expected: ["Scan", "photograph", "offers", "Submit", "Shop offers"],
    innovation: ["photos", "Submit", "Shop offers", "accept", "reject"],
  },
  {
    group: "buyer",
    role: "buyer",
    name: "shops",
    path: "/shops",
    expected: ["Shops", "inventory", "Auctions", "Saved"],
    innovation: ["inventory", "Auctions", "Saved", "Shop"],
  },

  {
    group: "owner",
    role: "owner",
    name: "owner-dashboard",
    path: "/owner",
    expected: ["Owner", "Create Item", "Create Auction", "Refresh"],
    innovation: ["inventory", "auctions", "offers", "settlements", "integrations"],
  },
  {
    group: "owner",
    role: "owner",
    name: "owner-inventory",
    path: "/owner/inventory",
    expected: ["Owner Inventory", "Add Item", "Bulk Upload", "Scan Console", "Export CSV", "Select visible", "Bulk mark sold"],
    innovation: ["Bulk", "Create Auction", "Export", "Scan"],
  },
  {
    group: "owner",
    role: "owner",
    name: "owner-auctions",
    path: "/owner/auctions",
    expected: ["Owner Auctions", "Create", "Refresh", "Export"],
    innovation: ["End", "Cancel", "Reviewed", "Export"],
  },
  {
    group: "owner",
    role: "owner",
    name: "owner-staff",
    path: "/owner/staff",
    expected: ["Staff", "Role", "Search", "Remove access"],
    innovation: ["permissions", "role", "activate", "remove"],
  },
  {
    group: "owner",
    role: "owner",
    name: "owner-locations",
    path: "/owner/locations",
    expected: ["Locations", "Refresh", "Add location", "View inventory", "View staff"],
    innovation: ["Inventory", "Staff", "Add location"],
  },
  {
    group: "owner",
    role: "owner",
    name: "owner-integrations",
    path: "/owner/integrations",
    expected: ["Integrations", "Create", "Test", "Sync", "Archive", "Mapping", "Jobs"],
    innovation: ["Test", "Sync", "Mapping", "Archive", "Jobs", "Errors"],
  },
  {
    group: "owner",
    role: "owner",
    name: "owner-subscription",
    path: "/owner/subscription",
    expected: ["Subscription", "Plan", "Status", "Billing", "Feature", "Upgrade", "Downgrade", "Stripe", "Checkout"],
    innovation: ["Upgrade", "Downgrade", "Stripe", "Checkout", "Feature"],
  },

  {
    group: "admin",
    role: "admin",
    name: "admin-overview",
    path: "/admin",
    expected: ["Admin"],
    innovation: ["Users", "Items", "Shops", "Subscriptions", "Audit"],
  },
  {
    group: "admin",
    role: "admin",
    name: "admin-users",
    path: "/admin/users",
    expected: ["Users"],
    innovation: ["Search", "Role", "Status", "Actions"],
  },
  {
    group: "admin",
    role: "admin",
    name: "admin-items",
    path: "/admin/items",
    expected: ["Inventory"],
    innovation: ["Items", "Search", "Status", "Actions"],
  },
  {
    group: "admin",
    role: "admin",
    name: "admin-shops",
    path: "/admin/shops",
    expected: ["Shops"],
    innovation: ["Search", "Status", "Actions"],
  },
  {
    group: "admin",
    role: "admin",
    name: "admin-subscriptions",
    path: "/admin/subscriptions",
    expected: ["Subscriptions"],
    innovation: ["Plan", "Billing", "Status"],
  },

  {
    group: "super-admin",
    role: "superAdmin",
    name: "super-admin-overview",
    path: "/super-admin/overview",
    expected: ["Super", "Overview"],
    innovation: ["users", "shops", "revenue", "audit"],
  },
  {
    group: "super-admin",
    role: "superAdmin",
    name: "super-admin-users",
    path: "/super-admin/users",
    expected: ["Users"],
    innovation: ["Search", "Role", "Status"],
  },
  {
    group: "super-admin",
    role: "superAdmin",
    name: "super-admin-shops",
    path: "/super-admin/shops",
    expected: ["Shops"],
    innovation: ["Search", "Status", "Owner"],
  },
  {
    group: "super-admin",
    role: "superAdmin",
    name: "super-admin-revenue",
    path: "/super-admin/revenue",
    expected: ["Revenue"],
    innovation: ["Revenue", "Settlement", "Commission"],
  },
  {
    group: "super-admin",
    role: "superAdmin",
    name: "super-admin-audit",
    path: "/super-admin/audit",
    expected: ["Audit"],
    innovation: ["Actor", "Action", "Resource", "Time"],
  },
];

function safeName(input) {
  return String(input).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
}

function walkFiles(dir, extensions, out = []) {
  if (!fs.existsSync(dir)) return out;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (["node_modules", "dist", ".git", "reports"].includes(entry.name)) continue;
      walkFiles(full, extensions, out);
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }

  return out;
}

function readFileSafe(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function sourceScan() {
  const webPages = walkFiles("apps/web/src/pages", [".tsx", ".jsx", ".ts", ".js"]);
  const webServices = walkFiles("apps/web/src/services", [".ts", ".tsx", ".js", ".jsx"]);
  const apiRoutes = walkFiles("apps/api/backend/src/routes", [".js", ".ts"]);
  const apiControllers = walkFiles("apps/api/backend/src/controllers", [".js", ".ts"]);
  const allCode = [...webPages, ...webServices, ...apiRoutes, ...apiControllers];

  const patterns = [
    { key: "todo", re: /\bTODO\b|\bFIXME\b|\bHACK\b/gi },
    { key: "stubScaffold", re: /scaffold stub|coming soon|placeholder|not implemented|replace with real/gi },
    { key: "rawFetchInPages", re: /\bfetch\s*\(/g, files: webPages },
    { key: "consoleError", re: /console\.error/g },
    { key: "windowConfirm", re: /window\.confirm/g },
    { key: "demoMockStatic", re: /\bdemo\b|\bmock\b|hardcoded|featuredItems|const shops = \[/gi },
  ];

  const findings = [];

  for (const pattern of patterns) {
    const files = pattern.files || allCode;

    for (const file of files) {
      const text = readFileSafe(file);
      const lines = text.split(/\r?\n/);

      lines.forEach((line, index) => {
        if (pattern.re.test(line)) {
          findings.push({
            type: pattern.key,
            file,
            line: index + 1,
            text: line.trim().slice(0, 240),
          });
        }
        pattern.re.lastIndex = 0;
      });
    }
  }

  return {
    counts: {
      webPages: webPages.length,
      webServices: webServices.length,
      apiRoutes: apiRoutes.length,
      apiControllers: apiControllers.length,
    },
    files: {
      webPages,
      webServices,
      apiRoutes,
      apiControllers,
    },
    findings,
  };
}

async function login(role) {
  if (role === "public") return null;

  const cred = credentials[role];
  if (!cred) return null;

  const candidates = ["/auth/login", "/admin/login", "/super-admin/login"];

  for (const endpoint of candidates) {
    try {
      const response = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cred.email, password: cred.password }),
      });

      const json = await response.json().catch(() => ({}));
      const token =
        json.token ||
        json.accessToken ||
        json.data?.token ||
        json.data?.accessToken;

      if (response.ok && token) {
        return token;
      }
    } catch {
      // continue
    }
  }

  return null;
}

function makeIssues({ pageProfile, result }) {
  const issues = [];
  const bodyLower = result.bodyText.toLowerCase();

  for (const expected of pageProfile.expected || []) {
    if (!bodyLower.includes(String(expected).toLowerCase())) {
      issues.push({
        severity: "P1",
        type: "missing-required-control",
        message: `Missing expected text/control: ${expected}`,
      });
    }
  }

  for (const expected of pageProfile.innovation || []) {
    if (!bodyLower.includes(String(expected).toLowerCase())) {
      issues.push({
        severity: "P2",
        type: "innovation-gap",
        message: `Consider adding or surfacing: ${expected}`,
      });
    }
  }

  if (result.finalUrl.includes("/login")) {
    issues.push({
      severity: "P1",
      type: "auth-redirect",
      message: "Page redirected to login; route may not be accessible with supplied test role.",
    });
  }

  const looksLikeHardNotFound =
    /(^|\\n)\\s*(404|page not found|route not found|not found)\\s*($|\\n)/i.test(result.bodyText) &&
    result.controlCount < 20;

  if (looksLikeHardNotFound) {
    issues.push({
      severity: "P1",
      type: "not-found",
      message: "Page appears to render a hard 404/not found state.",
    });
  }

  if (/scaffold stub|coming soon|not implemented|replace with real ui|replace with real/i.test(result.bodyText)) {
    issues.push({
      severity: "P1",
      type: "stub-ui",
      message: "Page appears to contain scaffold/stub language.",
    });
  }

  if (result.blockedControls.length) {
    issues.push({
      severity: "P0",
      type: "blocked-controls",
      message: `${result.blockedControls.length} controls may be blocked by another element.`,
    });
  }

  if (result.tinyControls.length) {
    issues.push({
      severity: "P2",
      type: "tiny-controls",
      message: `${result.tinyControls.length} controls are very small and may be hard to tap.`,
    });
  }

  if (result.suspiciousLinks.length) {
    issues.push({
      severity: "P1",
      type: "bad-links",
      message: `${result.suspiciousLinks.length} links use empty/hash/javascript hrefs.`,
    });
  }

  if (result.controlCount < 5) {
    issues.push({
      severity: "P1",
      type: "low-control-count",
      message: `Only ${result.controlCount} controls detected; page may lack useful actions.`,
    });
  }

  return issues;
}

async function inspectPage(browser, tokens, pageProfile, theme) {
  const token = tokens[pageProfile.role] || tokens.buyer || "";
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });

  await context.addInitScript(
    ({ token, theme, role }) => {
      localStorage.setItem("pawnloop-theme-v2", theme);

      if (token) {
        localStorage.setItem("token", token);
        localStorage.setItem("authToken", token);
        localStorage.setItem("accessToken", token);
        localStorage.setItem("pawnloop-token", token);
        localStorage.setItem("pawnloop-auth-token", token);
      }

      const roleMap = {
        buyer: "CONSUMER",
        owner: "OWNER",
        admin: "ADMIN",
        superAdmin: "SUPER_ADMIN",
      };

      localStorage.setItem("role", roleMap[role] || "CONSUMER");
      localStorage.setItem("userRole", roleMap[role] || "CONSUMER");
    },
    { token, theme, role: pageProfile.role },
  );

  const page = await context.newPage();
  let responseStatus = null;
  let pageError = "";

  try {
    const response = await page.goto(`${WEB}${pageProfile.path}?fresh=${Date.now()}`, {
      waitUntil: "networkidle",
      timeout: 25000,
    });

    responseStatus = response?.status?.() ?? null;
  } catch (err) {
    pageError = err instanceof Error ? err.message : "Navigation failed.";
  }

  const result = await page.evaluate(() => {
    const bodyText = document.body?.innerText || "";

    const controls = Array.from(document.querySelectorAll("a, button, input, select, textarea"))
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const styles = window.getComputedStyle(el);
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const topElement = document.elementFromPoint(centerX, centerY);

        const text = (el.textContent || el.getAttribute("placeholder") || "")
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 160);

        const href = el.getAttribute("href");

        const blocked =
          rect.width > 0 &&
          rect.height > 0 &&
          topElement &&
          topElement !== el &&
          !el.contains(topElement) &&
          !topElement.contains(el);

        return {
          tag: el.tagName,
          text,
          href,
          disabled: "disabled" in el ? el.disabled : null,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          color: styles.color,
          backgroundColor: styles.backgroundColor,
          borderColor: styles.borderColor,
          display: styles.display,
          visibility: styles.visibility,
          pointerEvents: styles.pointerEvents,
          blocked,
          topElementTag: topElement?.tagName || null,
          topElementText: (topElement?.textContent || "")
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 120),
        };
      })
      .filter((item) => item.width > 0 && item.height > 0);

    const links = controls.filter((item) => item.tag === "A");

    return {
      finalUrl: location.href,
      title: document.title,
      bodyText,
      bodyPreview: bodyText.slice(0, 4000),
      controlCount: controls.length,
      controls,
      blockedControls: controls.filter((item) => item.blocked),
      tinyControls: controls.filter((item) => item.width < 28 || item.height < 24),
      suspiciousLinks: links.filter((item) => {
        const href = String(item.href || "").trim().toLowerCase();
        return !href || href === "#" || href.startsWith("javascript:");
      }),
    };
  }).catch((err) => ({
    finalUrl: page.url(),
    title: "",
    bodyText: "",
    bodyPreview: "",
    controlCount: 0,
    controls: [],
    blockedControls: [],
    tinyControls: [],
    suspiciousLinks: [],
    evaluateError: err instanceof Error ? err.message : "Evaluate failed.",
  }));

  await page.screenshot({
    path: path.join(outDir, `${safeName(pageProfile.group)}-${safeName(pageProfile.name)}-${theme}.png`),
    fullPage: true,
  }).catch(() => {});

  await context.close();

  const issues = makeIssues({ pageProfile, result });

  if (pageError) {
    issues.unshift({
      severity: "P0",
      type: "navigation-error",
      message: pageError,
    });
  }

  return {
    ...pageProfile,
    theme,
    status: responseStatus,
    ...result,
    issues,
  };
}

function buildMarkdown({ source, pages }) {
  const issueRows = pages.flatMap((page) =>
    page.issues.map((issue) => ({
      page: `${page.group}/${page.name}`,
      path: page.path,
      theme: page.theme,
      severity: issue.severity,
      type: issue.type,
      message: issue.message,
    })),
  );

  const bySeverity = {
    P0: issueRows.filter((row) => row.severity === "P0"),
    P1: issueRows.filter((row) => row.severity === "P1"),
    P2: issueRows.filter((row) => row.severity === "P2"),
  };

  const lines = [];

  lines.push("# Full App Innovation Audit");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Executive Summary");
  lines.push("");
  lines.push(`- Pages inspected: ${pages.length}`);
  lines.push(`- P0 blockers: ${bySeverity.P0.length}`);
  lines.push(`- P1 control/route gaps: ${bySeverity.P1.length}`);
  lines.push(`- P2 innovation opportunities: ${bySeverity.P2.length}`);
  lines.push(`- Source pages scanned: ${source.counts.webPages}`);
  lines.push(`- Web services scanned: ${source.counts.webServices}`);
  lines.push(`- API routes scanned: ${source.counts.apiRoutes}`);
  lines.push(`- API controllers scanned: ${source.counts.apiControllers}`);
  lines.push("");

  lines.push("## Page Results");
  lines.push("");
  lines.push("| Group | Page | Theme | Controls | P0 | P1 | P2 | Path |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---|");

  for (const page of pages) {
    const p0 = page.issues.filter((issue) => issue.severity === "P0").length;
    const p1 = page.issues.filter((issue) => issue.severity === "P1").length;
    const p2 = page.issues.filter((issue) => issue.severity === "P2").length;
    lines.push(`| ${page.group} | ${page.name} | ${page.theme} | ${page.controlCount} | ${p0} | ${p1} | ${p2} | ${page.path} |`);
  }

  lines.push("");
  lines.push("## P0 Blockers");
  lines.push("");

  if (!bySeverity.P0.length) {
    lines.push("- None found.");
  } else {
    bySeverity.P0.forEach((row) => {
      lines.push(`- **${row.page} (${row.theme})** — ${row.type}: ${row.message} [${row.path}]`);
    });
  }

  lines.push("");
  lines.push("## P1 Gaps");
  lines.push("");

  if (!bySeverity.P1.length) {
    lines.push("- None found.");
  } else {
    bySeverity.P1.forEach((row) => {
      lines.push(`- **${row.page} (${row.theme})** — ${row.type}: ${row.message} [${row.path}]`);
    });
  }

  lines.push("");
  lines.push("## P2 Innovation Opportunities");
  lines.push("");

  if (!bySeverity.P2.length) {
    lines.push("- None found.");
  } else {
    bySeverity.P2.slice(0, 100).forEach((row) => {
      lines.push(`- **${row.page} (${row.theme})** — ${row.message} [${row.path}]`);
    });

    if (bySeverity.P2.length > 100) {
      lines.push(`- ...${bySeverity.P2.length - 100} additional P2 opportunities in details.json`);
    }
  }

  lines.push("");
  lines.push("## Source Findings");
  lines.push("");

  const sourceByType = {};
  for (const finding of source.findings) {
    sourceByType[finding.type] ||= [];
    sourceByType[finding.type].push(finding);
  }

  for (const [type, rows] of Object.entries(sourceByType)) {
    lines.push(`### ${type} (${rows.length})`);
    rows.slice(0, 40).forEach((row) => {
      lines.push(`- ${row.file}:${row.line} — ${row.text}`);
    });
    if (rows.length > 40) {
      lines.push(`- ...${rows.length - 40} more`);
    }
    lines.push("");
  }

  lines.push("## Recommended Next Sprint Order");
  lines.push("");
  lines.push("1. Fix any P0 blockers.");
  lines.push("2. Fix P1 missing controls, bad links, route redirects, or stub pages.");
  lines.push("3. Upgrade the highest-traffic buyer pages first: Marketplace, Item Detail, Watchlist, Saved Searches, Offers.");
  lines.push("4. Upgrade owner operational pages next: Inventory, Auctions, Integrations, Staff, Subscription.");
  lines.push("5. Run build, dev-safe, role routes, buyer audit, owner audit, and this full app audit after every sprint.");
  lines.push("");

  return lines.join("\n");
}

const source = sourceScan();

const tokens = {
  buyer: await login("buyer"),
  owner: await login("owner"),
  admin: await login("admin"),
  superAdmin: await login("superAdmin"),
};

const browser = await chromium.launch({ headless: true });
const pages = [];

for (const profile of pageProfiles) {
  for (const theme of ["light", "dark"]) {
    pages.push(await inspectPage(browser, tokens, profile, theme));
  }
}

await browser.close();

const summary = {
  generatedAt: new Date().toISOString(),
  tokenStatus: {
    buyer: Boolean(tokens.buyer),
    owner: Boolean(tokens.owner),
    admin: Boolean(tokens.admin),
    superAdmin: Boolean(tokens.superAdmin),
  },
  sourceCounts: source.counts,
  pageCount: pages.length,
  issueCounts: {
    p0: pages.flatMap((page) => page.issues).filter((issue) => issue.severity === "P0").length,
    p1: pages.flatMap((page) => page.issues).filter((issue) => issue.severity === "P1").length,
    p2: pages.flatMap((page) => page.issues).filter((issue) => issue.severity === "P2").length,
  },
  pages: pages.map((page) => ({
    group: page.group,
    name: page.name,
    path: page.path,
    theme: page.theme,
    status: page.status,
    finalUrl: page.finalUrl,
    controlCount: page.controlCount,
    issueCount: page.issues.length,
    p0: page.issues.filter((issue) => issue.severity === "P0").length,
    p1: page.issues.filter((issue) => issue.severity === "P1").length,
    p2: page.issues.filter((issue) => issue.severity === "P2").length,
  })),
};

fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(outDir, "details.json"), JSON.stringify({ source, pages }, null, 2));
fs.writeFileSync(path.join(outDir, "summary.md"), buildMarkdown({ source, pages }));

console.log(JSON.stringify(summary, null, 2));
console.log("");
console.log(`Saved: ${outDir}/summary.json`);
console.log(`Saved: ${outDir}/details.json`);
console.log(`Saved: ${outDir}/summary.md`);
