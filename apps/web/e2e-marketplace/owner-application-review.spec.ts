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

async function storeSession(
  page: Page,
  role: "ADMIN" | "SUPER_ADMIN" | "OWNER" | "CONSUMER",
) {
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
  let history = [{
    id: "history-1",
    ownerApplicationId: application.id,
    previousStatus: "PENDING",
    newStatus: "IN_REVIEW",
    decisionReason: null,
    adminNotes: "Initial review started.",
    reviewerId: "admin-1",
    reviewer: {
      id: "admin-1",
      name: "Ada Admin",
      email: "admin@pawnloop.test",
      role: "ADMIN",
    },
    reviewedAt: "2026-07-28T12:30:00.000Z",
  }];
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
    if (url.pathname === `/api/admin/owner-applications/${application.id}/history` && request.method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          rows: history,
          pagination: {
            page: 1,
            limit: 10,
            total: history.length,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        }),
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
      history = [{
        id: "history-2",
        ownerApplicationId: application.id,
        previousStatus: "PENDING",
        newStatus: input.status,
        decisionReason: input.decisionReason || null,
        adminNotes: input.adminNotes || null,
        reviewerId: "admin-1",
        reviewer: {
          id: "admin-1",
          name: "Ada Admin",
          email: "admin@pawnloop.test",
          role: "ADMIN",
        },
        reviewedAt: "2026-07-28T13:00:00.000Z",
      }, ...history];
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
  await expect(page.getByRole("heading", { name: "Review history" })).toBeVisible();
  await expect(page.getByText("PENDING → IN REVIEW")).toBeVisible();
  await expect(page.getByText("Initial review started.")).toBeVisible();

  await page.getByRole("button", { name: "Request Information" }).click();
  const confirmation = page.locator("[data-owner-confirm]");
  await expect(confirmation).toHaveAttribute("role", "dialog");
  await expect(confirmation).toContainText("PENDING → INFORMATION REQUESTED");
  await confirmation.getByRole("button", { name: "Confirm Request Information" }).click();
  await expect(confirmation.getByText("A nonblank reason or review note is required.")).toBeVisible();

  await confirmation.getByLabel(/Reason or review note/).fill("Upload a current license.");
  await confirmation.getByLabel(/Administrator notes/).fill("License review is incomplete.");
  await confirmation.getByRole("button", { name: "Confirm Request Information" }).click();
  await expect(page.getByText("Ada Admin · admin@pawnloop.test").first()).toBeVisible();
  await expect(page.getByText("License review is incomplete.", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("PENDING → INFORMATION REQUESTED")).toBeVisible();
  await expect(
    page.getByLabel("Review history").getByText("Upload a current license.", { exact: true }),
  ).toBeVisible();
});

test("super admin opens the shared review interface from Platform Tools", async ({ page }) => {
  await storeSession(page, "SUPER_ADMIN");
  let listRequestPath = "";

  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/admin/owner-applications") {
      listRequestPath = url.pathname;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          rows: [],
          pagination: {
            page: 1,
            limit: 25,
            total: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, notifications: [] }),
    });
  });

  await page.goto("/terms");
  const platformTools = page.locator('details[data-tour="workspace-menu"]');
  await platformTools.evaluate((details: HTMLDetailsElement) => {
    details.open = true;
  });
  const menuLink = platformTools.getByRole("link", { name: "Owner Applications" });
  await expect(menuLink).toHaveAttribute("href", "/super-admin/owner-applications");
  await menuLink.click({ force: true });

  await expect(page).toHaveURL(/\/super-admin\/owner-applications$/);
  await expect(page.getByRole("heading", { name: "Owner Applications" })).toBeVisible();
  await expect(page.locator('aside.admin-sidebar a[href="/super-admin/owner-applications"]'))
    .toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("navigation", { name: "Breadcrumbs" }))
    .toContainText("Super Admin");
  await expect(page.getByRole("navigation", { name: "Breadcrumbs" }))
    .toContainText("Owner Applications");
  await expect(page.getByRole("button", { name: "← Back" })).toBeVisible();
  await expect.poll(() => listRequestPath).toBe("/api/admin/owner-applications");
});

test("review dialog preserves filters, traps workflow actions by status, and rejected is terminal", async ({ page }) => {
  await storeSession(page, "ADMIN");
  const statusRows = ["PENDING", "IN_REVIEW", "INFORMATION_REQUESTED", "APPROVED", "REJECTED", "SUSPENDED"].map((status, index) => ({
    ...application,
    id: `application-${index}`,
    businessName: `${status} Shop`,
    status,
  }));
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/admin/owner-applications") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, rows: statusRows, pagination: { page: 1, limit: 25, total: statusRows.length, totalPages: 1, hasNextPage: false, hasPreviousPage: false } }) });
    }
    const row = statusRows.find((candidate) => url.pathname === `/api/admin/owner-applications/${candidate.id}`);
    if (row) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, application: row }) });
    if (url.pathname.endsWith("/history")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, rows: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false } }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.goto("/admin/owner-applications");
  await page.getByLabel("Search applications").fill("kept search");
  await page.getByLabel("Filter by status").selectOption("PENDING");

  const open = async (name: string) => {
    await page.getByRole("button", { name: `Review ${name} application` }).click();
    return page.getByRole("dialog", { name: `Review ${name}` });
  };
  let dialog = await open("PENDING Shop");
  await expect(dialog.getByRole("button", { name: "Start Review" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Approve" })).toBeVisible();
  await dialog.getByRole("button", { name: "Close application review" }).click();
  await expect(page.getByLabel("Search applications")).toHaveValue("kept search");
  await expect(page.getByLabel("Filter by status")).toHaveValue("PENDING");

  dialog = await open("INFORMATION_REQUESTED Shop");
  await expect(dialog.getByText("Waiting for owner response.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Return to Review" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Approve" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Reject" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  dialog = await open("REJECTED Shop");
  await expect(dialog.getByText("This status is terminal")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Approve|Reject|Suspend|Reinstate|Start Review|Return to Review/ })).toHaveCount(0);
});

test("detail failures and failed refreshes keep all mutation controls unavailable", async ({ page }) => {
  await storeSession(page, "ADMIN");
  let detailMode: "error" | "success" = "error";
  let patchCount = 0;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/admin/owner-applications") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, rows: [application], pagination: { page: 1, limit: 25, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false } }) });
    if (url.pathname.endsWith("/history")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, rows: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false } }) });
    if (url.pathname.endsWith("/status")) { patchCount += 1; return route.fulfill({ status: 500, body: "{}" }); }
    if (url.pathname === `/api/admin/owner-applications/${application.id}`) {
      return detailMode === "error"
        ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Application details unavailable" }) })
        : route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, application }) });
    }
    return route.fulfill({ status: 200, body: "{}" });
  });
  await page.goto("/admin/owner-applications");
  await page.getByRole("button", { name: /Review North Loop Pawn application/ }).click();
  const dialog = page.getByRole("dialog", { name: /Review North Loop Pawn/ });
  await expect(dialog.getByText("Application details unavailable.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Start Review|Request Information|Approve|Reject/ })).toHaveCount(0);
  expect(patchCount).toBe(0);

  detailMode = "success";
  await dialog.getByRole("button", { name: "Retry Application Details" }).click();
  await expect(dialog.getByRole("button", { name: "Start Review" })).toBeVisible();
  detailMode = "error";
  await dialog.getByRole("button", { name: "Refresh Application" }).click();
  await expect(dialog.getByText("Application details unavailable.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Start Review|Request Information|Approve|Reject/ })).toHaveCount(0);
  expect(patchCount).toBe(0);
});

test("rapid application navigation ignores superseded detail and history responses", async ({ page }) => {
  await storeSession(page, "ADMIN");
  const first = { ...application, id: "application-a", businessName: "Alpha Pawn", licenseNumber: "ALPHA-LICENSE" };
  const second = { ...application, id: "application-b", businessName: "Beta Pawn", licenseNumber: "BETA-LICENSE" };
  let releaseFirstDetail: () => void = () => undefined;
  let releaseFirstHistory: () => void = () => undefined;
  const firstDetailGate = new Promise<void>((resolve) => { releaseFirstDetail = resolve; });
  const firstHistoryGate = new Promise<void>((resolve) => { releaseFirstHistory = resolve; });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/admin/owner-applications") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, rows: [first, second], pagination: { page: 1, limit: 25, total: 2, totalPages: 1, hasNextPage: false, hasPreviousPage: false } }) });
    if (url.pathname === `/api/admin/owner-applications/${first.id}`) { await firstDetailGate; return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, application: first }) }); }
    if (url.pathname === `/api/admin/owner-applications/${first.id}/history`) { await firstHistoryGate; return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, rows: [{ id: "alpha-history", ownerApplicationId: first.id, previousStatus: "PENDING", newStatus: "IN_REVIEW", decisionReason: null, adminNotes: "Alpha history", reviewerId: "admin-1", reviewer: { id: "admin-1", name: "Admin", email: "admin@test", role: "ADMIN" }, reviewedAt: application.createdAt }], pagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false } }) }); }
    if (url.pathname === `/api/admin/owner-applications/${second.id}`) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, application: second }) });
    if (url.pathname === `/api/admin/owner-applications/${second.id}/history`) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, rows: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false } }) });
    return route.fulfill({ status: 200, body: "{}" });
  });
  await page.goto("/admin/owner-applications");
  await page.getByRole("button", { name: "Review Alpha Pawn application" }).click();
  await page.getByRole("button", { name: "Next Application" }).click();
  const betaDialog = page.getByRole("dialog", { name: "Review Beta Pawn" });
  await expect(betaDialog.getByText("BETA-LICENSE")).toBeVisible();
  releaseFirstDetail(); releaseFirstHistory();
  await expect(betaDialog.getByText("BETA-LICENSE")).toBeVisible();
  await expect(betaDialog.getByText("ALPHA-LICENSE")).toHaveCount(0);
  await expect(betaDialog.getByText("Alpha history")).toHaveCount(0);
});

test("confirmation owns focus, traps keyboard navigation, and restores the invoking action", async ({ page }) => {
  await storeSession(page, "ADMIN");
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/admin/owner-applications") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, rows: [application], pagination: { page: 1, limit: 25, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false } }) });
    if (url.pathname.endsWith("/history")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, rows: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false } }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, application }) });
  });
  await page.goto("/admin/owner-applications");
  await page.getByRole("button", { name: /Review North Loop Pawn application/ }).click();
  const review = page.locator(".owner-review-dialog");
  const action = review.getByRole("button", { name: "Start Review" });
  await action.click();
  const confirmation = page.locator("[data-owner-confirm]");
  const reason = confirmation.getByLabel(/Reason or review note/);
  await expect(reason).toBeFocused();
  await expect(review).toHaveAttribute("aria-hidden", "true");
  await expect(review).not.toHaveAttribute("aria-modal", "true");
  await page.keyboard.press("Shift+Tab");
  await expect(confirmation.getByRole("button", { name: "Confirm Start Review" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(reason).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirmation).toHaveCount(0);
  await expect(action).toBeFocused();
});

test("confirmation blocks duplicate submissions and leaves status unchanged on API failure", async ({ page }) => {
  await storeSession(page, "ADMIN");
  let patchCount = 0;
  let releaseMutation: () => void = () => undefined;
  const mutationGate = new Promise<void>((resolve) => { releaseMutation = resolve; });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/admin/owner-applications") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, rows: [application], pagination: { page: 1, limit: 25, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false } }) });
    if (url.pathname === `/api/admin/owner-applications/${application.id}/history`) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, rows: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false } }) });
    if (url.pathname === `/api/admin/owner-applications/${application.id}/status`) {
      patchCount += 1;
      await mutationGate;
      return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "Application changed during review" }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, application }) });
  });
  await page.goto("/admin/owner-applications");
  await page.getByRole("button", { name: /Review North Loop Pawn application/ }).click();
  await page.getByRole("button", { name: "Start Review" }).click();
  const confirm = page.locator("[data-owner-confirm]");
  await confirm.getByLabel(/Reason or review note/).fill("Beginning documented review.");
  const submit = confirm.getByRole("button", { name: "Confirm Start Review" });
  await submit.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  const progress = confirm.getByRole("button", { name: "Starting review…" });
  await expect(progress).toBeVisible();
  await expect(progress).toBeDisabled();
  expect(patchCount).toBe(1);
  releaseMutation();
  await expect(confirm.getByText("Application changed during review")).toBeVisible();
  expect(patchCount).toBe(1);
  await expect(page.locator(".owner-review-dialog")).toContainText("PENDING");
});

test("review timeline exposes loading, empty, error, responsive, light, and dark states", async ({ page }) => {
  await storeSession(page, "ADMIN");
  let historyMode: "loading" | "empty" | "error" = "loading";
  let releaseHistory: () => void = () => undefined;
  const historyGate = new Promise<void>((resolve) => {
    releaseHistory = resolve;
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/admin/owner-applications") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          rows: [application],
          pagination: { page: 1, limit: 25, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
        }),
      });
    }
    if (url.pathname === `/api/admin/owner-applications/${application.id}`) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, application }),
      });
    }
    if (url.pathname === `/api/admin/owner-applications/${application.id}/history`) {
      if (historyMode === "loading") {
        await historyGate;
        historyMode = "empty";
      }
      if (historyMode === "error") {
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "History unavailable" }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          rows: [],
          pagination: { page: 1, limit: 10, total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
        }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/owner-applications");
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByText("Loading review history…")).toBeVisible();
  releaseHistory();
  await expect(page.getByText("No administrator review actions have been recorded yet.")).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");

  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "dark");

  historyMode = "error";
  await page.getByRole("button", { name: "Refresh history" }).click();
  await expect(page.getByText("History unavailable")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
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
  for (const role of ["CONSUMER", "OWNER"] as const) {
    await storeSession(page, role);
    for (const path of [
      "/admin/owner-applications",
      "/super-admin/owner-applications",
    ]) {
      await page.goto(path);
      await expect(page).toHaveURL("/");
      await expect(page.getByRole("heading", { name: "Owner Applications" })).toHaveCount(0);
    }
  }
});

test("unauthenticated users cannot open either administrator application queue", async ({ page }) => {
  for (const path of [
    "/admin/owner-applications",
    "/super-admin/owner-applications",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(`/login?next=${encodeURIComponent(path)}`);
    await expect(page.getByRole("heading", { name: "Owner Applications" })).toHaveCount(0);
  }
});

test("staff and seller role values cannot open either administrator application queue", async ({ page }) => {
  for (const role of ["STAFF", "SELLER"] as const) {
    await page.goto("/terms");
    await page.evaluate((unsupportedRole) => {
      localStorage.setItem("auth_token", `${unsupportedRole.toLowerCase()}-token`);
      localStorage.setItem("auth_role", unsupportedRole);
      localStorage.setItem("auth_user", JSON.stringify({
        id: `${unsupportedRole.toLowerCase()}-1`,
        name: "Unauthorized Workflow User",
        email: `${unsupportedRole.toLowerCase()}@pawnloop.test`,
        role: unsupportedRole,
      }));
    }, role);

    for (const path of [
      "/admin/owner-applications",
      "/super-admin/owner-applications",
    ]) {
      await page.goto(path);
      await expect(page).toHaveURL(`/login?next=${encodeURIComponent(path)}`);
      await expect(page.getByRole("heading", { name: "Owner Applications" })).toHaveCount(0);
    }
  }
});

test("owner application page explains every workflow status without exposing private review data", async ({ page }) => {
  await storeSession(page, "OWNER");
  let status:
    | "PENDING"
    | "IN_REVIEW"
    | "INFORMATION_REQUESTED"
    | "APPROVED"
    | "REJECTED"
    | "SUSPENDED" = "PENDING";

  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/owner-applications/me") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          application: {
            id: "application-1",
            status,
            businessName: "North Loop Pawn",
            businessType: "PAWN_SHOP",
            businessEmail: "owner@northloop.test",
            businessPhone: "555-0100",
            websiteUrl: "https://northloop.test",
            businessAddress: {
              line1: "1 Main St",
              city: "Minneapolis",
              state: "MN",
              postalCode: "55401",
              country: "US",
            },
            licenseNumber: "MN-123",
            licenseState: "MN",
            submittedAt: "2026-07-28T12:00:00.000Z",
            reviewedAt: "2026-07-29T12:00:00.000Z",
            decisionReason:
              status === "INFORMATION_REQUESTED"
                ? "Upload a current business license."
                : status === "REJECTED" || status === "SUSPENDED"
                  ? "Licensing requirements were not met."
                  : status === "APPROVED"
                    ? "Existing owner approved during owner-application migration"
                    : null,
            statusChangedAt: "2026-07-29T12:00:00.000Z",
            updatedAt: "2026-07-29T12:00:00.000Z",
            canEdit: status === "INFORMATION_REQUESTED",
            canResubmit: status === "INFORMATION_REQUESTED",
          },
        }),
      });
    }
    if (url.pathname === "/api/notifications") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, notifications: [] }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });

  const expectations = [
    ["PENDING", "Pending"],
    ["IN_REVIEW", "In review"],
    ["INFORMATION_REQUESTED", "Corrections required"],
    ["APPROVED", "Approved"],
    ["REJECTED", "Not approved"],
    ["SUSPENDED", "Suspended"],
  ] as const;

  for (const [nextStatus, label] of expectations) {
    status = nextStatus;
    await page.goto("/owner/application");
    await expect(page.locator(".owner-application__status")).toHaveText(label);
    await expect(page.getByText("Submitted", { exact: true })).toBeVisible();
    await expect(
      page.getByLabel("Application timeline").getByText(
        nextStatus === "APPROVED" ? "Approved" : "Latest review",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "What happens next" })).toBeVisible();
    await expect(page.getByText("Private fraud-screening note.")).toHaveCount(0);

    if (nextStatus === "APPROVED") {
      await expect(page.getByRole("heading", { name: "Application approved" })).toBeVisible();
      await expect(page.getByText(
        "Your PawnLoop owner account has been approved. You can now complete your shop setup and prepare your storefront.",
      )).toBeVisible();
      await expect(page.getByText("Complete your shop profile")).toBeVisible();
      await expect(page.getByText("Add location and business information")).toBeVisible();
      await expect(page.getByText("Connect payments")).toBeVisible();
      await expect(page.getByText("Add your first inventory item")).toBeVisible();
      await expect(page.getByRole("link", { name: "Continue Shop Setup" }))
        .toHaveAttribute("href", "/owner/onboarding");
      await expect(page.getByRole("link", {
        name: "Open Owner Dashboard",
        exact: true,
      }))
        .toHaveAttribute("href", "/owner");
      await expect(page.getByText(
        "Existing owner approved during owner-application migration",
      )).toHaveCount(0);
    }

    if (nextStatus === "INFORMATION_REQUESTED") {
      await expect(page.getByText("Upload a current business license.")).toBeVisible();
    }

    if (nextStatus === "REJECTED" || nextStatus === "SUSPENDED") {
      await expect(page.getByText("Licensing requirements were not met.")).toBeVisible();
    }
  }
});

test("owner application header and setup shortcut stay usable across responsive themes", async ({ page }) => {
  test.setTimeout(60_000);
  await storeSession(page, "OWNER");
  await page.addInitScript(() => {
    localStorage.setItem(
      "pawnloop-role-checklist-dismissed-OWNER-v1",
      "true",
    );
    localStorage.setItem(
      "pawnloop-role-checklist-shortcut-hidden-OWNER-v1",
      "false",
    );
    localStorage.setItem(
      "pawnloop-navigation-assistance-OWNER-v2",
      JSON.stringify({
        automaticPrompts: false,
        completedTopics: ["full-tour"],
        dismissedGuidance: true,
        floatingButtonVisible: false,
      }),
    );
  });

  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/owner-applications/me") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          application: {
            ...application,
            status: "APPROVED",
            canEdit: false,
            canResubmit: false,
            decisionReason:
              "Existing owner approved during owner-application migration",
          },
        }),
      });
    }
    if (url.pathname === "/api/notifications") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, notifications: [] }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, shops: [], data: [] }),
    });
  });

  const viewports = [
    { width: 1440, height: 1000 },
    { width: 1024, height: 900 },
    { width: 768, height: 900 },
    { width: 390, height: 844 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/owner/application");

    const logo = page.getByRole("link", { name: "PawnLoop home" });
    const themeToggle = page.getByRole("button", {
      name: /Switch to (light|dark) mode/,
    });
    const dashboard = page.getByRole("link", {
      name: "Dashboard",
      exact: true,
    });
    const logout = page.getByRole("button", { name: "Logout" });
    const shortcut = page.getByLabel("Return to pawn shop owner setup");
    const continueSetup = page.getByRole("link", {
      name: "Continue Shop Setup",
    });
    const openDashboard = page.getByRole("link", {
      name: "Open Owner Dashboard",
      exact: true,
    });

    await expect(logo).toBeVisible();
    await expect(themeToggle).toBeVisible();
    await expect(dashboard).toBeVisible();
    await expect(logout).toBeVisible();
    await expect(shortcut).toBeVisible();
    await expect(continueSetup).toBeVisible();
    await expect(openDashboard).toBeVisible();
    await expect(shortcut).toHaveCSS("height", "48px");

    const layout = await page.evaluate(() => {
      const rect = (selector: string) =>
        document.querySelector<HTMLElement>(selector)
          ?.getBoundingClientRect();
      const intersects = (a?: DOMRect, b?: DOMRect) =>
        Boolean(
          a &&
            b &&
            a.left < b.right &&
            a.right > b.left &&
            a.top < b.bottom &&
            a.bottom > b.top,
        );

      const logoRect = rect(".site-brand");
      const actionsRect = rect(".site-top-actions");
      const shortcutRect = rect(".role-checklist-return");
      const continueRect = rect(
        '.owner-application__actions a[href="/owner/onboarding"]',
      );
      const dashboardRect = rect(
        '.owner-application__actions a[href="/owner"]',
      );

      return {
        hasHorizontalOverflow:
          document.documentElement.scrollWidth > window.innerWidth,
        overflowingElements: Array.from(
          document.querySelectorAll<HTMLElement>("body *"),
        )
          .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1)
          .sort(
            (a, b) =>
              b.getBoundingClientRect().right - a.getBoundingClientRect().right,
          )
          .slice(0, 8)
          .map((element) => {
            const box = element.getBoundingClientRect();
            return `${element.className || element.tagName}:${Math.round(box.left)}-${Math.round(box.right)}`;
          }),
        logoActionsOverlap: intersects(logoRect, actionsRect),
        shortcutContinueOverlap: intersects(shortcutRect, continueRect),
        shortcutDashboardOverlap: intersects(shortcutRect, dashboardRect),
        shortcutWithinViewport: Boolean(
          shortcutRect &&
            shortcutRect.left >= 0 &&
            shortcutRect.top >= 0 &&
            shortcutRect.right <= window.innerWidth &&
            shortcutRect.bottom <= window.innerHeight,
        ),
      };
    });

    expect(layout.hasHorizontalOverflow, layout.overflowingElements.join(", "))
      .toBe(false);
    expect(layout.logoActionsOverlap).toBe(false);
    expect(layout.shortcutContinueOverlap).toBe(false);
    expect(layout.shortcutDashboardOverlap).toBe(false);
    expect(layout.shortcutWithinViewport).toBe(true);

    const moreMenu = page.locator(".site-primary-more-menu");
    if (viewport.width <= 1200) {
      await expect(moreMenu).toBeVisible();
      await moreMenu.locator("summary").click();
      await expect(
        moreMenu.getByRole("link", { name: "Item Locator" }),
      ).toBeVisible();
      await moreMenu.locator("summary").click();
    } else {
      await expect(moreMenu).toBeHidden();
    }

    await themeToggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(shortcut).toBeVisible();
    await themeToggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  }

  const shortcut = page.getByLabel("Return to pawn shop owner setup");
  const shortcutBox = await shortcut.boundingBox();
  expect(shortcutBox).not.toBeNull();
  if (shortcutBox) {
    const headerBox = await page.locator(".site-header").boundingBox();
    const headerBottom = headerBox ? headerBox.y + headerBox.height : 0;
    await page.getByRole("button", {
      name: "Move owner setup shortcut",
      exact: true,
    }).hover();
    await page.mouse.down();
    await page.mouse.move(40, headerBottom + 30);
    await page.mouse.up();
    const movedBox = await shortcut.boundingBox();
    expect(movedBox).not.toBeNull();
    expect(movedBox?.y).toBeGreaterThanOrEqual(headerBottom + 11);
  }

  await page.getByRole("button", {
    name: "Owner setup",
    exact: true,
  }).click();
  await expect(
    page.getByLabel("Pawn shop owner setup checklist"),
  ).toBeVisible();
});

test("owner saves requested corrections and resubmits with responsive success and retry states", async ({ page }) => {
  await storeSession(page, "OWNER");
  let currentStatus = "INFORMATION_REQUESTED";
  let savedPayload: Record<string, unknown> | null = null;
  let resubmitAttempts = 0;

  const applicantApplication = () => ({
    id: "application-1",
    status: currentStatus,
    businessName: "North Loop Pawn",
    businessType: "PAWN_SHOP",
    businessEmail: "owner@northloop.test",
    businessPhone: "555-0100",
    websiteUrl: "https://northloop.test",
    businessAddress: {
      line1: "1 Main St",
      line2: "",
      city: "Minneapolis",
      state: "MN",
      postalCode: "55401",
      country: "US",
    },
    licenseNumber: "EXPIRED",
    licenseState: "MN",
    submittedAt: "2026-07-28T12:00:00.000Z",
    reviewedAt: "2026-07-29T12:00:00.000Z",
    decisionReason: "Enter the renewed license number.",
    statusChangedAt: "2026-07-29T12:00:00.000Z",
    updatedAt: "2026-07-29T12:00:00.000Z",
    canEdit: currentStatus === "INFORMATION_REQUESTED",
    canResubmit: currentStatus === "INFORMATION_REQUESTED",
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/api/notifications") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, notifications: [] }),
      });
    }
    if (
      url.pathname === "/api/owner-applications/me" &&
      request.method() === "GET"
    ) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, application: applicantApplication() }),
      });
    }
    if (
      url.pathname === "/api/owner-applications/me" &&
      request.method() === "PATCH"
    ) {
      savedPayload = request.postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          application: { ...applicantApplication(), ...savedPayload },
        }),
      });
    }
    if (url.pathname.endsWith("/resubmit")) {
      resubmitAttempts += 1;
      if (resubmitAttempts === 1) {
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Review service unavailable" }),
        });
      }
      currentStatus = "IN_REVIEW";
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          application: applicantApplication(),
        }),
      });
    }
    return route.fulfill({ status: 200, body: "{}" });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/owner/application");
  await expect(page.getByText("Enter the renewed license number.")).toBeVisible();
  await page.getByLabel("License number").fill("MN-RENEWED-2026");
  await page.getByRole("button", { name: "Save corrections" }).click();
  await expect(page.getByText(/Corrections saved/)).toBeVisible();
  expect(savedPayload).toMatchObject({
    licenseNumber: "MN-RENEWED-2026",
  });
  expect(savedPayload).not.toHaveProperty("status");
  expect(savedPayload).not.toHaveProperty("adminNotes");

  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Resubmit for review" }).click();
  await expect(page.getByText("Review service unavailable")).toBeVisible();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Resubmit for review" }).click();
  await expect(page.getByText("Your corrected application was resubmitted for review.")).toBeVisible();
  await expect(page.getByText("In review", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resubmit for review" })).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");

  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("new blank owner applications use accessible standardized controls and validation", async ({ page }) => {
  await storeSession(page, "OWNER");
  await page.route("**/api/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/owner-applications/me") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, application: {
      id: "blank-application", status: "PENDING", businessName: null, businessType: null,
      businessEmail: "owner@example.test", businessPhone: null, websiteUrl: null,
      businessAddress: null, licenseNumber: null, licenseState: null, submittedAt: null,
      reviewedAt: null, decisionReason: null, statusChangedAt: null, updatedAt: null,
      canEdit: true, canResubmit: false,
    } }) });
    return route.fulfill({ status: 200, body: JSON.stringify({ success: true, notifications: [] }) });
  });
  await page.goto("/owner/application");
  await expect(page.getByLabel(/Country/)).toHaveValue("US");
  await expect(page.getByRole("button", { name: "Resubmit for review" })).toHaveCount(0);
  const businessType = page.getByLabel(/Business type/);
  for (const option of ["Traditional Pawn Shop", "Pawn and Jewelry", "Pawn and Firearms", "Auto/Title Pawn", "Online or Hybrid Pawn", "Multi-location Pawn Chain", "Other"]) {
    await businessType.selectOption({ label: option });
    await expect(businessType).toHaveValue(option);
  }
  await businessType.selectOption("Other");
  await expect(page.getByLabel(/Other business type/)).toBeVisible();
  await page.getByRole("button", { name: "Save corrections" }).click();
  await expect(page.locator("#owner-application-errors")).toBeFocused();
  await expect(page.getByText("Describe the other business type using at least 3 characters.").first()).toBeVisible();
  const region = page.getByLabel(/^State \/ region/);
  await expect(region.locator("option")).toHaveCount(58);
  await expect(region.locator('option[value="DC"]')).toHaveCount(1);
  await expect(region.locator('option[value="PR"]')).toHaveCount(1);
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});
