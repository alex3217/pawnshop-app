import { expect, test, type Page } from "@playwright/test";

const application = {
  id: "application-1",
  ownerId: "owner-1",
  status: "PENDING",
  businessName: "North Loop Pawn",
  businessType: "PAWN_SHOP",
  businessEmail: "owner@northloop.test",
  businessPhone: "555-0100",
  websiteUrl: "https://northloop.test",
  businessAddress: { city: "Minneapolis", state: "MN" },
  licenseNumber: "MN-123",
  licenseState: "MN",
  applicationData: { locations: 1 },
  submittedAt: "2026-07-28T12:00:00.000Z",
  reviewedAt: null,
  reviewedById: null,
  decisionReason: null,
  adminNotes: null,
  statusChangedAt: "2026-07-28T12:00:00.000Z",
  createdAt: "2026-07-28T12:00:00.000Z",
  updatedAt: "2026-07-28T12:00:00.000Z",
  owner: {
    id: "owner-1",
    name: "Olivia Owner",
    email: "owner@northloop.test",
    role: "OWNER",
    isActive: true,
    authVersion: 0,
  },
  reviewedBy: null,
} as const;

async function storeSession(page: Page, role: "ADMIN" | "OWNER" | "CONSUMER") {
  await page.addInitScript((selectedRole) => {
    localStorage.setItem("auth_token", `${selectedRole.toLowerCase()}-token`);
    localStorage.setItem("auth_role", selectedRole);
    localStorage.setItem("auth_user", JSON.stringify({
      id: `${selectedRole.toLowerCase()}-1`,
      name: "Workflow Test User",
      email: "workflow@pawnloop.test",
      role: selectedRole,
    }));
  }, role);
}

test("admin queue supports search, filter, pagination, details, reasons, and review metadata", async ({ page }) => {
  await storeSession(page, "ADMIN");
  let current: Record<string, unknown> = { ...application };
  let listRequest = "";

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/admin/owner-applications" && request.method() === "GET") {
      listRequest = url.search;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          rows: [current],
          pagination: {
            page: Number(url.searchParams.get("page") || 1),
            limit: 25,
            total: 26,
            totalPages: 2,
            hasNextPage: url.searchParams.get("page") !== "2",
            hasPreviousPage: url.searchParams.get("page") === "2",
          },
        }),
      });
    }
    if (url.pathname === `/api/admin/owner-applications/${application.id}` && request.method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, application: current }),
      });
    }
    if (url.pathname.endsWith("/status") && request.method() === "PATCH") {
      const input = request.postDataJSON();
      current = {
        ...current,
        ...input,
        reviewedAt: "2026-07-28T13:00:00.000Z",
        reviewedById: "admin-1",
        reviewedBy: {
          id: "admin-1",
          name: "Ada Admin",
          email: "admin@pawnloop.test",
          role: "ADMIN",
        },
      };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          application: current,
          requiresOwnerReauthentication: false,
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, rows: [], data: [] }),
    });
  });

  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/admin/owner-applications");
  await expect(page.getByText("Owner Applications", { exact: true }).last()).toBeVisible();

  await page.getByLabel("Search applications").fill("North Loop");
  await page.getByLabel("Filter by status").selectOption("PENDING");
  await page.getByRole("button", { name: "Search" }).click();
  await expect.poll(() => listRequest).toContain("q=North+Loop");
  expect(listRequest).toContain("status=PENDING");

  await page.getByRole("button", { name: "Next" }).click();
  await expect.poll(() => listRequest).toContain("page=2");
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByText("MN-123")).toBeVisible();

  await page.getByLabel("New status").selectOption("INFORMATION_REQUESTED");
  await page.getByRole("button", { name: "Confirm status change" }).click();
  await expect(page.getByText("A reason is required when changing status to INFORMATION REQUESTED.")).toBeVisible();

  await page.getByLabel(/Decision reason/).fill("Upload a current license.");
  await page.getByLabel(/Administrator notes/).fill("License review is incomplete.");
  await page.getByRole("button", { name: "Confirm status change" }).click();
  await expect(page.getByText("Ada Admin · admin@pawnloop.test")).toBeVisible();
  await expect(page.getByText("License review is incomplete.", { exact: true }).first()).toBeVisible();
});

test("admin queue exposes loading, empty, and error states", async ({ page }) => {
  await storeSession(page, "ADMIN");
  let mode: "loading" | "empty" | "error" = "loading";
  let releaseLoading: () => void = () => undefined;
  const loadingGate = new Promise<void>((resolve) => {
    releaseLoading = resolve;
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname !== "/api/admin/owner-applications") {
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
    if (mode === "loading") {
      await loadingGate;
      mode = "empty";
    }
    if (mode === "error") {
      return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Queue unavailable" }) });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        rows: [],
        pagination: { page: 1, limit: 25, total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      }),
    });
  });

  await page.goto("/admin/owner-applications");
  await expect(page.getByText("Loading…")).toBeVisible();
  releaseLoading();
  await expect(page.getByText("No owner applications match the current search and status filter.")).toBeVisible();
  mode = "error";
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByText("Queue unavailable")).toBeVisible();
});

test("owner dashboard requires approval and handles responsive light and dark layouts", async ({ page }) => {
  await storeSession(page, "OWNER");
  let status = "PENDING";
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        user: {
          id: "owner-1",
          name: "Olivia Owner",
          email: "owner@northloop.test",
          role: "OWNER",
          ownerApplication: {
            id: "application-1",
            status,
            submittedAt: "2026-07-28T12:00:00.000Z",
            reviewedAt: null,
            decisionReason: null,
            statusChangedAt: "2026-07-28T12:00:00.000Z",
          },
        },
      }),
    }),
  );
  await page.route("**/api/**", (route) => {
    if (new URL(route.request().url()).pathname === "/api/auth/me") {
      return route.fallback();
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [], shops: [] }),
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/owner");
  await expect(page.getByRole("heading", { name: "Owner application pending" })).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");

  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "dark");

  status = "APPROVED";
  await page.reload();
  await expect(page.getByRole("heading", { name: "Owner Dashboard" })).toBeVisible();
});

test("non-admin users cannot open the administrator application queue", async ({ page }) => {
  await storeSession(page, "CONSUMER");
  await page.goto("/admin/owner-applications");
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Owner Applications" })).toHaveCount(0);
});
