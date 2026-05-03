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
];

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

export async function listSuperAdminAuditLogs(req, res) {
  const page = parsePositiveInt(req.query?.page, 1, 100000);
  const limit = parsePositiveInt(req.query?.limit, 50, 250);
  const q = String(req.query?.q || "").trim();
  const action = String(req.query?.action || "").trim();
  const actorEmail = String(req.query?.actorEmail || "").trim();
  const targetType = String(req.query?.targetType || "").trim();
  const successRaw = String(req.query?.success || "").trim().toLowerCase();

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

  if (targetType) {
    where.targetType = { contains: targetType, mode: "insensitive" };
  }

  if (successRaw === "true") {
    where.success = true;
  } else if (successRaw === "false") {
    where.success = false;
  }

  const [rows, total] = await Promise.all([
    prisma.superAdminAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.superAdminAuditLog.count({ where }),
  ]);

  return res.json({
    page,
    limit,
    total,
    rows,
  });
}
