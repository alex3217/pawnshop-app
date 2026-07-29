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
  await expect(page.getByRole("heading", { name: "Review history" })).toBeVisible();
  await expect(page.getByText("PENDING → IN REVIEW")).toBeVisible();
  await expect(page.getByText("Initial review started.")).toBeVisible();

  await page.getByLabel("New status").selectOption("INFORMATION_REQUESTED");
  await page.getByRole("button", { name: "Confirm status change" }).click();
  await expect(page.getByText("A reason is required when changing status to INFORMATION REQUESTED.")).toBeVisible();

  await page.getByLabel(/Decision reason/).fill("Upload a current license.");
  await page.getByLabel(/Administrator notes/).fill("License review is incomplete.");
  await page.getByRole("button", { name: "Confirm status change" }).click();
  await expect(page.getByText("Ada Admin · admin@pawnloop.test")).toBeVisible();
  await expect(page.getByText("License review is incomplete.", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("PENDING → INFORMATION REQUESTED")).toBeVisible();
  await expect(
    page.getByLabel("Review history").getByText("Upload a current license.", { exact: true }),
  ).toBeVisible();
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
  await storeSession(page, "CONSUMER");
  await page.goto("/admin/owner-applications");
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Owner Applications" })).toHaveCount(0);
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
    await expect(page.getByText(label, { exact: true })).toBeVisible();
    await expect(page.getByText("Submitted", { exact: true })).toBeVisible();
    await expect(page.getByText("Latest review", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What happens next" })).toBeVisible();
    await expect(page.getByText("Private fraud-screening note.")).toHaveCount(0);
  }
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

  await page.getByRole("button", { name: "Resubmit for review" }).click();
  await expect(page.getByText("Review service unavailable")).toBeVisible();
  await page.getByRole("button", { name: "Resubmit for review" }).click();
  await expect(page.getByText("Your corrected application was resubmitted for review.")).toBeVisible();
  await expect(page.getByText("In review", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resubmit for review" })).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");

  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
