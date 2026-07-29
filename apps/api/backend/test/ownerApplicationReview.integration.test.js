import assert from "node:assert/strict";
import test, {
  after,
  before,
  beforeEach,
} from "node:test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";

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
          businessName:
            businessName ||
            prefix + " Pawn Shop",
          businessEmail: testEmail(prefix),
          businessPhone: "555-0100",
          businessType: "PAWN_SHOP",
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

  const rawDatabaseUrl = String(
    process.env.DATABASE_URL || "",
  );

  assert.ok(
    rawDatabaseUrl,
    "DATABASE_URL is required",
  );

  const databaseName = decodeURIComponent(
    new URL(rawDatabaseUrl).pathname.replace(
      /^\/+/,
      "",
    ),
  );

  assert.equal(
    databaseName,
    "pawnshop_test",
    "Owner review tests may only use pawnshop_test",
  );

  const appModule =
    await import("../src/app.js");
  const prismaModule =
    await import("../src/lib/prisma.js");

  app = appModule.createApp();
  prisma = prismaModule.prisma;

  const result =
    await prisma.$queryRawUnsafe(
      "SELECT current_database() AS database_name",
    );

  assert.equal(
    result[0]?.database_name,
    "pawnshop_test",
    "Connected PostgreSQL database must be pawnshop_test",
  );

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
