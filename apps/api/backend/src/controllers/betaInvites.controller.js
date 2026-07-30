import { prisma } from "../lib/prisma.js";
import {
  issueBetaInvite,
  safeInvite,
} from "../services/betaInvite.service.js";

function sendError(res, error, fallback) {
  return res.status(error?.statusCode || 500).json({
    error: error?.message || fallback,
    ...(error?.code ? { code: error.code } : {}),
  });
}

export async function createBetaInvite(req, res) {
  try {
    const result = await issueBetaInvite(prisma, req.body, req.user);
    return res.status(201).json({ success: true, ...result });
  } catch (error) {
    return sendError(res, error, "Unable to issue invitation");
  }
}

export async function listBetaInvites(req, res) {
  const q = String(req.query?.q || "").trim();
  const cohort = String(req.query?.cohort || "").trim();
  const limit = Math.min(Math.max(Number(req.query?.limit) || 50, 1), 250);
  const where = {
    ...(cohort ? { cohort } : {}),
    ...(q
      ? {
          OR: [
            { cohort: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const invites = await prisma.betaInvite.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
  });
  return res.json({ success: true, invites: invites.map(safeInvite) });
}

export async function getBetaInvite(req, res) {
  const invite = await prisma.betaInvite.findUnique({
    where: { id: req.params.id },
    include: {
      redemptions: {
        select: { id: true, userId: true, redeemedAt: true },
        orderBy: { redeemedAt: "desc" },
      },
    },
  });
  if (!invite) return res.status(404).json({ error: "Invitation not found" });
  return res.json({
    success: true,
    invite: { ...safeInvite(invite), redemptions: invite.redemptions },
  });
}

export async function revokeBetaInvite(req, res) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.betaInvite.findUnique({ where: { id: req.params.id } });
      if (!current) throw Object.assign(new Error("Invitation not found"), { statusCode: 404 });
      if (current.revokedAt) return current;
      const revoked = await tx.betaInvite.update({
        where: { id: current.id },
        data: { revokedAt: new Date(), revokedByUserId: req.user.id },
      });
      await tx.superAdminAuditLog.create({
        data: {
          actorId: req.user.id,
          actorEmail: req.user.email,
          actorRole: req.user.role,
          action: "BETA_INVITE_REVOKED",
          method: "POST",
          path: `/api/super-admin/beta-invites/${current.id}/revoke`,
          routeKey: "POST /api/super-admin/beta-invites/:id/revoke",
          targetType: "BETA_INVITE",
          targetId: current.id,
          statusCode: 200,
          success: true,
          metadata: { cohort: current.cohort },
        },
      });
      return revoked;
    });
    return res.json({ success: true, invite: safeInvite(result) });
  } catch (error) {
    return sendError(res, error, "Unable to revoke invitation");
  }
}
