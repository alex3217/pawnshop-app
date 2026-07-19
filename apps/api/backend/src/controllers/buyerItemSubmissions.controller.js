import { prisma } from "../lib/prisma.js";
import {
  claimCustomerItemIntakeLink,
  loadCustomerItemIntakeForLinkage,
  recordItemIntakeScan,
} from "../services/itemIntake.service.js";

const CUSTOMER_SCAN_DESTINATIONS =
  new Set([
    "CUSTOMER_MARKETPLACE",
    "CUSTOMER_PAWN",
    "CUSTOMER_SELL",
  ]);

function normalizeString(value) {
  const normalized = String(value ?? "").trim();
  return normalized || "";
}

function normalizeAmount(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed.toFixed(2);
}

function normalizeImages(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
    .slice(0, 6);
}

function getUserId(req) {
  return normalizeString(req.user?.id || req.user?.userId || req.auth?.userId);
}


function sendBuyerSubmissionCreateError(
  res,
  error,
) {
  const prismaConflict =
    error?.code === "P2002" ||
    error?.code === "P2034";

  const status =
    Number.isInteger(
      error?.statusCode,
    ) &&
    error.statusCode >= 400
      ? error.statusCode
      : prismaConflict
        ? 409
        : 500;

  if (status >= 500) {
    console.error(
      "[buyer-item-submissions] create failed:",
      error,
    );
  }

  return res.status(
    status,
  ).json({
    success:
      false,

    error:
      status >= 500
        ? "Failed to create buyer item submission"
        : error?.message ||
          "Failed to create buyer item submission",

    ...(
      error?.linkageCode
        ? {
            code:
              error.linkageCode,
          }
        : prismaConflict
          ? {
              code:
                "CUSTOMER_INTAKE_LINK_CONFLICT",
            }
          : {}
    ),
  });
}

function normalizeSubmission(row) {
  if (!row) return row;

  return {
    ...row,
    estimatedValue:
      row.estimatedValue === null || row.estimatedValue === undefined
        ? null
        : String(row.estimatedValue),
  };
}


export async function createBuyerItemSubmission(req, res) {
  try {
    const buyerId =
      getUserId(
        req,
      );

    if (!buyerId) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    const intakeId =
      normalizeString(
        req.body?.intakeId,
      );

    const title =
      normalizeString(
        req.body?.title,
      );

    const category =
      normalizeString(
        req.body?.category,
      );

    const condition =
      normalizeString(
        req.body?.condition,
      );

    const description =
      normalizeString(
        req.body?.description,
      );

    const intent =
      normalizeString(
        req.body?.intent,
      ) ||
      "PAWN_OFFERS";

    const radiusMiles =
      Number.parseInt(
        String(
          req.body?.radiusMiles ||
          req.body?.radius ||
          25,
        ),
        10,
      );

    const estimatedValue =
      normalizeAmount(
        req.body?.estimatedValue,
      );

    const images =
      normalizeImages(
        req.body?.images,
      );

    if (!title) {
      return res.status(400).json({
        success: false,
        error: "Title is required",
      });
    }

    if (!category) {
      return res.status(400).json({
        success: false,
        error: "Category is required",
      });
    }

    if (!condition) {
      return res.status(400).json({
        success: false,
        error: "Condition is required",
      });
    }

    if (!images.length) {
      return res.status(400).json({
        success: false,
        error: "At least one photo is required",
      });
    }

    const submissionData = {
      buyerId,
      title,
      category,
      condition,
      description,
      intent,

      radiusMiles:
        Number.isFinite(
          radiusMiles,
        )
          ? radiusMiles
          : 25,

      estimatedValue,
      images,
      status:
        "SUBMITTED",
    };

    let submission;

    if (intakeId) {
      submission =
        await prisma.$transaction(
          async (tx) => {
            const intake =
              await loadCustomerItemIntakeForLinkage({
                prismaClient:
                  tx,

                intakeId,
                customerId:
                  buyerId,

                resourceType:
                  "SUBMISSION",
              });

            const created =
              await tx
                .buyerItemSubmission
                .create({
                  data:
                    submissionData,
                });

            await claimCustomerItemIntakeLink({
              prismaClient:
                tx,

              intake,
              customerId:
                buyerId,

              resourceType:
                "SUBMISSION",

              resourceId:
                created.id,
            });

            return created;
          },
          {
            isolationLevel:
              "Serializable",
          },
        );
    } else {
      submission =
        await prisma
          .buyerItemSubmission
          .create({
            data:
              submissionData,
          });
    }

    return res.status(201).json({
      success:
        true,

      submission:
        normalizeSubmission(
          submission,
        ),

      intakeId:
        intakeId ||
        null,
    });
  } catch (error) {
    return sendBuyerSubmissionCreateError(
      res,
      error,
    );
  }
}

export async function scanBuyerItemSubmission(
  req,
  res,
) {
  try {
    const buyerId =
      getUserId(req);

    if (!buyerId) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    const code =
      normalizeString(
        req.body?.code,
      );

    const destination =
      (
        normalizeString(
          req.body?.destination,
        ) ||
        "CUSTOMER_MARKETPLACE"
      ).toUpperCase();

    if (!code) {
      return res.status(400).json({
        success: false,
        error: "Scan code is required",
      });
    }

    if (
      !CUSTOMER_SCAN_DESTINATIONS.has(
        destination,
      )
    ) {
      return res.status(400).json({
        success: false,
        error:
          "Invalid customer scan destination",
      });
    }

    const {
      intake,
      analysis,
    } = await recordItemIntakeScan({
      prismaClient:
        prisma,

      shopId:
        null,

      capturedByUserId:
        buyerId,

      code,

      input: {
        ...req.body,

        customerId:
          buyerId,

        destination,

        intakeSource:
          req.body?.intakeSource ||
          req.body?.source ||
          "MANUAL",
      },
    });

    const title =
      normalizeString(
        req.body?.title,
      ) ||
      `Scanned ${analysis.codeType} ${analysis.normalizedCode}`;

    const description =
      normalizeString(
        req.body?.description,
      ) ||
      `Created from scan code ${analysis.normalizedCode}`;

    const category =
      normalizeString(
        req.body?.category,
      ) ||
      "Electronics";

    const condition =
      normalizeString(
        req.body?.condition,
      ) ||
      "Good";

    const estimatedValue =
      normalizeAmount(
        req.body?.estimatedValue ??
        req.body?.price,
      );

    const images =
      normalizeImages(
        req.body?.images,
      );

    const reviewRequired =
      intake.status ===
        "NEEDS_REVIEW" ||
      intake.duplicateStatus ===
        "MATCH_FOUND" ||
      intake.screeningStatus !==
        "CLEAR";

    return res.json({
      success:
        true,

      data: {
        title,
        description,
        category,
        condition,
        estimatedValue,
        price:
          estimatedValue,
        images,

        code:
          analysis.normalizedCode,

        codeType:
          analysis.codeType,

        source:
          "customer-scan",

        destination:
          intake.destination,

        intakeId:
          intake.id,

        intakeStatus:
          intake.status,

        duplicateStatus:
          intake.duplicateStatus,

        screeningStatus:
          intake.screeningStatus,

        reviewRequired,
      },

      intake,
    });
  } catch (error) {
    console.error(
      "[buyer-item-submissions] scan failed:",
      error,
    );

    return res.status(500).json({
      success: false,
      error:
        "Failed to resolve customer item scan",
    });
  }
}

export async function getMyBuyerItemSubmissions(req, res) {
  try {
    const buyerId = getUserId(req);

    if (!buyerId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    const submissions = await prisma.buyerItemSubmission.findMany({
      where: { buyerId },
      orderBy: { createdAt: "desc" },
    });

    return res.json({
      success: true,
      submissions: submissions.map(normalizeSubmission),
    });
  } catch (error) {
    console.error("[buyer-item-submissions] mine failed:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to load buyer item submissions",
    });
  }
}

export async function withdrawBuyerItemSubmission(req, res) {
  try {
    const buyerId = getUserId(req);
    const id = normalizeString(req.params?.id);

    if (!buyerId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    if (!id) {
      return res.status(400).json({ success: false, error: "Submission id is required" });
    }

    const existing = await prisma.buyerItemSubmission.findUnique({ where: { id } });

    if (!existing || existing.buyerId !== buyerId) {
      return res.status(404).json({ success: false, error: "Submission not found" });
    }

    if (["ACCEPTED", "LISTED"].includes(String(existing.status || "").toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: "Accepted or listed submissions cannot be withdrawn",
      });
    }

    const submission = await prisma.buyerItemSubmission.update({
      where: { id },
      data: { status: "WITHDRAWN" },
    });

    return res.json({
      success: true,
      submission: normalizeSubmission(submission),
    });
  } catch (error) {
    console.error("[buyer-item-submissions] withdraw failed:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to withdraw buyer item submission",
    });
  }
}

export async function getOwnerBuyerItemSubmissions(req, res) {
  try {
    const rows = await prisma.buyerItemSubmission.findMany({
      where: {
        status: {
          in: ["SUBMITTED", "REVIEWING", "OFFERED"],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        buyer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return res.json({
      success: true,
      submissions: rows.map(normalizeSubmission),
    });
  } catch (error) {
    console.error("[buyer-item-submissions] owner list failed:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to load incoming buyer item submissions",
    });
  }
}

export async function reviewBuyerItemSubmission(req, res) {
  try {
    const reviewerId = getUserId(req);
    const id = normalizeString(req.params?.id);
    const status = normalizeString(req.body?.status);
    const reviewMessage = normalizeString(req.body?.reviewMessage);

    if (!reviewerId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    if (!id) {
      return res.status(400).json({ success: false, error: "Submission id is required" });
    }

    const allowed = new Set(["REVIEWING", "OFFERED", "REJECTED", "NEEDS_INFO"]);

    if (!allowed.has(status)) {
      return res.status(400).json({
        success: false,
        error: "Invalid review status",
      });
    }

    const submission = await prisma.buyerItemSubmission.update({
      where: { id },
      data: {
        status,
        reviewMessage: reviewMessage || undefined,
        reviewedAt: new Date(),
        reviewedById: reviewerId,
      },
    });

    return res.json({
      success: true,
      submission: normalizeSubmission(submission),
    });
  } catch (error) {
    console.error("[buyer-item-submissions] review failed:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to review buyer item submission",
    });
  }
}

function normalizeSubmissionOffer(row) {
  if (!row) return row;

  return {
    ...row,
    amount:
      row.amount === null || row.amount === undefined ? null : String(row.amount),
  };
}

export async function createBuyerItemSubmissionOffer(req, res) {
  try {
    const ownerId = getUserId(req);
    const submissionId = normalizeString(req.params?.id);
    const shopId = normalizeString(req.body?.shopId);
    const amount = normalizeAmount(req.body?.amount);
    const message = normalizeString(req.body?.message);

    if (!ownerId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    if (!submissionId) {
      return res.status(400).json({ success: false, error: "Submission id is required" });
    }

    if (!shopId) {
      return res.status(400).json({ success: false, error: "Shop id is required" });
    }

    if (!amount) {
      return res.status(400).json({ success: false, error: "Valid offer amount is required" });
    }

    const submission = await prisma.buyerItemSubmission.findUnique({
      where: { id: submissionId },
    });

    if (!submission) {
      return res.status(404).json({ success: false, error: "Submission not found" });
    }

    if (["WITHDRAWN", "REJECTED", "ACCEPTED", "LISTED"].includes(String(submission.status || "").toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: "This submission is no longer open for offers",
      });
    }

    const requesterRole = String(req.user?.role || req.user?.user?.role || "").toUpperCase();

    const shop = await prisma.pawnShop.findFirst({
      where:
        requesterRole === "ADMIN" || requesterRole === "SUPER_ADMIN"
          ? { id: shopId, isDeleted: false }
          : { id: shopId, ownerId, isDeleted: false },
      select: { id: true },
    });

    if (!shop) {
      return res.status(403).json({
        success: false,
        error: "You can only make offers from one of your shops",
      });
    }

    const offer = await prisma.buyerItemSubmissionOffer.create({
      data: {
        submissionId,
        shopId,
        ownerId,
        amount,
        message,
        status: "PENDING",
      },
      include: {
        shop: {
          select: { id: true, name: true, address: true, phone: true },
        },
      },
    });

    await prisma.buyerItemSubmission.update({
      where: { id: submissionId },
      data: {
        status: "OFFERED",
        reviewMessage: message || "Shop made an offer on this item.",
        reviewedAt: new Date(),
        reviewedById: ownerId,
      },
    });

    return res.status(201).json({
      success: true,
      offer: normalizeSubmissionOffer(offer),
    });
  } catch (error) {
    console.error("[buyer-item-submissions] offer create failed:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to create buyer item submission offer",
    });
  }
}

export async function getMyBuyerItemSubmissionOffers(req, res) {
  try {
    const buyerId = getUserId(req);

    if (!buyerId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    const offers = await prisma.buyerItemSubmissionOffer.findMany({
      where: {
        submission: { buyerId },
      },
      orderBy: { createdAt: "desc" },
      include: {
        submission: true,
        shop: {
          select: { id: true, name: true, address: true, phone: true },
        },
      },
    });

    return res.json({
      success: true,
      offers: offers.map(normalizeSubmissionOffer),
    });
  } catch (error) {
    console.error("[buyer-item-submissions] buyer offers failed:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to load buyer item submission offers",
    });
  }
}

export async function acceptBuyerItemSubmissionOffer(req, res) {
  try {
    const buyerId = getUserId(req);
    const offerId = normalizeString(req.params?.offerId);

    if (!buyerId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    if (!offerId) {
      return res.status(400).json({ success: false, error: "Offer id is required" });
    }

    const existing = await prisma.buyerItemSubmissionOffer.findUnique({
      where: { id: offerId },
      include: { submission: true },
    });

    if (!existing || existing.submission.buyerId !== buyerId) {
      return res.status(404).json({ success: false, error: "Offer not found" });
    }

    if (String(existing.status || "").toUpperCase() !== "PENDING") {
      return res.status(400).json({
        success: false,
        error: "Only pending offers can be accepted",
      });
    }

    const offer = await prisma.buyerItemSubmissionOffer.update({
      where: { id: offerId },
      data: {
        status: "ACCEPTED",
        respondedAt: new Date(),
      },
      include: {
        submission: true,
        shop: {
          select: { id: true, name: true, address: true, phone: true },
        },
      },
    });

    await prisma.buyerItemSubmissionOffer.updateMany({
      where: {
        submissionId: existing.submissionId,
        id: { not: offerId },
        status: "PENDING",
      },
      data: {
        status: "REJECTED",
        respondedAt: new Date(),
      },
    });

    await prisma.buyerItemSubmission.update({
      where: { id: existing.submissionId },
      data: {
        status: "ACCEPTED",
        reviewMessage: "Buyer accepted a shop offer.",
      },
    });

    return res.json({
      success: true,
      offer: normalizeSubmissionOffer(offer),
    });
  } catch (error) {
    console.error("[buyer-item-submissions] offer accept failed:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to accept buyer item submission offer",
    });
  }
}

export async function rejectBuyerItemSubmissionOffer(req, res) {
  try {
    const buyerId = getUserId(req);
    const offerId = normalizeString(req.params?.offerId);

    if (!buyerId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    if (!offerId) {
      return res.status(400).json({ success: false, error: "Offer id is required" });
    }

    const existing = await prisma.buyerItemSubmissionOffer.findUnique({
      where: { id: offerId },
      include: { submission: true },
    });

    if (!existing || existing.submission.buyerId !== buyerId) {
      return res.status(404).json({ success: false, error: "Offer not found" });
    }

    if (String(existing.status || "").toUpperCase() !== "PENDING") {
      return res.status(400).json({
        success: false,
        error: "Only pending offers can be rejected",
      });
    }

    const offer = await prisma.buyerItemSubmissionOffer.update({
      where: { id: offerId },
      data: {
        status: "REJECTED",
        respondedAt: new Date(),
      },
      include: {
        submission: true,
        shop: {
          select: { id: true, name: true, address: true, phone: true },
        },
      },
    });

    return res.json({
      success: true,
      offer: normalizeSubmissionOffer(offer),
    });
  } catch (error) {
    console.error("[buyer-item-submissions] offer reject failed:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to reject buyer item submission offer",
    });
  }
}
