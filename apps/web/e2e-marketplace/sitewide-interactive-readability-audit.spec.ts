import { writeFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  AUDITED_ROUTES,
  type AuditRole,
} from "./fixtures/interactiveReadabilityRoutes";
import {
  measureControl,
  type InteractionState,
} from "./helpers/interactiveReadability";

type Theme = "light" | "dark";
type Viewport = { name: string; width: number; height: number };
type AuditFailure = {
  route: string;
  role: AuditRole;
  theme: Theme;
  viewport: string;
  selector: string;
  accessibleName: string;
  state: string;
  contrastRatio: number | null;
  reason: string;
};

const viewports: Viewport[] = [
  { name: "desktop-1440x1100", width: 1440, height: 1100 },
  { name: "tablet-768x1024", width: 768, height: 1024 },
  { name: "mobile-390x844", width: 390, height: 844 },
];
const states: InteractionState[] = ["default", "hover", "focus-visible", "active"];
const controlSelector = [
  "a[href]", "button", "[role=button]", "[role=link]", "[role=menuitem]", "[role=tab]",
  "[role=option]", "input[type=button]", "input[type=submit]", "input[type=reset]", "summary",
].join(",");

async function setSession(page: Page, role: AuditRole, theme: Theme) {
  await page.evaluate(({ auditRole, auditTheme }) => {
    localStorage.clear();
    localStorage.setItem("pawnloop-theme-v2", auditTheme);
    localStorage.setItem(`pawnloop-navigation-assistance-${auditRole}-v2`, JSON.stringify({
      automaticPrompts: false,
      completedTopics: ["full-tour"],
      dismissedGuidance: true,
      floatingButtonVisible: true,
    }));
    if (auditRole !== "GUEST") {
      localStorage.setItem("auth_token", `readability-${auditRole.toLowerCase()}-token`);
      localStorage.setItem("auth_role", auditRole);
      localStorage.setItem("auth_user", JSON.stringify({
        id: `readability-${auditRole.toLowerCase()}`,
        name: `${auditRole} Readability User`,
        email: `${auditRole.toLowerCase()}@readability.test`,
        role: auditRole,
        ownerApplication: auditRole === "OWNER" ? { id: "audit-application", status: "APPROVED" } : undefined,
      }));
    }
  }, { auditRole: role, auditTheme: theme });
}

async function installMocks(page: Page, getRole: () => AuditRole) {
  await page.route("https://js.stripe.com/**", (route) => route.abort());
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const role = getRole();
    const unrestricted = role === "ADMIN" || role === "SUPER_ADMIN";
    const body: Record<string, unknown> = {
      success: true,
      rows: [], items: [], shops: [], auctions: [], offers: [], users: [], owners: [],
      applications: [], subscriptions: [], plans: [], leads: [], messages: [], conversations: [],
      notifications: [], submissions: [], intakes: [], transactions: [], paymentMethods: [],
      lessons: [], savedSearches: [], watchlist: [],
      pagination: { page: 1, limit: 50, total: 0, totalPages: 1 },
    };
    if (pathname === "/api/auth/shop-access") {
      body.access = {
        role,
        unrestricted,
        shopIds: ["audit-shop"],
        permissions: ["locations:read", "messages:read", "messages:write", "auctions:read", "auctions:write", "offers:read"],
        capabilities: { locationsRead: true, messagesRead: true, messagesWrite: true, auctionsRead: true, auctionsWrite: true },
        shops: [{ shopId: "audit-shop", shopName: "Audit Shop", permissions: ["locations:read", "messages:read", "messages:write", "auctions:read", "auctions:write", "offers:read"] }],
      };
    }
    if (pathname === "/api/capabilities") body.publicPreview = { readOnly: false };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
}

function failure(
  failures: AuditFailure[],
  context: Omit<AuditFailure, "reason">,
  reason: string,
) {
  failures.push({ ...context, reason });
}

test.describe("site-wide interactive text audit", () => {
  test.describe.configure({ mode: "parallel" });
  test.skip(!process.env.FULL_INTERACTION_READABILITY_AUDIT, "Run explicitly for the complete route/state matrix.");
  test.setTimeout(60 * 60 * 1000);

  for (const theme of ["light", "dark"] as const) {
    for (const viewport of viewports) {
      test(`${theme} ${viewport.name}`, async ({ page }) => {
        const failures: AuditFailure[] = [];
        let controlsChecked = 0;
        let statesChecked = 0;
        let axeScans = 0;

        page.setDefaultTimeout(1_000);
        await page.setViewportSize(viewport);
        let activeRole: AuditRole = "GUEST";
        await installMocks(page, () => activeRole);
        await page.goto("/", { waitUntil: "domcontentloaded" });
        for (const entry of AUDITED_ROUTES) {
          if (process.env.READABILITY_AUDIT_PROGRESS) console.log(`AUDIT_ROUTE ${theme} ${viewport.name} ${entry.role} ${entry.path}`);
          activeRole = entry.role;
          await page.context().clearCookies();
          await setSession(page, entry.role, theme);
          await page.goto(entry.path, { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(50);

          const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
          if (documentWidth > viewport.width + 1) {
            failure(failures, {
              route: entry.path, role: entry.role, theme, viewport: viewport.name,
              selector: "html", accessibleName: "document", state: "default", contrastRatio: null,
            }, `horizontal overflow ${documentWidth}px > ${viewport.width}px`);
          }

          const controls = page.locator(controlSelector);
          const count = await controls.count();
          for (let index = 0; index < count; index += 1) {
            const control = controls.nth(index);
            if (!(await control.isVisible())) continue;
            controlsChecked += 1;
            const disabled = await control.evaluate((element) =>
              element.matches(":disabled") || element.getAttribute("aria-disabled") === "true",
            ).catch(() => false);
            for (const state of disabled ? (["default"] as InteractionState[]) : states) {
              let measurement;
              try {
                measurement = await measureControl(page, control, state);
              } catch (error) {
                failure(failures, {
                  route: entry.path, role: entry.role, theme, viewport: viewport.name,
                  selector: `${controlSelector}:nth(${index})`, accessibleName: "unmeasured",
                  state, contrastRatio: null,
                }, `state could not be measured: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
                continue;
              }
              statesChecked += 1;
              const context = {
                route: entry.path, role: entry.role, theme, viewport: viewport.name,
                selector: measurement.selector, accessibleName: measurement.name,
                state, contrastRatio: Number(measurement.contrastRatio.toFixed(2)),
              };
              if (!measurement.name) failure(failures, context, "empty accessible name");
              if (measurement.opacity === 0) failure(failures, context, "transparent control");
              if (measurement.contrastRatio < 4.5) failure(failures, context, "text contrast below 4.5:1");
              if (state === "focus-visible" && measurement.focusContrastRatio < 3) {
                failure(failures, context, "focus indicator contrast below 3:1");
              }
              if ((measurement.width < 44 || measurement.height < 44) && measurement.width > 0 && measurement.height > 0) {
                failure(failures, context, `target ${measurement.width.toFixed(1)}x${measurement.height.toFixed(1)} below 44x44`);
              }
            }
          }

          const axeResult = await Promise.race([
            new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
              .analyze(),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("axe scan exceeded 5 seconds")), 5_000)),
          ]).catch((error) => {
            failure(failures, {
              route: entry.path, role: entry.role, theme, viewport: viewport.name,
              selector: "document", accessibleName: "Axe scan", state: "default", contrastRatio: null,
            }, error instanceof Error ? error.message : String(error));
            return { violations: [] };
          });
          const serious = axeResult.violations.filter(({ impact }) => impact === "serious" || impact === "critical");
          axeScans += 1;
          for (const violation of serious) {
            failure(failures, {
              route: entry.path, role: entry.role, theme, viewport: viewport.name,
              selector: violation.nodes[0]?.target.join(" ") || violation.id,
              accessibleName: violation.help, state: "default", contrastRatio: null,
            }, `axe:${violation.id}`);
          }
        }

        const report = {
          theme,
          viewport: viewport.name,
          routesAudited: AUDITED_ROUTES.length,
          controlsChecked,
          statesChecked,
          axeScans,
          failures,
        };
        console.log(`INTERACTIVE_READABILITY_AUDIT ${JSON.stringify(report)}`);
        if (process.env.READABILITY_AUDIT_REPORT) {
          writeFileSync(
            process.env.READABILITY_AUDIT_REPORT.replace("{matrix}", `${theme}-${viewport.name}`),
            `${JSON.stringify(report, null, 2)}\n`,
          );
        }
        expect(failures, JSON.stringify(failures.slice(0, 25), null, 2)).toEqual([]);
      });
    }
  }
});
