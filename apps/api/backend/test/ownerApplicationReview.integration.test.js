import assert from "node:assert/strict";
import test, {
  after,
  before,
  beforeEach,
} from "node:test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";
import { validateIntegrationTestDatabase, verifyConnectedIntegrationTestDatabase } from "./helpers/databaseSafety.fixture.js";

const TEST_JWT_SECRET =
  "pawnloop-owner-review-tests-only-secret-2026";
const TEST_DOMAIN =
  "@owner-review.integration.pawnloop.test";
const TEST_PASSWORD =
  "OwnerReviewSecure123!";

let app;
let prisma;
let databaseVerified = false;

function testEmail(prefix) {
  return prefix + TEST_DOMAIN;
}

function tokenFor(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      authVersion: user.authVersion,
    },
    TEST_JWT_SECRET,
  );
}

function authorizationFor(user) {
  return "Bearer " + tokenFor(user);
}

async function createUser({
  prefix,
  role,
  name,
}) {
  return prisma.user.create({
    data: {
      name: name || prefix,
      email: testEmail(prefix),
      password: await bcrypt.hash(
        TEST_PASSWORD,
        12,
      ),
      role,
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });
}

async function createOwnerApplication({
  prefix,
  status = "PENDING",
  businessName,
}) {
  const owner = await prisma.user.create({
    data: {
      name: prefix + " Owner",
      email: testEmail(prefix),
      password: await bcrypt.hash(
        TEST_PASSWORD,
        12,
      ),
      role: "OWNER",
      isActive: true,
      emailVerifiedAt: new Date(),
      ownerApplication: {
        create: {
          status,
          submittedAt: status === "DRAFT" ? null : new Date(),
          businessName:
            businessName ||
            prefix + " Pawn Shop",
          businessEmail: testEmail(prefix),
          businessPhone: "555-0100",
          businessType: "Traditional Pawn Shop",
          businessAddress: {
            line1: "100 Test Avenue",
            city: "Chicago",
            state: "IL",
            postalCode: "60601",
            country: "US",
          },
        },
      },
    },
    include: {
      ownerApplication: true,
    },
  });

  return {
    owner,
    application: owner.ownerApplication,
  };
}

async function cleanup() {
  await prisma.superAdminAuditLog.deleteMany({
    where: {
      actorEmail: {
        endsWith: TEST_DOMAIN,
      },
    },
  });

  await prisma.user.deleteMany({
    where: {
      email: {
        endsWith: TEST_DOMAIN,
      },
    },
  });
}

before(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    APP_ENV: "test",
    APP_NAME:
      "pawnloop-owner-application-review-test",
    JWT_SECRET: TEST_JWT_SECRET,
    AUCTION_SCHEDULER_ENABLED: "false",
  });

  const databaseTarget = validateIntegrationTestDatabase();

  const appModule =
    await import("../src/app.js");
  const prismaModule =
    await import("../src/lib/prisma.js");

  app = appModule.createApp();
  prisma = prismaModule.prisma;

  await verifyConnectedIntegrationTestDatabase(prisma, databaseTarget);

  databaseVerified = true;
});

beforeEach(async () => {
  assert.equal(
    databaseVerified,
    true,
    "Database isolation must be verified before cleanup",
  );

  await cleanup();
});

after(async () => {
  if (!prisma) return;

  try {
    if (databaseVerified) {
      await cleanup();
    }
  } finally {
    await prisma.$disconnect();
  }
});

test(
  "owner application routes require an administrator",
  async () => {
    const admin = await createUser({
      prefix: "role-admin",
      role: "ADMIN",
    });

    const superAdmin = await createUser({
      prefix: "role-super-admin",
      role: "SUPER_ADMIN",
    });

    const consumer = await createUser({
      prefix: "role-consumer",
      role: "CONSUMER",
    });

    await createOwnerApplication({
      prefix: "role-owner",
    });

    const unauthenticated = await request(app)
      .get("/api/admin/owner-applications");

    assert.equal(
      unauthenticated.status,
      401,
    );

    const denied = await request(app)
      .get("/api/admin/owner-applications")
      .set(
        "Authorization",
        authorizationFor(consumer),
      );

    assert.equal(denied.status, 403);

    for (const actor of [admin, superAdmin]) {
      const allowed = await request(app)
        .get("/api/admin/owner-applications")
        .set(
          "Authorization",
          authorizationFor(actor),
        );

      assert.equal(allowed.status, 200);
      assert.equal(
        allowed.body.success,
        true,
      );
    }
  },
);

test(
  "administrators can search, filter, paginate, and inspect applications",
  async () => {
    const admin = await createUser({
      prefix: "list-admin",
      role: "ADMIN",
    });

    const alpha =
      await createOwnerApplication({
        prefix: "list-alpha",
        status: "PENDING",
        businessName: "Alpha Pawn",
      });

    await createOwnerApplication({
      prefix: "list-beta",
      status: "IN_REVIEW",
      businessName: "Beta Pawn",
    });

    const authorization =
      authorizationFor(admin);

    const response = await request(app)
      .get(
        "/api/admin/owner-applications" +
          "?status=PENDING&q=Alpha&page=1&limit=10",
      )
      .set(
        "Authorization",
        authorization,
      );

    assert.equal(response.status, 200);
    assert.equal(
      response.body.success,
      true,
    );
    assert.equal(
      response.body.rows.length,
      1,
    );
    assert.equal(
      response.body.rows[0].id,
      alpha.application.id,
    );
    assert.equal(
      response.body.rows[0].owner.email,
      alpha.owner.email,
    );
    assert.equal(
      response.body.pagination.total,
      1,
    );
    assert.equal(
      response.body.pagination.page,
      1,
    );

    const detail = await request(app)
      .get(
        "/api/admin/owner-applications/" +
          alpha.application.id,
      )
      .set(
        "Authorization",
        authorization,
      );

    assert.equal(detail.status, 200);
    assert.equal(
      detail.body.success,
      true,
    );
    assert.equal(
      detail.body.application.businessName,
      "Alpha Pawn",
    );
    assert.equal(
      detail.body.application.status,
      "PENDING",
    );

    const invalidFilter = await request(app)
      .get(
        "/api/admin/owner-applications" +
          "?status=NOT_A_STATUS",
      )
      .set(
        "Authorization",
        authorization,
      );

    assert.equal(
      invalidFilter.status,
      400,
    );

    const deniedHistory = await request(app)
      .get(
        "/api/admin/owner-applications/" +
          alpha.application.id +
          "/history",
      )
      .set(
        "Authorization",
        authorizationFor(
          await createUser({
            prefix: "history-consumer",
            role: "CONSUMER",
          }),
        ),
      );

    assert.equal(deniedHistory.status, 403);
  },
);

test(
  "review API rejects invalid statuses, missing reasons, and forbidden transitions",
  async () => {
    const admin = await createUser({
      prefix: "invalid-admin",
      role: "ADMIN",
    });

    const pending =
      await createOwnerApplication({
        prefix: "invalid-pending",
      });

    const approved =
      await createOwnerApplication({
        prefix: "invalid-approved",
        status: "APPROVED",
      });

    const rejected =
      await createOwnerApplication({
        prefix: "invalid-rejected",
        status: "REJECTED",
      });

    const authorization =
      authorizationFor(admin);

    function statusPath(application) {
      return (
        "/api/admin/owner-applications/" +
        application.id +
        "/status"
      );
    }

    const invalidStatus = await request(app)
      .patch(statusPath(pending.application))
      .set(
        "Authorization",
        authorization,
      )
      .send({
        status: "NOT_A_STATUS",
      });

    assert.equal(
      invalidStatus.status,
      400,
    );

    const missingRejectionReason =
      await request(app)
        .patch(
          statusPath(pending.application),
        )
        .set(
          "Authorization",
          authorization,
        )
        .send({
          status: "REJECTED",
        });

    assert.equal(
      missingRejectionReason.status,
      400,
    );

    const missingInformationReason =
      await request(app)
        .patch(
          statusPath(pending.application),
        )
        .set(
          "Authorization",
          authorization,
        )
        .send({
          status: "INFORMATION_REQUESTED",
        });

    assert.equal(
      missingInformationReason.status,
      400,
    );

    const missingSuspensionReason =
      await request(app)
        .patch(
          statusPath(approved.application),
        )
        .set(
          "Authorization",
          authorization,
        )
        .send({
          status: "SUSPENDED",
        });

    assert.equal(
      missingSuspensionReason.status,
      400,
    );

    const invalidTransition =
      await request(app)
        .patch(
          statusPath(pending.application),
        )
        .set(
          "Authorization",
          authorization,
        )
        .send({
          status: "SUSPENDED",
          decisionReason:
            "Application was never approved.",
        });

    assert.equal(
      invalidTransition.status,
      409,
    );

    const sameStatus = await request(app)
      .patch(statusPath(pending.application))
      .set(
        "Authorization",
        authorization,
      )
      .send({
        status: "PENDING",
      });

    assert.equal(
      sameStatus.status,
      409,
    );

    const reopenRejected =
      await request(app)
        .patch(
          statusPath(rejected.application),
        )
        .set(
          "Authorization",
          authorization,
        )
        .send({
          status: "IN_REVIEW",
        });

    assert.equal(
      reopenRejected.status,
      409,
    );

    const historyCount =
      await prisma.ownerApplicationReviewHistory.count({
        where: {
          ownerApplicationId: {
            in: [
              pending.application.id,
              approved.application.id,
              rejected.application.id,
            ],
          },
        },
      });

    assert.equal(
      historyCount,
      0,
      "rejected review attempts must not create history",
    );
  },
);

test(
  "every supported owner application transition is accepted",
  async () => {
    const admin = await createUser({
      prefix: "transition-admin",
      role: "ADMIN",
    });
    const authorization =
      authorizationFor(admin);
    const transitions = [
      ["PENDING", "IN_REVIEW"],
      ["PENDING", "INFORMATION_REQUESTED"],
      ["PENDING", "APPROVED"],
      ["PENDING", "REJECTED"],
      ["IN_REVIEW", "INFORMATION_REQUESTED"],
      ["IN_REVIEW", "APPROVED"],
      ["IN_REVIEW", "REJECTED"],
      ["INFORMATION_REQUESTED", "IN_REVIEW"],
      ["INFORMATION_REQUESTED", "APPROVED"],
      ["INFORMATION_REQUESTED", "REJECTED"],
      ["APPROVED", "SUSPENDED"],
      ["SUSPENDED", "APPROVED"],
    ];

    for (const [index, [from, to]] of
      transitions.entries()) {
      const result =
        await createOwnerApplication({
          prefix: `transition-${index}`,
          status: from,
        });
      const response = await request(app)
        .patch(
          "/api/admin/owner-applications/" +
            result.application.id +
            "/status",
        )
        .set(
          "Authorization",
          authorization,
        )
        .send({
          status: to,
          ...(to === "INFORMATION_REQUESTED" ||
          to === "REJECTED" ||
          to === "SUSPENDED"
            ? {
                decisionReason:
                  `Required reason for ${to}.`,
              }
            : {}),
          adminNotes:
            `Latest review note for ${from} to ${to}.`,
        });

      assert.equal(
        response.status,
        200,
        `${from} -> ${to}`,
      );
      assert.equal(
        response.body.application.status,
        to,
      );
      assert.equal(
        response.body.application.reviewedById,
        admin.id,
      );
      assert.equal(
        response.body.application.adminNotes,
        `Latest review note for ${from} to ${to}.`,
      );
      assert.ok(
        response.body.application.reviewedAt,
      );
      assert.equal(
        response.body.application.reviewedBy.email,
        admin.email,
      );
    }
  },
);

test(
  "owner business routes require an approved application",
  async () => {
    const pending =
      await createOwnerApplication({
        prefix: "access-pending",
      });
    const suspended =
      await createOwnerApplication({
        prefix: "access-suspended",
        status: "SUSPENDED",
      });
    const approved =
      await createOwnerApplication({
        prefix: "access-approved",
        status: "APPROVED",
      });

    for (const result of [pending, suspended]) {
      const response = await request(app)
        .get("/api/shops/mine")
        .set(
          "Authorization",
          authorizationFor(result.owner),
        );

      assert.equal(response.status, 403);
      assert.equal(
        response.body.code,
        "OWNER_APPLICATION_NOT_APPROVED",
      );
      assert.equal(
        response.body.ownerApplicationStatus,
        result.application.status,
      );
    }

    const allowed = await request(app)
      .get("/api/shops/mine")
      .set(
        "Authorization",
        authorizationFor(approved.owner),
      );

    assert.equal(allowed.status, 200);
  },
);

test(
  "approval records review data, audit history, and invalidates owner authentication",
  async () => {
    const admin = await createUser({
      prefix: "approval-admin",
      role: "ADMIN",
    });

    const result =
      await createOwnerApplication({
        prefix: "approval-owner",
        businessName: "Approval Pawn",
      });

    const authorization =
      authorizationFor(admin);

    const ownerTokenBeforeApproval =
      tokenFor(result.owner);

    const path =
      "/api/admin/owner-applications/" +
      result.application.id +
      "/status";

    const inReview = await request(app)
      .patch(path)
      .set(
        "Authorization",
        authorization,
      )
      .send({
        status: "IN_REVIEW",
        adminNotes:
          "License verification started.",
      });

    assert.equal(inReview.status, 200);
    assert.equal(
      inReview.body.application.status,
      "IN_REVIEW",
    );
    assert.equal(
      inReview.body.requiresOwnerReauthentication,
      false,
    );

    const informationRequested =
      await request(app)
        .patch(path)
        .set(
          "Authorization",
          authorization,
        )
        .send({
          status:
            "INFORMATION_REQUESTED",
          decisionReason:
            "Upload a current business license.",
          adminNotes:
            "Waiting for renewed documentation.",
        });

    assert.equal(
      informationRequested.status,
      200,
    );
    assert.equal(
      informationRequested.body.application.status,
      "INFORMATION_REQUESTED",
    );

    const approved = await request(app)
      .patch(path)
      .set(
        "Authorization",
        authorization,
      )
      .send({
        status: "APPROVED",
        adminNotes:
          "License and identity verified.",
      });

    assert.equal(approved.status, 200);
    assert.equal(
      approved.body.application.status,
      "APPROVED",
    );
    assert.equal(
      approved.body.application.reviewedById,
      admin.id,
    );
    assert.equal(
      approved.body.requiresOwnerReauthentication,
      true,
    );

    const storedOwner =
      await prisma.user.findUnique({
        where: {
          id: result.owner.id,
        },
      });

    assert.equal(
      storedOwner.authVersion,
      1,
    );

    const staleTokenResponse =
      await request(app)
        .get("/api/auth/me")
        .set(
          "Authorization",
          "Bearer " +
            ownerTokenBeforeApproval,
        );

    assert.equal(
      staleTokenResponse.status,
      401,
    );

    const refreshedProfile =
      await request(app)
        .get("/api/auth/me")
        .set(
          "Authorization",
          authorizationFor(storedOwner),
        );

    assert.equal(
      refreshedProfile.status,
      200,
    );
    assert.equal(
      refreshedProfile.body.user
        .ownerApplication.status,
      "APPROVED",
    );

    const audit =
      await prisma.superAdminAuditLog.findFirst({
        where: {
          actorId: admin.id,
          action:
            "ADMIN_OWNER_APPLICATION_APPROVED",
          targetType:
            "OWNER_APPLICATION",
          targetId:
            result.application.id,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

    assert.ok(audit);
    assert.equal(audit.success, true);
    assert.equal(
      audit.metadata.previousStatus,
      "INFORMATION_REQUESTED",
    );
    assert.equal(
      audit.metadata.nextStatus,
      "APPROVED",
    );
    assert.equal(
      audit.metadata.ownerTokensInvalidated,
      true,
    );

    const storedHistory =
      await prisma.ownerApplicationReviewHistory.findMany({
        where: {
          ownerApplicationId: result.application.id,
        },
        orderBy: {
          reviewedAt: "asc",
        },
      });

    assert.equal(storedHistory.length, 3);
    assert.deepEqual(
      storedHistory.map((entry) => [
        entry.previousStatus,
        entry.newStatus,
      ]),
      [
        ["PENDING", "IN_REVIEW"],
        ["IN_REVIEW", "INFORMATION_REQUESTED"],
        ["INFORMATION_REQUESTED", "APPROVED"],
      ],
    );
    assert.equal(
      storedHistory[1].decisionReason,
      "Upload a current business license.",
    );
    assert.equal(
      storedHistory[1].adminNotes,
      "Waiting for renewed documentation.",
    );
    assert.equal(storedHistory[1].reviewerId, admin.id);
    assert.equal(storedHistory[1].reviewerName, admin.name);
    assert.equal(storedHistory[1].reviewerEmail, admin.email);
    assert.equal(storedHistory[1].reviewerRole, "ADMIN");

    const historyResponse = await request(app)
      .get(
        "/api/admin/owner-applications/" +
          result.application.id +
          "/history?page=1&limit=2",
      )
      .set("Authorization", authorization);

    assert.equal(historyResponse.status, 200);
    assert.equal(historyResponse.body.rows.length, 2);
    assert.equal(
      historyResponse.body.rows[0].newStatus,
      "APPROVED",
    );
    assert.equal(
      historyResponse.body.rows[1].newStatus,
      "INFORMATION_REQUESTED",
    );
    assert.equal(
      historyResponse.body.rows[1].reviewer.id,
      admin.id,
    );
    assert.equal(historyResponse.body.pagination.total, 3);
    assert.equal(historyResponse.body.pagination.totalPages, 2);
    assert.equal(historyResponse.body.pagination.hasNextPage, true);

    const secondHistoryPage = await request(app)
      .get(
        "/api/admin/owner-applications/" +
          result.application.id +
          "/history?page=2&limit=2",
      )
      .set("Authorization", authorization);

    assert.equal(secondHistoryPage.status, 200);
    assert.equal(secondHistoryPage.body.rows.length, 1);
    assert.equal(
      secondHistoryPage.body.rows[0].previousStatus,
      "PENDING",
    );
  },
);

test(
  "suspension and reinstatement invalidate previously issued owner tokens",
  async () => {
    const superAdmin = await createUser({
      prefix: "suspension-super-admin",
      role: "SUPER_ADMIN",
    });

    const result =
      await createOwnerApplication({
        prefix: "suspension-owner",
        status: "APPROVED",
        businessName: "Suspension Pawn",
      });

    const authorization =
      authorizationFor(superAdmin);

    const approvedOwnerToken =
      tokenFor(result.owner);

    const path =
      "/api/admin/owner-applications/" +
      result.application.id +
      "/status";

    const suspended = await request(app)
      .patch(path)
      .set(
        "Authorization",
        authorization,
      )
      .send({
        status: "SUSPENDED",
        decisionReason:
          "Compliance documentation expired.",
        adminNotes:
          "Updated documents are required.",
      });

    assert.equal(suspended.status, 200);
    assert.equal(
      suspended.body.application.status,
      "SUSPENDED",
    );
    assert.equal(
      suspended.body.requiresOwnerReauthentication,
      true,
    );

    let storedOwner =
      await prisma.user.findUnique({
        where: {
          id: result.owner.id,
        },
      });

    assert.equal(
      storedOwner.authVersion,
      1,
    );

    const staleApprovedToken =
      await request(app)
        .get("/api/auth/me")
        .set(
          "Authorization",
          "Bearer " + approvedOwnerToken,
        );

    assert.equal(
      staleApprovedToken.status,
      401,
    );

    const suspendedOwnerToken =
      tokenFor(storedOwner);

    const reinstated = await request(app)
      .patch(path)
      .set(
        "Authorization",
        authorization,
      )
      .send({
        status: "APPROVED",
        adminNotes:
          "Updated documentation verified.",
      });

    assert.equal(reinstated.status, 200);
    assert.equal(
      reinstated.body.application.status,
      "APPROVED",
    );
    assert.equal(
      reinstated.body.requiresOwnerReauthentication,
      true,
    );

    storedOwner =
      await prisma.user.findUnique({
        where: {
          id: result.owner.id,
        },
      });

    assert.equal(
      storedOwner.authVersion,
      2,
    );

    const staleSuspendedToken =
      await request(app)
        .get("/api/auth/me")
        .set(
          "Authorization",
          "Bearer " + suspendedOwnerToken,
        );

    assert.equal(
      staleSuspendedToken.status,
      401,
    );
  },
);

test(
  "rejection requires a reason and remains terminal",
  async () => {
    const admin = await createUser({
      prefix: "rejection-admin",
      role: "ADMIN",
    });

    const result =
      await createOwnerApplication({
        prefix: "rejection-owner",
      });

    const authorization =
      authorizationFor(admin);

    const path =
      "/api/admin/owner-applications/" +
      result.application.id +
      "/status";

    const rejected = await request(app)
      .patch(path)
      .set(
        "Authorization",
        authorization,
      )
      .send({
        status: "REJECTED",
        decisionReason:
          "Required licensing could not be verified.",
      });

    assert.equal(rejected.status, 200);
    assert.equal(
      rejected.body.application.status,
      "REJECTED",
    );
    assert.equal(
      rejected.body.application.decisionReason,
      "Required licensing could not be verified.",
    );

    const reopen = await request(app)
      .patch(path)
      .set(
        "Authorization",
        authorization,
      )
      .send({
        status: "IN_REVIEW",
      });

    assert.equal(reopen.status, 409);

    const approve = await request(app)
      .patch(path)
      .set(
        "Authorization",
        authorization,
      )
      .send({
        status: "APPROVED",
      });

    assert.equal(approve.status, 409);
  },
);

test(
  "administrators receive readable legacy and Other business type formatting",
  async () => {
    const admin = await createUser({ prefix: "type-format-admin", role: "SUPER_ADMIN" });
    const legacy = await createOwnerApplication({ prefix: "type-format-legacy", status: "PENDING" });
    await prisma.ownerApplication.update({ where: { id: legacy.application.id }, data: { businessType: "PAWN_SHOP" } });
    const legacyDetail = await request(app).get(`/api/admin/owner-applications/${legacy.application.id}`).set("Authorization", authorizationFor(admin));
    assert.equal(legacyDetail.status, 200); assert.equal(legacyDetail.body.application.businessType, "PAWN SHOP (legacy)");
    await prisma.ownerApplication.update({ where: { id: legacy.application.id }, data: { businessType: "OTHER: Estate collateral specialist" } });
    const otherDetail = await request(app).get(`/api/admin/owner-applications/${legacy.application.id}`).set("Authorization", authorizationFor(admin));
    assert.equal(otherDetail.body.application.businessType, "Other — Estate collateral specialist");
  },
);

test(
  "draft applications are owner-editable, admin-invisible, and submit exactly once",
  async () => {
    const result = await createOwnerApplication({ prefix: "draft-lifecycle", status: "DRAFT" });
    const admin = await createUser({ prefix: "draft-admin", role: "ADMIN" });
    const queue = await request(app).get("/api/admin/owner-applications").set("Authorization", authorizationFor(admin));
    assert.equal(queue.status, 200);
    assert.equal(queue.body.rows.some(row => row.id === result.application.id), false);
    const detail = await request(app).get(`/api/admin/owner-applications/${result.application.id}`).set("Authorization", authorizationFor(admin));
    assert.equal(detail.status, 404);

    const update = await request(app).patch("/api/owner-applications/me").set("Authorization", authorizationFor(result.owner)).send({ businessName: "Draft Loop Pawn" });
    assert.equal(update.status, 200);
    assert.equal(update.body.application.canSubmit, true);
    const submit = await request(app).post("/api/owner-applications/me/submit").set("Authorization", authorizationFor(result.owner)).send({});
    assert.equal(submit.status, 200);
    assert.equal(submit.body.application.status, "PENDING");
    assert.ok(submit.body.application.submittedAt);
    const locked = await request(app).patch("/api/owner-applications/me").set("Authorization", authorizationFor(result.owner)).send({ businessName: "Too late" });
    assert.equal(locked.status, 409);
    const duplicate = await request(app).post("/api/owner-applications/me/submit").set("Authorization", authorizationFor(result.owner)).send({});
    assert.equal(duplicate.status, 409);
  },
);

test(
  "submission and resubmission reject incomplete persisted applications without side effects",
  async () => {
    const draft = await createOwnerApplication({ prefix: "incomplete-draft", status: "DRAFT" });
    await prisma.ownerApplication.update({ where: { id: draft.application.id }, data: { businessAddress: null } });
    const submit = await request(app).post("/api/owner-applications/me/submit").set("Authorization", authorizationFor(draft.owner)).send({});
    assert.equal(submit.status, 400);
    const unchangedDraft = await prisma.ownerApplication.findUnique({ where: { id: draft.application.id } });
    assert.equal(unchangedDraft.status, "DRAFT"); assert.equal(unchangedDraft.submittedAt, null);

    const requested = await createOwnerApplication({ prefix: "incomplete-resubmit", status: "INFORMATION_REQUESTED" });
    const originalSubmittedAt = requested.application.submittedAt;
    await prisma.ownerApplication.update({ where: { id: requested.application.id }, data: { businessName: null } });
    const resubmit = await request(app).post("/api/owner-applications/me/resubmit").set("Authorization", authorizationFor(requested.owner)).send({});
    assert.equal(resubmit.status, 400);
    const unchanged = await prisma.ownerApplication.findUnique({ where: { id: requested.application.id } });
    assert.equal(unchanged.status, "INFORMATION_REQUESTED"); assert.equal(unchanged.submittedAt.getTime(), originalSubmittedAt.getTime());
    assert.equal(await prisma.ownerApplicationResubmission.count({ where: { ownerApplicationId: requested.application.id } }), 0);
    assert.equal(await prisma.notification.count({ where: { type: "OWNER_APPLICATION_RESUBMITTED" } }), 0);
  },
);

test(
  "owner can read only the applicant-safe view and update only allowlisted fields when information is requested",
  async () => {
    const first = await createOwnerApplication({
      prefix: "applicant-update-first",
      status: "INFORMATION_REQUESTED",
    });
    const second = await createOwnerApplication({
      prefix: "applicant-update-second",
      status: "INFORMATION_REQUESTED",
    });
    await prisma.ownerApplication.update({
      where: { id: first.application.id },
      data: {
        decisionReason: "Provide the current license number.",
        adminNotes: "Private fraud-screening note.",
      },
    });

    const view = await request(app)
      .get("/api/owner-applications/me")
      .set("Authorization", authorizationFor(first.owner));
    assert.equal(view.status, 200);
    assert.equal(view.body.application.id, first.application.id);
    assert.equal(
      view.body.application.decisionReason,
      "Provide the current license number.",
    );
    assert.equal("adminNotes" in view.body.application, false);
    assert.equal("reviewedById" in view.body.application, false);
    assert.equal("reviewHistory" in view.body.application, false);

    const malicious = await request(app)
      .patch("/api/owner-applications/me")
      .set("Authorization", authorizationFor(first.owner))
      .send({
        businessName: "Changed Name",
        id: second.application.id,
        ownerId: second.owner.id,
        status: "APPROVED",
        reviewedAt: new Date().toISOString(),
        adminNotes: "erase",
      });
    assert.equal(malicious.status, 400);

    const updated = await request(app)
      .patch("/api/owner-applications/me")
      .set("Authorization", authorizationFor(first.owner))
      .send({
        businessName: "Corrected Pawn",
        businessEmail: "corrected@example.test",
        licenseNumber: "LIC-2026-42",
        licenseState: "IL",
        businessAddress: {
          line1: "123 Main Street",
          city: "Springfield",
          state: "IL",
          postalCode: "62701",
          country: "US",
        },
      });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.application.businessName, "Corrected Pawn");

    const untouched = await prisma.ownerApplication.findUnique({
      where: { id: second.application.id },
    });
    assert.equal(
      untouched.businessName,
      "applicant-update-second Pawn Shop",
    );
    assert.equal(untouched.status, "INFORMATION_REQUESTED");
  },
);

test("draft and requested-information saves persist partial progress without lifecycle side effects", async () => {
  for (const status of ["DRAFT", "INFORMATION_REQUESTED"]) {
    const result = await createOwnerApplication({ prefix: `partial-${status.toLowerCase()}`, status });
    await prisma.ownerApplication.update({ where: { id: result.application.id }, data: { businessName: null, businessType: null, businessAddress: null, submittedAt: status === "DRAFT" ? null : result.application.submittedAt } });
    const before = await prisma.ownerApplication.findUnique({ where: { id: result.application.id } });
    const notificationsBefore = await prisma.notification.count({ where: { type: "OWNER_APPLICATION_RESUBMITTED" } });
    const saved = await request(app).patch("/api/owner-applications/me").set("Authorization", authorizationFor(result.owner)).send({ businessName: "Partial progress", businessType: "", businessAddress: { country: "US", line1: "", city: "", state: "", postalCode: "" } });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(saved.body.application.status, status);
    assert.equal(saved.body.application.businessName, "Partial progress");
    const reloaded = await request(app).get("/api/owner-applications/me").set("Authorization", authorizationFor(result.owner));
    assert.equal(reloaded.body.application.businessAddress.country, "US");
    assert.equal(reloaded.body.application.businessAddress.city, "");
    const after = await prisma.ownerApplication.findUnique({ where: { id: result.application.id } });
    assert.equal(after.status, before.status);
    assert.equal(after.submittedAt?.getTime() ?? null, before.submittedAt?.getTime() ?? null);
    assert.equal(after.statusChangedAt?.getTime() ?? null, before.statusChangedAt?.getTime() ?? null);
    assert.equal(await prisma.ownerApplicationReviewHistory.count({ where: { ownerApplicationId: result.application.id } }), 0);
    assert.equal(await prisma.notification.count({ where: { type: "OWNER_APPLICATION_RESUBMITTED" } }), notificationsBefore);
  }
});

test("PATCH rejects manufactured legacy business types while existing legacy values remain readable", async () => {
  const result = await createOwnerApplication({ prefix: "legacy-contract", status: "INFORMATION_REQUESTED" });
  await prisma.ownerApplication.update({ where: { id: result.application.id }, data: { businessType: "PAWN_SHOP" } });
  const readable = await request(app).get("/api/owner-applications/me").set("Authorization", authorizationFor(result.owner));
  assert.equal(readable.status, 200);
  assert.equal(readable.body.application.businessType, "PAWN_SHOP");
  for (const businessType of ["PAWN_SHOP", "Estate collateral specialist", "Other", "OTHER: "]) {
    const update = await request(app).patch("/api/owner-applications/me").set("Authorization", authorizationFor(result.owner)).send({ businessType });
    assert.equal(update.status, 400, businessType);
  }
  const canonical = await request(app).patch("/api/owner-applications/me").set("Authorization", authorizationFor(result.owner)).send({ businessType: "Pawn and Jewelry" });
  assert.equal(canonical.status, 200);
});

test(
  "owner updates and resubmission reject invalid statuses and duplicate submissions",
  async () => {
    for (const status of [
      "PENDING",
      "IN_REVIEW",
      "APPROVED",
      "REJECTED",
      "SUSPENDED",
    ]) {
      const result = await createOwnerApplication({
        prefix: `applicant-invalid-${status.toLowerCase()}`,
        status,
      });
      const update = await request(app)
        .patch("/api/owner-applications/me")
        .set("Authorization", authorizationFor(result.owner))
        .send({ businessName: "Not allowed" });
      assert.equal(update.status, 409, status);

      const resubmission = await request(app)
        .post("/api/owner-applications/me/resubmit")
        .set("Authorization", authorizationFor(result.owner))
        .send({});
      assert.equal(resubmission.status, 409, status);
    }

    const requested = await createOwnerApplication({
      prefix: "applicant-duplicate",
      status: "INFORMATION_REQUESTED",
    });
    const first = await request(app)
      .post("/api/owner-applications/me/resubmit")
      .set("Authorization", authorizationFor(requested.owner))
      .send({});
    assert.equal(first.status, 200);
    assert.equal(first.body.application.status, "IN_REVIEW");

    const duplicate = await request(app)
      .post("/api/owner-applications/me/resubmit")
      .set("Authorization", authorizationFor(requested.owner))
      .send({});
    assert.equal(duplicate.status, 409);
  },
);

test(
  "resubmission atomically records applicant history, notifies active administrators, and does not grant owner access",
  async () => {
    const admin = await createUser({
      prefix: "resubmit-admin",
      role: "ADMIN",
    });
    const superAdmin = await createUser({
      prefix: "resubmit-super-admin",
      role: "SUPER_ADMIN",
    });
    const inactiveAdmin = await createUser({
      prefix: "resubmit-inactive-admin",
      role: "ADMIN",
    });
    await prisma.user.update({
      where: { id: inactiveAdmin.id },
      data: { isActive: false },
    });
    const result = await createOwnerApplication({
      prefix: "resubmit-owner",
      status: "INFORMATION_REQUESTED",
      businessName: "Resubmit Pawn",
    });

    const response = await request(app)
      .post("/api/owner-applications/me/resubmit")
      .set("Authorization", authorizationFor(result.owner))
      .send({});
    assert.equal(response.status, 200);
    assert.equal(response.body.application.status, "IN_REVIEW");

    const events = await prisma.ownerApplicationResubmission.findMany({
      where: { ownerApplicationId: result.application.id },
    });
    assert.equal(events.length, 1);
    assert.equal(events[0].ownerId, result.owner.id);
    assert.equal(events[0].previousStatus, "INFORMATION_REQUESTED");
    assert.equal(events[0].newStatus, "IN_REVIEW");

    const notifications = await prisma.notification.findMany({
      where: {
        userId: { in: [admin.id, superAdmin.id] },
        type: "OWNER_APPLICATION_RESUBMITTED",
      },
    });
    assert.equal(notifications.length, 2);
    assert.equal(new Set(notifications.map((entry) => entry.dedupeKey)).size, 2);
    assert.equal(
      await prisma.notification.count({
        where: {
          userId: inactiveAdmin.id,
          type: "OWNER_APPLICATION_RESUBMITTED",
        },
      }),
      0,
    );

    const businessAccess = await request(app)
      .get("/api/shops/mine")
      .set("Authorization", authorizationFor(result.owner));
    assert.equal(businessAccess.status, 403);
    assert.equal(
      businessAccess.body.ownerApplicationStatus,
      "IN_REVIEW",
    );
  },
);

test(
  "applicant receives exactly one safe notification for all four notifiable administrator decisions",
  async () => {
    const admin = await createUser({
      prefix: "decision-notification-admin",
      role: "ADMIN",
    });
    const reviewResult = await createOwnerApplication({
      prefix: "decision-notification-review-owner",
    });
    const rejectedResult = await createOwnerApplication({
      prefix: "decision-notification-rejected-owner",
    });
    const reviewPath =
      `/api/admin/owner-applications/${reviewResult.application.id}/status`;
    const rejectedPath =
      `/api/admin/owner-applications/${rejectedResult.application.id}/status`;

    for (const [status, reason, notes] of [
      [
        "INFORMATION_REQUESTED",
        "Upload the renewed license.",
        "PRIVATE_INFO_REQUEST_NOTE",
      ],
      [
        "APPROVED",
        null,
        "PRIVATE_APPROVAL_NOTE",
      ],
      [
        "SUSPENDED",
        "The license expired.",
        "PRIVATE_SUSPENSION_NOTE",
      ],
    ]) {
      const response = await request(app)
        .patch(reviewPath)
        .set("Authorization", authorizationFor(admin))
        .send({
          status,
          ...(reason ? { decisionReason: reason } : {}),
          adminNotes: notes,
        });
      assert.equal(response.status, 200);

      const duplicate = await request(app)
        .patch(reviewPath)
        .set("Authorization", authorizationFor(admin))
        .send({
          status,
          ...(reason ? { decisionReason: reason } : {}),
          adminNotes: notes,
        });
      assert.equal(duplicate.status, 409);
    }

    const rejected = await request(app)
      .patch(rejectedPath)
      .set("Authorization", authorizationFor(admin))
      .send({
        status: "REJECTED",
        decisionReason: "License could not be verified.",
        adminNotes: "PRIVATE_REJECTION_NOTE",
      });
    assert.equal(rejected.status, 200);

    const duplicateRejection = await request(app)
      .patch(rejectedPath)
      .set("Authorization", authorizationFor(admin))
      .send({
        status: "REJECTED",
        decisionReason: "License could not be verified.",
      });
    assert.equal(duplicateRejection.status, 409);

    const notifications = await prisma.notification.findMany({
      where: {
        userId: {
          in: [reviewResult.owner.id, rejectedResult.owner.id],
        },
      },
      orderBy: { createdAt: "asc" },
    });
    assert.equal(notifications.length, 4);
    assert.deepEqual(
      new Set(notifications.map((entry) => entry.type)),
      new Set([
        "OWNER_APPLICATION_INFORMATION_REQUESTED",
        "OWNER_APPLICATION_APPROVED",
        "OWNER_APPLICATION_REJECTED",
        "OWNER_APPLICATION_SUSPENDED",
      ]),
    );
    assert.deepEqual(
      notifications.map((entry) => entry.actionUrl),
      [
        "/owner/application",
        "/owner/application",
        "/owner/application",
        "/owner/application",
      ],
    );
    assert.equal(new Set(notifications.map((entry) => entry.dedupeKey)).size, 4);

    const serializedNotifications = JSON.stringify(notifications);
    for (const privateValue of [
      "PRIVATE_INFO_REQUEST_NOTE",
      "PRIVATE_APPROVAL_NOTE",
      "PRIVATE_SUSPENSION_NOTE",
      "PRIVATE_REJECTION_NOTE",
      admin.id,
      admin.email,
    ]) {
      assert.equal(serializedNotifications.includes(privateValue), false);
    }
  },
);

test(
  "notification reads and read receipts are scoped to the authenticated user",
  async () => {
    const first = await createOwnerApplication({
      prefix: "notification-scope-first",
    });
    const second = await createOwnerApplication({
      prefix: "notification-scope-second",
    });
    const firstNotification = await prisma.notification.create({
      data: {
        userId: first.owner.id,
        type: "OWNER_APPLICATION_INFORMATION_REQUESTED",
        title: "Owner application needs information",
        message: "Review the requested corrections.",
        actionUrl: "/owner/application",
        dedupeKey: `notification-scope:${first.owner.id}`,
      },
    });
    const secondNotification = await prisma.notification.create({
      data: {
        userId: second.owner.id,
        type: "OWNER_APPLICATION_APPROVED",
        title: "Owner application approved",
        message: "Your owner application has been approved.",
        actionUrl: "/owner/application",
        dedupeKey: `notification-scope:${second.owner.id}`,
      },
    });

    const firstList = await request(app)
      .get("/api/notifications")
      .set("Authorization", authorizationFor(first.owner));
    assert.equal(firstList.status, 200);
    assert.deepEqual(
      firstList.body.notifications.map((entry) => entry.id),
      [firstNotification.id],
    );

    const markOther = await request(app)
      .patch(`/api/notifications/${secondNotification.id}/read`)
      .set("Authorization", authorizationFor(first.owner))
      .send({});
    assert.equal(markOther.status, 404);
    assert.equal(
      (
        await prisma.notification.findUnique({
          where: { id: secondNotification.id },
        })
      ).readAt,
      null,
    );

    const markOwn = await request(app)
      .patch(`/api/notifications/${firstNotification.id}/read`)
      .set("Authorization", authorizationFor(first.owner))
      .send({});
    assert.equal(markOwn.status, 200);
    assert.ok(
      (
        await prisma.notification.findUnique({
          where: { id: firstNotification.id },
        })
      ).readAt,
    );
  },
);
