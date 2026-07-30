import crypto from "node:crypto";

const PUBLIC_ROLES = new Set(["CONSUMER", "OWNER"]);

function httpError(statusCode, code, message) {
  return Object.assign(new Error(message), { statusCode, code });
}

export function normalizeInviteEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return email || null;
}

export function digestInviteToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

export function isInviteEnforcementEnabled(env = process.env) {
  const raw = String(env.INVITE_ONLY_REGISTRATION_ENABLED ?? "false")
    .trim()
    .toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(
    "INVITE_ONLY_REGISTRATION_ENABLED must be explicitly true or false",
  );
}

export function safeInvite(invite) {
  return {
    id: invite.id,
    email: invite.email,
    intendedRole: invite.intendedRole,
    cohort: invite.cohort,
    maxUses: invite.maxUses,
    redeemedCount: invite.redeemedCount,
    remainingUses: Math.max(0, invite.maxUses - invite.redeemedCount),
    expiresAt: invite.expiresAt,
    revokedAt: invite.revokedAt,
    revokedByUserId: invite.revokedByUserId,
    issuedByUserId: invite.issuedByUserId,
    createdAt: invite.createdAt,
    updatedAt: invite.updatedAt,
  };
}

export async function issueBetaInvite(prismaClient, input, actor) {
  const cohort = String(input?.cohort || "").trim();
  const intendedRole = input?.intendedRole
    ? String(input.intendedRole).trim().toUpperCase()
    : null;
  const maxUses = Number(input?.maxUses ?? 1);
  const expiresAt = new Date(input?.expiresAt);
  const email = normalizeInviteEmail(input?.email);

  if (!cohort || cohort.length > 100) {
    throw httpError(400, "INVALID_INVITE_COHORT", "A beta cohort is required");
  }
  if (intendedRole && !PUBLIC_ROLES.has(intendedRole)) {
    throw httpError(400, "INVALID_INVITE_ROLE", "Intended role must be CONSUMER or OWNER");
  }
  if (!Number.isSafeInteger(maxUses) || maxUses < 1 || maxUses > 10000) {
    throw httpError(400, "INVALID_INVITE_CAPACITY", "maxUses must be between 1 and 10000");
  }
  if (Number.isNaN(expiresAt.valueOf()) || expiresAt <= new Date()) {
    throw httpError(400, "INVALID_INVITE_EXPIRATION", "expiresAt must be in the future");
  }

  const rawToken = crypto.randomBytes(32).toString("base64url");
  const invite = await prismaClient.$transaction(async (tx) => {
    const created = await tx.betaInvite.create({
      data: {
        tokenDigest: digestInviteToken(rawToken),
        email,
        intendedRole,
        cohort,
        maxUses,
        expiresAt,
        issuedByUserId: actor.id,
      },
    });
    await tx.superAdminAuditLog.create({
      data: {
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: "BETA_INVITE_ISSUED",
        method: "POST",
        path: "/api/super-admin/beta-invites",
        routeKey: "POST /api/super-admin/beta-invites",
        targetType: "BETA_INVITE",
        targetId: created.id,
        statusCode: 201,
        success: true,
        metadata: { cohort, email, intendedRole, maxUses, expiresAt },
      },
    });
    return created;
  });
  return { invite: safeInvite(invite), token: rawToken };
}

export function assertInviteEligible(invite, { email, role, now = new Date() }) {
  if (!invite) throw httpError(403, "INVALID_INVITE", "A valid invitation is required");
  if (invite.revokedAt) throw httpError(403, "INVITE_REVOKED", "This invitation has been revoked");
  if (invite.expiresAt <= now) throw httpError(403, "INVITE_EXPIRED", "This invitation has expired");
  if (invite.redeemedCount >= invite.maxUses) throw httpError(403, "INVITE_EXHAUSTED", "This invitation has no remaining uses");
  if (invite.email && invite.email !== normalizeInviteEmail(email)) {
    throw httpError(403, "INVITE_EMAIL_MISMATCH", "This invitation is restricted to another email");
  }
  if (invite.intendedRole && invite.intendedRole !== role) {
    throw httpError(403, "INVITE_ROLE_MISMATCH", "This invitation is restricted to another role");
  }
}

export async function redeemInviteInTransaction(tx, { token, user, role }) {
  const invite = await tx.betaInvite.findUnique({
    where: { tokenDigest: digestInviteToken(token) },
  });
  assertInviteEligible(invite, { email: user.email, role });

  const claimed = await tx.betaInvite.updateMany({
    where: {
      id: invite.id,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      redeemedCount: { lt: invite.maxUses },
    },
    data: { redeemedCount: { increment: 1 } },
  });
  if (claimed.count !== 1) {
    throw httpError(403, "INVITE_EXHAUSTED", "This invitation has no remaining uses");
  }

  await tx.betaInviteRedemption.create({
    data: { inviteId: invite.id, userId: user.id },
  });
  await tx.superAdminAuditLog.create({
    data: {
      actorId: user.id,
      actorEmail: user.email,
      actorRole: role,
      action: "BETA_INVITE_REDEEMED",
      method: "POST",
      path: "/api/auth/register",
      routeKey: "POST /api/auth/register",
      targetType: "BETA_INVITE",
      targetId: invite.id,
      statusCode: 201,
      success: true,
      metadata: { cohort: invite.cohort, userId: user.id, role },
    },
  });
  return invite;
}
