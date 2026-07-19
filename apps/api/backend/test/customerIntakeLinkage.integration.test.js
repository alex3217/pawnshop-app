import assert from "node:assert/strict";
import test, {
  after,
  before,
  beforeEach,
} from "node:test";

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";

import {
  claimCustomerItemIntakeLink,
} from "../src/services/itemIntake.service.js";

const TEST_JWT_SECRET =
  "pawnloop-customer-intake-linkage-integration-secret-2026";

const TEST_DOMAIN =
  "@customer-intake-linkage.integration.pawnloop.test";

const TEST_IMAGE =
  "data:image/png;base64,Y3VzdG9tZXItaW50YWtlLWxpbmthZ2U=";

let app;
let prisma;
let passwordHash;

function testEmail(prefix) {
  return `${prefix}${TEST_DOMAIN}`;
}

function tokenFor(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
    },
    TEST_JWT_SECRET,
    {
      expiresIn: "15m",
    },
  );
}

async function createUser(prefix) {
  return prisma.user.create({
    data: {
      name: `${prefix} Consumer`,
      email: testEmail(prefix),
      password: passwordHash,
      role: "CONSUMER",
      isActive: true,
    },
  });
}

function normalizedCode(prefix) {
  return String(prefix)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-");
}

async function createCustomerIntake({
  buyer,
  prefix,
  destination,
  status = "SCANNED",
}) {
  const code =
    normalizedCode(prefix);

  return prisma.itemIntake.create({
    data: {
      shopId: null,
      capturedByUserId: buyer.id,
      customerId: buyer.id,
      source: "MANUAL",
      destination,
      status,
      code,
      normalizedCode: code,
      codeType: "SKU",
      sku: code,
      title: `${prefix} intake item`,
      description:
        `${prefix} customer intake linkage test`,
      category: "Electronics",
      condition: "Good",
      estimatedValue: "145.50",
      images: [
        TEST_IMAGE,
      ],
      duplicateStatus: "CLEAR",
      duplicateMatches: [],
      screeningStatus: "NOT_CHECKED",
      linkedItemId: null,
      linkedSubmissionId: null,
      linkedMarketplaceListingId: null,
      metadata: {
        workflow:
          "customer-intake-linkage-integration-test",
      },
    },
  });
}

function submissionPayload({
  intakeId,
  prefix,
  intent = "PAWN_OFFERS",
}) {
  return {
    intakeId,
    title:
      `${prefix} submission`,
    description:
      `${prefix} submission description`,
    category:
      "Electronics",
    condition:
      "Good",
    estimatedValue:
      "145.50",
    images: [
      TEST_IMAGE,
    ],
    intent,
    radiusMiles:
      25,
  };
}

function listingPayload({
  intakeId,
  prefix,
}) {
  return {
    intakeId,
    listingType:
      "CUSTOMER_TO_CUSTOMER",
    title:
      `${prefix} listing`,
    description:
      `${prefix} listing description`,
    category:
      "Electronics",
    condition:
      "Good",
    price:
      145.5,
    currency:
      "USD",
    quantity:
      1,
    images: [
      TEST_IMAGE,
    ],
    allowOffers:
      true,
    pickupAvailable:
      true,
    shippingAvailable:
      false,
    metadata: {
      workflow:
        "customer-intake-linkage-integration-test",
    },
  };
}

async function createSubmissionRequest(
  buyer,
  payload,
) {
  return request(app)
    .post(
      "/api/buyer/item-submissions",
    )
    .set(
      "Authorization",
      `Bearer ${tokenFor(buyer)}`,
    )
    .send(
      payload,
    );
}

async function createListingRequest(
  buyer,
  payload,
) {
  return request(app)
    .post(
      "/api/marketplace-listings",
    )
    .set(
      "Authorization",
      `Bearer ${tokenFor(buyer)}`,
    )
    .send(
      payload,
    );
}

async function cleanupTestRecords() {
  const users =
    await prisma.user.findMany({
      where: {
        email: {
          endsWith:
            TEST_DOMAIN,
        },
      },
      select: {
        id: true,
      },
    });

  const userIds =
    users.map(
      (user) =>
        user.id,
    );

  if (
    userIds.length ===
    0
  ) {
    return;
  }

  const submissions =
    await prisma
      .buyerItemSubmission
      .findMany({
        where: {
          buyerId: {
            in:
              userIds,
          },
        },
        select: {
          id: true,
        },
      });

  const submissionIds =
    submissions.map(
      (submission) =>
        submission.id,
    );

  await prisma
    .itemIntake
    .deleteMany({
      where: {
        OR: [
          {
            customerId: {
              in:
                userIds,
            },
          },
          {
            capturedByUserId: {
              in:
                userIds,
            },
          },
        ],
      },
    });

  if (
    submissionIds.length
  ) {
    await prisma
      .buyerItemSubmissionOffer
      .deleteMany({
        where: {
          submissionId: {
            in:
              submissionIds,
          },
        },
      });
  }

  await prisma
    .marketplaceTransaction
    .deleteMany({
      where: {
        OR: [
          {
            buyerUserId: {
              in:
                userIds,
            },
          },
          {
            sellerUserId: {
              in:
                userIds,
            },
          },
        ],
      },
    });

  await prisma
    .marketplaceListing
    .deleteMany({
      where: {
        sellerUserId: {
          in:
            userIds,
        },
      },
    });

  await prisma
    .buyerItemSubmission
    .deleteMany({
      where: {
        buyerId: {
          in:
            userIds,
        },
      },
    });

  await prisma
    .pawnShop
    .deleteMany({
      where: {
        ownerId: {
          in:
            userIds,
        },
      },
    });

  await prisma.user.deleteMany({
    where: {
      id: {
        in:
          userIds,
      },
    },
  });
}

before(async () => {
  Object.assign(
    process.env,
    {
      NODE_ENV:
        "test",

      APP_ENV:
        "test",

      APP_NAME:
        "pawnloop-customer-intake-linkage-integration-test",

      JWT_SECRET:
        TEST_JWT_SECRET,

      AUCTION_SCHEDULER_ENABLED:
        "false",

      MARKETPLACE_RESERVATION_SCHEDULER_ENABLED:
        "false",

      STRIPE_SECRET_KEY:
        "sk_test_customer_intake_linkage_only",

      STRIPE_WEBHOOK_SECRET:
        "whsec_customer_intake_linkage_only",
    },
  );

  const rawDatabaseUrl =
    String(
      process.env.DATABASE_URL ||
      "",
    );

  assert.ok(
    rawDatabaseUrl,
    "DATABASE_URL is required",
  );

  const databaseName =
    decodeURIComponent(
      new URL(
        rawDatabaseUrl,
      ).pathname.replace(
        /^\/+/,
        "",
      ),
    );

  assert.equal(
    databaseName,
    "pawnshop_test",
    "Integration tests may only use pawnshop_test",
  );

  const appModule =
    await import(
      "../src/app.js"
    );

  const prismaModule =
    await import(
      "../src/lib/prisma.js"
    );

  app =
    appModule.createApp();

  prisma =
    prismaModule.prisma;

  passwordHash =
    await bcrypt.hash(
      "CustomerIntakeLinkage123!",
      4,
    );

  await cleanupTestRecords();
});

beforeEach(async () => {
  await cleanupTestRecords();
});

after(async () => {
  if (!prisma) {
    return;
  }

  await cleanupTestRecords();
  await prisma.$disconnect();
});

test(
  "owned customer pawn intake creates and links a buyer submission",
  async () => {
    const buyer =
      await createUser(
        "owned-pawn-buyer",
      );

    const intake =
      await createCustomerIntake({
        buyer,
        prefix:
          "owned-pawn",
        destination:
          "CUSTOMER_PAWN",
      });

    const response =
      await createSubmissionRequest(
        buyer,
        submissionPayload({
          intakeId:
            intake.id,
          prefix:
            "owned-pawn",
        }),
      );

    assert.equal(
      response.status,
      201,
    );

    assert.equal(
      response.body.success,
      true,
    );

    assert.equal(
      response.body.intakeId,
      intake.id,
    );

    const submission =
      response.body.submission;

    assert.ok(
      submission?.id,
    );

    assert.equal(
      submission.buyerId,
      buyer.id,
    );

    const storedIntake =
      await prisma
        .itemIntake
        .findUnique({
          where: {
            id:
              intake.id,
          },
          select: {
            linkedSubmissionId:
              true,
            linkedMarketplaceListingId:
              true,
          },
        });

    assert.equal(
      storedIntake
        ?.linkedSubmissionId,
      submission.id,
    );

    assert.equal(
      storedIntake
        ?.linkedMarketplaceListingId,
      null,
    );
  },
);

test(
  "owned customer marketplace intake creates and links a listing",
  async () => {
    const buyer =
      await createUser(
        "owned-marketplace-buyer",
      );

    const intake =
      await createCustomerIntake({
        buyer,
        prefix:
          "owned-marketplace",
        destination:
          "CUSTOMER_MARKETPLACE",
      });

    const response =
      await createListingRequest(
        buyer,
        listingPayload({
          intakeId:
            intake.id,
          prefix:
            "owned-marketplace",
        }),
      );

    assert.equal(
      response.status,
      201,
    );

    assert.equal(
      response.body.success,
      true,
    );

    assert.equal(
      response.body.intakeId,
      intake.id,
    );

    const listing =
      response.body.listing;

    assert.ok(
      listing?.id,
    );

    assert.equal(
      listing.sellerUserId,
      buyer.id,
    );

    assert.equal(
      listing.status,
      "DRAFT",
    );

    const storedIntake =
      await prisma
        .itemIntake
        .findUnique({
          where: {
            id:
              intake.id,
          },
          select: {
            linkedSubmissionId:
              true,
            linkedMarketplaceListingId:
              true,
          },
        });

    assert.equal(
      storedIntake
        ?.linkedSubmissionId,
      null,
    );

    assert.equal(
      storedIntake
        ?.linkedMarketplaceListingId,
      listing.id,
    );

    const storedListing =
      await prisma
        .marketplaceListing
        .findUnique({
          where: {
            id:
              listing.id,
          },
          select: {
            metadata:
              true,
          },
        });

    assert.equal(
      storedListing
        ?.metadata
        ?.intakeId,
      intake.id,
    );

    assert.equal(
      storedListing
        ?.metadata
        ?.linkageWorkflow,
      "customer-scan-intake-linkage-v1",
    );
  },
);

test(
  "another customer intake is hidden and creates no resources",
  async () => {
    const owner =
      await createUser(
        "private-intake-owner",
      );

    const attacker =
      await createUser(
        "private-intake-attacker",
      );

    const intake =
      await createCustomerIntake({
        buyer:
          owner,
        prefix:
          "private-intake",
        destination:
          "CUSTOMER_MARKETPLACE",
      });

    const beforeCounts =
      await Promise.all([
        prisma
          .buyerItemSubmission
          .count({
            where: {
              buyerId:
                attacker.id,
            },
          }),

        prisma
          .marketplaceListing
          .count({
            where: {
              sellerUserId:
                attacker.id,
            },
          }),
      ]);

    const submissionResponse =
      await createSubmissionRequest(
        attacker,
        submissionPayload({
          intakeId:
            intake.id,
          prefix:
            "private-intake",
          intent:
            "BOTH",
        }),
      );

    assert.equal(
      submissionResponse.status,
      404,
    );

    assert.equal(
      submissionResponse.body.code,
      "CUSTOMER_INTAKE_NOT_FOUND",
    );

    const listingResponse =
      await createListingRequest(
        attacker,
        listingPayload({
          intakeId:
            intake.id,
          prefix:
            "private-intake",
        }),
      );

    assert.equal(
      listingResponse.status,
      404,
    );

    assert.equal(
      listingResponse.body.code,
      "CUSTOMER_INTAKE_NOT_FOUND",
    );

    const afterCounts =
      await Promise.all([
        prisma
          .buyerItemSubmission
          .count({
            where: {
              buyerId:
                attacker.id,
            },
          }),

        prisma
          .marketplaceListing
          .count({
            where: {
              sellerUserId:
                attacker.id,
            },
          }),
      ]);

    assert.deepEqual(
      afterCounts,
      beforeCounts,
    );

    const storedIntake =
      await prisma
        .itemIntake
        .findUnique({
          where: {
            id:
              intake.id,
          },
          select: {
            linkedSubmissionId:
              true,
            linkedMarketplaceListingId:
              true,
          },
        });

    assert.equal(
      storedIntake
        ?.linkedSubmissionId,
      null,
    );

    assert.equal(
      storedIntake
        ?.linkedMarketplaceListingId,
      null,
    );
  },
);

test(
  "reusing an intake linkage field returns conflict without duplicates",
  async () => {
    const buyer =
      await createUser(
        "reuse-link-buyer",
      );

    const submissionIntake =
      await createCustomerIntake({
        buyer,
        prefix:
          "reuse-submission",
        destination:
          "CUSTOMER_PAWN",
      });

    const firstSubmission =
      await createSubmissionRequest(
        buyer,
        submissionPayload({
          intakeId:
            submissionIntake.id,
          prefix:
            "reuse-submission-first",
        }),
      );

    assert.equal(
      firstSubmission.status,
      201,
    );

    const submissionCountBefore =
      await prisma
        .buyerItemSubmission
        .count({
          where: {
            buyerId:
              buyer.id,
          },
        });

    const duplicateSubmission =
      await createSubmissionRequest(
        buyer,
        submissionPayload({
          intakeId:
            submissionIntake.id,
          prefix:
            "reuse-submission-second",
        }),
      );

    assert.equal(
      duplicateSubmission.status,
      409,
    );

    assert.equal(
      duplicateSubmission.body.code,
      "CUSTOMER_INTAKE_ALREADY_LINKED",
    );

    const submissionCountAfter =
      await prisma
        .buyerItemSubmission
        .count({
          where: {
            buyerId:
              buyer.id,
          },
        });

    assert.equal(
      submissionCountAfter,
      submissionCountBefore,
    );

    const listingIntake =
      await createCustomerIntake({
        buyer,
        prefix:
          "reuse-listing",
        destination:
          "CUSTOMER_MARKETPLACE",
      });

    const firstListing =
      await createListingRequest(
        buyer,
        listingPayload({
          intakeId:
            listingIntake.id,
          prefix:
            "reuse-listing-first",
        }),
      );

    assert.equal(
      firstListing.status,
      201,
    );

    const listingCountBefore =
      await prisma
        .marketplaceListing
        .count({
          where: {
            sellerUserId:
              buyer.id,
          },
        });

    const duplicateListing =
      await createListingRequest(
        buyer,
        listingPayload({
          intakeId:
            listingIntake.id,
          prefix:
            "reuse-listing-second",
        }),
      );

    assert.equal(
      duplicateListing.status,
      409,
    );

    assert.equal(
      duplicateListing.body.code,
      "CUSTOMER_INTAKE_ALREADY_LINKED",
    );

    const listingCountAfter =
      await prisma
        .marketplaceListing
        .count({
          where: {
            sellerUserId:
              buyer.id,
          },
        });

    assert.equal(
      listingCountAfter,
      listingCountBefore,
    );
  },
);

test(
  "one marketplace intake links to both submission and listing",
  async () => {
    const buyer =
      await createUser(
        "both-link-buyer",
      );

    const intake =
      await createCustomerIntake({
        buyer,
        prefix:
          "both-link",
        destination:
          "CUSTOMER_MARKETPLACE",
      });

    const submissionResponse =
      await createSubmissionRequest(
        buyer,
        submissionPayload({
          intakeId:
            intake.id,
          prefix:
            "both-link",
          intent:
            "BOTH",
        }),
      );

    assert.equal(
      submissionResponse.status,
      201,
    );

    const listingResponse =
      await createListingRequest(
        buyer,
        listingPayload({
          intakeId:
            intake.id,
          prefix:
            "both-link",
        }),
      );

    assert.equal(
      listingResponse.status,
      201,
    );

    const storedIntake =
      await prisma
        .itemIntake
        .findUnique({
          where: {
            id:
              intake.id,
          },
          select: {
            linkedSubmissionId:
              true,
            linkedMarketplaceListingId:
              true,
          },
        });

    assert.equal(
      storedIntake
        ?.linkedSubmissionId,
      submissionResponse
        .body
        .submission
        .id,
    );

    assert.equal(
      storedIntake
        ?.linkedMarketplaceListingId,
      listingResponse
        .body
        .listing
        .id,
    );

    assert.notEqual(
      storedIntake
        ?.linkedSubmissionId,
      storedIntake
        ?.linkedMarketplaceListingId,
    );
  },
);

test(
  "failed intake claim rolls back the newly created submission",
  async () => {
    const buyer =
      await createUser(
        "rollback-link-buyer",
      );

    const intake =
      await createCustomerIntake({
        buyer,
        prefix:
          "rollback-link",
        destination:
          "CUSTOMER_PAWN",
        status:
          "SCANNED",
      });

    const title =
      "rollback-link temporary submission";

    const countBefore =
      await prisma
        .buyerItemSubmission
        .count({
          where: {
            buyerId:
              buyer.id,
            title,
          },
        });

    await assert.rejects(
      () =>
        prisma.$transaction(
          async (tx) => {
            const submission =
              await tx
                .buyerItemSubmission
                .create({
                  data: {
                    buyerId:
                      buyer.id,
                    title,
                    description:
                      "This write must roll back.",
                    category:
                      "Electronics",
                    condition:
                      "Good",
                    estimatedValue:
                      "145.50",
                    images: [
                      TEST_IMAGE,
                    ],
                    intent:
                      "PAWN_OFFERS",
                    radiusMiles:
                      25,
                    status:
                      "SUBMITTED",
                  },
                });

            await claimCustomerItemIntakeLink({
              prismaClient:
                tx,

              intake: {
                ...intake,

                status:
                  "APPROVED",
              },

              customerId:
                buyer.id,

              resourceType:
                "SUBMISSION",

              resourceId:
                submission.id,
            });
          },
          {
            isolationLevel:
              "Serializable",
          },
        ),

      (error) => {
        assert.equal(
          error.statusCode,
          409,
        );

        assert.equal(
          error.linkageCode,
          "CUSTOMER_INTAKE_LINK_CONFLICT",
        );

        return true;
      },
    );

    const countAfter =
      await prisma
        .buyerItemSubmission
        .count({
          where: {
            buyerId:
              buyer.id,
            title,
          },
        });

    assert.equal(
      countAfter,
      countBefore,
    );

    const storedIntake =
      await prisma
        .itemIntake
        .findUnique({
          where: {
            id:
              intake.id,
          },
          select: {
            status:
              true,
            linkedSubmissionId:
              true,
            linkedMarketplaceListingId:
              true,
          },
        });

    assert.equal(
      storedIntake?.status,
      "SCANNED",
    );

    assert.equal(
      storedIntake
        ?.linkedSubmissionId,
      null,
    );

    assert.equal(
      storedIntake
        ?.linkedMarketplaceListingId,
      null,
    );
  },
);
