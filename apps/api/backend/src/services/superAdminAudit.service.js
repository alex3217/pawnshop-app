import { prisma } from "../lib/prisma.js";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const SENSITIVE_KEYS = [
  "password",
  "newPassword",
  "currentPassword",
  "token",
  "accessToken",
  "refreshToken",
  "secret",
  "webhookSecret",
  "stripeSecret",
  "stripeSecretKey",
  "apiKey",
  "authorization",
  "cookie",
  "credential",
  "cardNumber",
  "cvc",
  "cvv",
  "paymentMethod",
  "bankAccount",
  "routingNumber",
];

// Stable, application-specific two-int32 namespace/key pair. PostgreSQL holds
// this lock only for the current transaction and releases it on rollback too.
const GOVERNANCE_LOCK_NAMESPACE = 1885434471;
const SUPER_ADMIN_GOVERNANCE_LOCK_KEY = 1935764577;

function isSensitiveKey(key = "") {
  const normalized = String(key).toLowerCase();
  return SENSITIVE_KEYS.some((sensitive) =>
    normalized.includes(String(sensitive).toLowerCase()),
  );
}

function redactValue(value) {
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }

  if (value && typeof value === "object") {
    const next = {};

    for (const [key, child] of Object.entries(value)) {
      next[key] = isSensitiveKey(key) ? "[REDACTED]" : redactValue(child);
    }

    return next;
  }

  return value;
}

function safeJson(value) {
  try {
    return JSON.parse(JSON.stringify(redactValue(value ?? null)));
  } catch {
    return null;
  }
}

export function redactSuperAdminAuditMetadata(value) {
  return safeJson(value);
}

function governanceError(message, code) {
  const error = new Error(message);
  error.statusCode = 403;
  error.code = code;
  return error;
}

function actorIdFromRequest(req) {
  return String(req?.user?.sub || req?.user?.id || req?.user?.userId || "").trim();
}

function actorRoleFromRequest(req) {
  return String(req?.user?.role || "").trim().toUpperCase();
}

function requireGovernanceActor(req) {
  const role = actorRoleFromRequest(req);
  if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
    throw governanceError("Admin access required.", "ADMIN_REQUIRED");
  }
  return role;
}

function userMutationRemovesSuperAdmin(target, update) {
  return Boolean(
    target?.role === "SUPER_ADMIN" &&
      target?.isActive === true &&
      (update?.isActive === false ||
        (update?.role !== undefined && update.role !== "SUPER_ADMIN")),
  );
}

function userMutationSelfLocks(update) {
  return Boolean(
    update?.isActive === false ||
      (update?.role !== undefined && update.role !== "SUPER_ADMIN"),
  );
}

async function acquireSuperAdminGovernanceLock(tx) {
  const rows = await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(
      CAST(${GOVERNANCE_LOCK_NAMESPACE} AS INTEGER),
      CAST(${SUPER_ADMIN_GOVERNANCE_LOCK_KEY} AS INTEGER)
    ) IS NULL AS acquired
  `;

  if (!Array.isArray(rows) || rows.length !== 1 || !("acquired" in rows[0])) {
    throw new Error("Failed to acquire the Super Admin governance lock.");
  }
}

function auditData(req, entry) {
  const actor = getActor(req);

  return {
    ...actor,
    action: entry.action,
    method: String(req?.method || "").toUpperCase(),
    path: String(req?.originalUrl || req?.url || ""),
    routeKey: getRouteKey(req),
    targetType: entry.targetType,
    targetId: entry.targetId,
    statusCode: entry.statusCode || 200,
    success: entry.success !== false,
    requestId:
      String(req?.id || req?.requestId || req?.headers?.["x-request-id"] || "") ||
      null,
    ipAddress: getRequestIp(req),
    userAgent: String(req?.headers?.["user-agent"] || "") || null,
    metadata: safeJson(entry.metadata || {}),
  };
}

export async function runGovernedUserMutation({
  req,
  targetUserId,
  update,
  action,
  reason,
  prismaClient = prisma,
}) {
  const actorId = actorIdFromRequest(req);
  const actorRole = requireGovernanceActor(req);

  if (actorRole === "ADMIN" && update?.role === "SUPER_ADMIN") {
    throw governanceError(
      "Only Super Admin can assign Super Admin role.",
      "SUPER_ADMIN_REQUIRED",
    );
  }

  return prismaClient.$transaction(
    async (tx) => {
      // Serialize every potentially destructive Super Admin mutation across
      // users. The transaction-scoped PostgreSQL lock is released on commit or
      // rollback and prevents concurrent requests from both passing a stale
      // active-admin count.
      await acquireSuperAdminGovernanceLock(tx);

      const target = await tx.user.findUnique({ where: { id: targetUserId } });
      if (!target) {
        const error = new Error("User not found.");
        error.statusCode = 404;
        throw error;
      }

      if (actorRole !== "SUPER_ADMIN" && target.role === "SUPER_ADMIN") {
        throw governanceError(
          "Only Super Admin can modify a Super Admin account.",
          "SUPER_ADMIN_REQUIRED",
        );
      }

      const removesSuperAdmin = userMutationRemovesSuperAdmin(target, update);
      if (
        target.role === "SUPER_ADMIN" &&
        actorId &&
        actorId === target.id &&
        userMutationSelfLocks(update)
      ) {
        throw governanceError(
          "Super Admins cannot deactivate or demote their own account.",
          "SUPER_ADMIN_SELF_LOCKOUT",
        );
      }

      if (removesSuperAdmin) {
        const activeSuperAdmins = await tx.user.count({
          where: { role: "SUPER_ADMIN", isActive: true },
        });

        if (activeSuperAdmins <= 1) {
          throw governanceError(
            "At least one active Super Admin account must remain.",
            "LAST_ACTIVE_SUPER_ADMIN",
          );
        }
      }

      const updated = await tx.user.update({
        where: { id: targetUserId },
        data: update,
      });

      if (!tx.superAdminAuditLog?.create) {
        throw new Error("Super Admin audit persistence is unavailable.");
      }

      await tx.superAdminAuditLog.create({
        data: auditData(req, {
          action,
          targetType: "USER",
          targetId: targetUserId,
          metadata: { reason, beforeState: { role: target.role, isActive: target.isActive }, afterState: { role: updated.role, isActive: updated.isActive }, update },
        }),
      });

      // The controller owns the single transactional success audit for this
      // route, so the generic response listener must not add another record.
      req.skipPersistedSuperAdminAudit = true;
      return updated;
    },
    // READ COMMITTED gives the count statement a fresh snapshot after a
    // concurrent transaction releases the advisory lock. The lock itself
    // serializes the invariant check and mutation.
    { isolationLevel: "ReadCommitted" },
  );
}

export async function runGovernedShopMutation({
  req,
  targetShopId,
  update,
  action,
  include,
  select,
  metadata,
  beforeUpdate,
  afterUpdate,
  statusCode = 200,
  prismaClient = prisma,
}) {
  requireGovernanceActor(req);

  return prismaClient.$transaction(async (tx) => {
    const previous = beforeUpdate ? await beforeUpdate(tx) : undefined;
    const updated = await tx.pawnShop.update({
      where: { id: targetShopId },
      data: update,
      ...(include ? { include } : {}),
      ...(select ? { select } : {}),
    });
    if (afterUpdate) await afterUpdate(tx, updated, previous);

    if (!tx.superAdminAuditLog?.create) {
      throw new Error("Super Admin audit persistence is unavailable.");
    }

    await tx.superAdminAuditLog.create({
      data: auditData(req, {
        action,
        targetType: "SHOP",
        targetId: targetShopId,
        statusCode,
        metadata:
          typeof metadata === "function"
            ? metadata(updated)
            : metadata ?? { update },
      }),
    });

    req.skipPersistedSuperAdminAudit = true;
    return updated;
  });
}

export async function runGovernedCreateMutation({
  req,
  action,
  targetType,
  statusCode = 201,
  create,
  metadata,
  prismaClient = prisma,
}) {
  requireGovernanceActor(req);

  return prismaClient.$transaction(async (tx) => {
    const created = await create(tx);

    if (!tx.superAdminAuditLog?.create) {
      throw new Error("Super Admin audit persistence is unavailable.");
    }

    await tx.superAdminAuditLog.create({
      data: auditData(req, {
        action,
        targetType,
        targetId: created.id,
        statusCode,
        metadata: typeof metadata === "function" ? metadata(created) : metadata,
      }),
    });

    req.skipPersistedSuperAdminAudit = true;
    return created;
  });
}

export async function runGovernedItemMutation({
  req,
  action,
  targetItemId,
  mutation,
  metadata,
  statusCode = 200,
  prismaClient = prisma,
}) {
  requireGovernanceActor(req);

  return prismaClient.$transaction(async (tx) => {
    const item = await mutation(tx);

    if (!tx.superAdminAuditLog?.create) {
      throw new Error("Super Admin audit persistence is unavailable.");
    }

    await tx.superAdminAuditLog.create({
      data: auditData(req, {
        action,
        targetType: "ITEM",
        targetId: targetItemId || item.id,
        statusCode,
        metadata: typeof metadata === "function" ? metadata(item) : metadata,
      }),
    });

    req.skipPersistedSuperAdminAudit = true;
    return item;
  });
}

function getActor(req) {
  const user = req.user || {};

  return {
    actorId: String(user.sub || user.id || user.userId || "") || null,
    actorEmail: String(user.email || "") || null,
    actorRole: String(user.role || "") || null,
  };
}

function getRequestIp(req) {
  return (
    String(req.headers?.["x-forwarded-for"] || "")
      .split(",")[0]
      .trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    null
  );
}

function inferTargetType(path = "") {
  const normalized = String(path).toLowerCase();

  if (normalized.includes("/users")) return "USER";
  if (normalized.includes("/shops")) return "SHOP";
  if (normalized.includes("/settlements")) return "SETTLEMENT";
  if (normalized.includes("/buyer-subscriptions")) return "BUYER_SUBSCRIPTION";
  if (normalized.includes("/plans/seller")) return "SELLER_PLAN";
  if (normalized.includes("/plans/buyer")) return "BUYER_PLAN";
  if (normalized.includes("/platform-settings")) return "PLATFORM_SETTING";
  if (normalized.includes("/audit")) return "AUDIT_LOG";

  return "SUPER_ADMIN_RESOURCE";
}

function inferAction(req) {
  const method = String(req.method || "GET").toUpperCase();
  const path = String(req.route?.path || req.path || req.originalUrl || "");

  const targetType = inferTargetType(path);

  if (
    targetType === "BUYER_SUBSCRIPTION" &&
    String(path).toLowerCase().includes("/lifecycle")
  ) {
    const lifecycleAction = String(
      req.body?.action || "LIFECYCLE",
    )
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]+/g, "_");

    return `BUYER_SUBSCRIPTION_${lifecycleAction}`;
  }

  if (method === "POST") return `CREATE_${targetType}`;
  if (method === "PUT") return `UPDATE_${targetType}`;
  if (method === "PATCH") return `UPDATE_${targetType}`;
  if (method === "DELETE") return `DELETE_${targetType}`;

  return `${method}_${targetType}`;
}

function getRouteKey(req) {
  const method = String(req.method || "").toUpperCase();
  const baseUrl = String(req.baseUrl || "");
  const routePath = String(req.route?.path || "");
  return `${method} ${baseUrl}${routePath}`.trim();
}

function getTargetId(req) {
  return (
    String(req.params?.id || "") ||
    String(req.params?.userId || "") ||
    String(req.params?.shopId || "") ||
    String(req.params?.settlementId || "") ||
    String(req.body?.id || "") ||
    String(req.body?.targetId || "") ||
    null
  );
}

export async function createSuperAdminAuditLog(req, res, overrides = {}) {
  if (!prisma.superAdminAuditLog) {
    console.warn(
      "[superAdminAudit] Prisma client has no superAdminAuditLog model. Run prisma generate/migrate.",
    );
    return null;
  }

  const actor = getActor(req);
  const path = String(req.originalUrl || req.url || "");
  const action = overrides.action || inferAction(req);

  const metadata = safeJson({
    params: req.params || {},
    query: req.query || {},
    body: req.body || {},
  });

  return prisma.superAdminAuditLog.create({
    data: {
      ...actor,
      action,
      method: String(req.method || "").toUpperCase(),
      path,
      routeKey: getRouteKey(req),
      targetType: overrides.targetType || inferTargetType(path),
      targetId: overrides.targetId || getTargetId(req),
      statusCode: typeof res?.statusCode === "number" ? res.statusCode : null,
      success: typeof res?.statusCode === "number" ? res.statusCode < 400 : true,
      requestId:
        String(req.id || req.requestId || req.headers?.["x-request-id"] || "") ||
        null,
      ipAddress: getRequestIp(req),
      userAgent: String(req.headers?.["user-agent"] || "") || null,
      metadata,
    },
  });
}

export function auditSuperAdminMutation(req, res, next) {
  const method = String(req.method || "GET").toUpperCase();

  if (!MUTATION_METHODS.has(method)) {
    return next();
  }

  res.on("finish", () => {
    if (req.skipPersistedSuperAdminAudit) return;
    createSuperAdminAuditLog(req, res).catch((error) => {
      console.error("[superAdminAudit] failed to write audit log", error);
    });
  });

  return next();
}

function parsePositiveInt(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), max);
}

export function buildSuperAdminAuditWhere(query = {}) {
  const q = String(query.q || "").trim();
  const action = String(query.action || "").trim();
  const actorEmail = String(query.actorEmail || "").trim();
  const targetType = String(query.targetType || "").trim();
  const targetId = String(query.targetId || "").trim();
  const successRaw = String(query.success || "").trim().toLowerCase();

  const where = {};

  if (q) {
    where.OR = [
      { actorEmail: { contains: q, mode: "insensitive" } },
      { action: { contains: q, mode: "insensitive" } },
      { path: { contains: q, mode: "insensitive" } },
      { targetType: { contains: q, mode: "insensitive" } },
      { targetId: { contains: q, mode: "insensitive" } },
      { routeKey: { contains: q, mode: "insensitive" } },
    ];
  }

  if (action) {
    where.action = { contains: action, mode: "insensitive" };
  }

  if (actorEmail) {
    where.actorEmail = { contains: actorEmail, mode: "insensitive" };
  }

  if (targetType) where.targetType = targetType.toUpperCase();
  if (targetId) {
    where.targetId = targetId;
  }

  if (successRaw === "true") {
    where.success = true;
  } else if (successRaw === "false") {
    where.success = false;
  }

  return where;
}

export async function querySuperAdminAuditLogs(query = {}, prismaClient = prisma) {
  const page = parsePositiveInt(query.page, 1, 100000);
  const limit = parsePositiveInt(query.limit, 50, 250);
  const where = buildSuperAdminAuditWhere(query);
  const [rows, total] = await Promise.all([
    prismaClient.superAdminAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prismaClient.superAdminAuditLog.count({ where }),
  ]);

  return {
    page,
    limit,
    total,
    rows,
  };
}

export async function listSuperAdminAuditLogs(req, res) {
  return res.json(await querySuperAdminAuditLogs(req.query));
}
