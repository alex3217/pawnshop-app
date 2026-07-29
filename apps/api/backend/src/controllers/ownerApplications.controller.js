import { z } from "zod";
import { prisma } from "../lib/prisma.js";

const optionalText = (maximum) =>
  z.union([z.string().trim().max(maximum), z.null()]).optional();

const addressSchema = z
  .object({
    line1: z.string().trim().min(1).max(160),
    line2: optionalText(160),
    city: z.string().trim().min(1).max(100),
    state: z.string().trim().min(2).max(80),
    postalCode: z.string().trim().min(3).max(20),
    country: z.string().trim().min(2).max(80).default("US"),
  })
  .strict();

const applicationUpdateSchema = z
  .object({
    businessName: optionalText(160),
    businessType: optionalText(80),
    businessEmail: z
      .union([z.email().trim().toLowerCase().max(254), z.literal(""), z.null()])
      .optional(),
    businessPhone: optionalText(40),
    websiteUrl: z
      .union([z.url().trim().max(500), z.literal(""), z.null()])
      .optional(),
    businessAddress: z.union([addressSchema, z.null()]).optional(),
    licenseNumber: optionalText(100),
    licenseState: optionalText(80),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one application field to update.",
  });

function ownerIdFrom(req) {
  return String(req.user?.sub || req.user?.id || req.user?.userId || "").trim();
}

function requireOwner(req) {
  if (req.user?.role !== "OWNER") {
    const error = new Error("Forbidden");
    error.statusCode = 403;
    throw error;
  }
  return ownerIdFrom(req);
}

function sendError(res, error, fallback) {
  const status =
    Number.isInteger(error?.statusCode) && error.statusCode >= 400
      ? error.statusCode
      : 500;
  return res.status(status).json({
    success: false,
    error: error?.message || fallback,
    ...(error?.details ? { details: error.details } : {}),
  });
}

function toIso(value) {
  return value ? new Date(value).toISOString() : null;
}

function serializeApplicantApplication(application) {
  return {
    id: application.id,
    status: application.status,
    businessName: application.businessName,
    businessType: application.businessType,
    businessEmail: application.businessEmail,
    businessPhone: application.businessPhone,
    websiteUrl: application.websiteUrl,
    businessAddress: application.businessAddress ?? null,
    licenseNumber: application.licenseNumber,
    licenseState: application.licenseState,
    submittedAt: toIso(application.submittedAt),
    reviewedAt: toIso(application.reviewedAt),
    decisionReason: application.decisionReason,
    statusChangedAt: toIso(application.statusChangedAt),
    updatedAt: toIso(application.updatedAt),
    canEdit: application.status === "INFORMATION_REQUESTED",
    canResubmit: application.status === "INFORMATION_REQUESTED",
  };
}

async function findOwnedApplication(ownerId) {
  const application = await prisma.ownerApplication.findUnique({
    where: { ownerId },
  });
  if (!application) {
    const error = new Error("Owner application not found.");
    error.statusCode = 404;
    throw error;
  }
  return application;
}

export async function getMyOwnerApplication(req, res) {
  try {
    const application = await findOwnedApplication(requireOwner(req));
    return res.json({
      success: true,
      application: serializeApplicantApplication(application),
    });
  } catch (error) {
    return sendError(res, error, "Failed to load owner application.");
  }
}

export async function updateMyOwnerApplication(req, res) {
  try {
    const ownerId = requireOwner(req);
    const parsed = applicationUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      const error = new Error("Application details are invalid.");
      error.statusCode = 400;
      error.details = parsed.error.flatten();
      throw error;
    }

    const existing = await findOwnedApplication(ownerId);
    if (existing.status !== "INFORMATION_REQUESTED") {
      const error = new Error(
        "Application details can only be changed when information is requested.",
      );
      error.statusCode = 409;
      throw error;
    }

    const data = Object.fromEntries(
      Object.entries(parsed.data).map(([key, value]) => [
        key,
        value === "" ? null : value,
      ]),
    );
    const result = await prisma.ownerApplication.updateMany({
      where: {
        id: existing.id,
        ownerId,
        status: "INFORMATION_REQUESTED",
      },
      data,
    });
    if (result.count !== 1) {
      const error = new Error(
        "Application status changed while it was being updated. Refresh and try again.",
      );
      error.statusCode = 409;
      throw error;
    }

    return res.json({
      success: true,
      application: serializeApplicantApplication(
        await findOwnedApplication(ownerId),
      ),
    });
  } catch (error) {
    return sendError(res, error, "Failed to update owner application.");
  }
}

export async function resubmitMyOwnerApplication(req, res) {
  try {
    const ownerId = requireOwner(req);
    if (Object.keys(req.body || {}).length > 0) {
      const error = new Error("Resubmission does not accept application fields.");
      error.statusCode = 400;
      throw error;
    }

    const existing = await findOwnedApplication(ownerId);
    if (existing.status !== "INFORMATION_REQUESTED") {
      const error = new Error(
        "Only an application awaiting requested information can be resubmitted.",
      );
      error.statusCode = 409;
      throw error;
    }

    const now = new Date();
    const application = await prisma.$transaction(async (transaction) => {
      const result = await transaction.ownerApplication.updateMany({
        where: {
          id: existing.id,
          ownerId,
          status: "INFORMATION_REQUESTED",
        },
        data: {
          status: "IN_REVIEW",
          submittedAt: now,
          statusChangedAt: now,
        },
      });
      if (result.count !== 1) {
        const error = new Error(
          "Application was already resubmitted or changed. Refresh to see its current status.",
        );
        error.statusCode = 409;
        throw error;
      }

      const event = await transaction.ownerApplicationResubmission.create({
        data: {
          ownerApplicationId: existing.id,
          ownerId,
          previousStatus: "INFORMATION_REQUESTED",
          newStatus: "IN_REVIEW",
          submittedAt: now,
        },
      });

      const administrators = await transaction.user.findMany({
        where: {
          role: { in: ["ADMIN", "SUPER_ADMIN"] },
          isActive: true,
        },
        select: { id: true },
      });
      if (administrators.length > 0) {
        await transaction.notification.createMany({
          data: administrators.map((administrator) => ({
            userId: administrator.id,
            type: "OWNER_APPLICATION_RESUBMITTED",
            title: "Owner application resubmitted",
            message: `${existing.businessName || "An owner"} submitted requested corrections.`,
            actionUrl: "/admin/owner-applications",
            dedupeKey: `owner-application-resubmitted:${event.id}:${administrator.id}`,
          })),
          skipDuplicates: true,
        });
      }

      return transaction.ownerApplication.findUnique({
        where: { id: existing.id },
      });
    });

    return res.json({
      success: true,
      application: serializeApplicantApplication(application),
    });
  } catch (error) {
    return sendError(res, error, "Failed to resubmit owner application.");
  }
}

