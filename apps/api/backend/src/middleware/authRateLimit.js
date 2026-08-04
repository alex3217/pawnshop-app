import crypto from "node:crypto";
import { ipKeyGenerator } from "express-rate-limit";
import { prisma } from "../lib/prisma.js";
import { createMfaAuditEvent } from "../services/mfaAudit.service.js";

const MFA_ENROLLMENT_LIMITS = Object.freeze({
  start: 3,
  confirm: 5,
});

const PUBLIC_AUTH_PATHS = new Map([
  ["/auth/register", "register"],
  ["/auth/login", "login"],
  ["/auth/resend-verification", "resend-verification"],
  ["/auth/verify-email", "verify-email"],
  ["/auth/forgot-password", "forgot-password"],
  ["/auth/reset-password", "reset-password"],
]);

const SENSITIVE_IP_POLICIES = new Set([
  "register",
  "resend-verification",
  "verify-email",
  "forgot-password",
  "reset-password",
]);

const IDENTIFIER_POLICIES = new Set([
  "login",
  "register",
  "resend-verification",
  "forgot-password",
]);

const TOKEN_POLICIES = new Set(["verify-email", "reset-password"]);

function authPolicyForRequest(req) {
  if (req.method !== "POST") return null;
  const path = String(req.path || "").replace(/^\/api/, "");
  return PUBLIC_AUTH_PATHS.get(path) || null;
}

function digest(secret, value) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function hmacKey(secret, { policy, layer, parts }) {
  return `auth:hmac:${digest(
    secret,
    [policy, layer, ...parts].join("\0"),
  )}`;
}

function normalizeIdentifier(value) {
  return String(value || "").trim().toLowerCase();
}

export class MemoryRateLimitStore {
  constructor({ now = Date.now, maxEntries = 100_000 } = {}) {
    this.entries = new Map();
    this.now = now;
    this.maxEntries = maxEntries;
  }

  async increment(key, windowMs) {
    const now = this.now();
    const current = this.entries.get(key);
    if (!current || current.resetAt <= now) {
      if (!current && this.entries.size >= this.maxEntries) {
        for (const [storedKey, entry] of this.entries) {
          if (entry.resetAt <= now) this.entries.delete(storedKey);
        }
        if (this.entries.size >= this.maxEntries) {
          throw new Error("Rate limit store capacity reached");
        }
      }
      const next = { count: 1, resetAt: now + windowMs };
      this.entries.set(key, next);
      return next;
    }
    current.count += 1;
    return current;
  }

  resetAll() {
    this.entries.clear();
  }
}

function setRateLimitHeaders(res, { limit, remaining, resetAt, now }) {
  const retryAfter = Math.max(1, Math.ceil((resetAt - now) / 1000));
  res.setHeader("RateLimit-Limit", String(limit));
  res.setHeader("RateLimit-Remaining", String(Math.max(0, remaining)));
  res.setHeader("RateLimit-Reset", String(retryAfter));
  res.setHeader(
    "RateLimit-Policy",
    `${limit};w=${Math.max(1, Math.ceil((resetAt - now) / 1000))}`,
  );
  return retryAfter;
}

async function applyLimit({
  config,
  store,
  now,
  key,
  limit,
  policy,
  layer,
  req,
  res,
  onExceeded,
}) {
  let result;
  try {
    result = await store.increment(key, config.windowMs);
  } catch (error) {
    console.error("[auth.rateLimit] store failure", {
      requestId: req.requestId,
      policy,
      layer,
      name: error?.name || "Error",
    });
    if (!res.headersSent) {
      res.status(503).json({
        success: false,
        error: "Authentication protection is temporarily unavailable",
        requestId: req.requestId,
      });
    }
    return false;
  }

  const currentTime = now();
  const retryAfter = setRateLimitHeaders(res, {
    limit,
    remaining: limit - result.count,
    resetAt: result.resetAt,
    now: currentTime,
  });

  if (result.count > limit) {
    if (onExceeded) {
      try {
        await onExceeded();
      } catch (error) {
        console.error("[auth.rateLimit] audit failure", {
          requestId: req.requestId,
          policy,
          layer,
          name: error?.name || "Error",
        });
        res.status(503).json({
          success: false,
          error: "Authentication protection is temporarily unavailable",
          requestId: req.requestId,
        });
        return false;
      }
    }
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({
      success: false,
      error: "Too many authentication requests. Try again later.",
      requestId: req.requestId,
    });
    return false;
  }

  return true;
}

export function createAuthRateLimiters({
  config,
  store,
  now = Date.now,
  auditMfaRateLimit,
} = {}) {
  const effectiveStore = store || new MemoryRateLimitStore({ now });
  const recordMfaRateLimit = auditMfaRateLimit || (async ({ req, purpose }) => {
    await prisma.$transaction((tx) => createMfaAuditEvent(tx, {
      event: "RATE_LIMIT_ENFORCED",
      actorId: req.user.sub,
      actorEmail: req.user.email,
      actorRole: req.user.role,
      targetUserId: req.user.sub,
      requestId: req.requestId || null,
      ipAddress: req.ip || null,
      userAgent: req.get("user-agent") || null,
      success: false,
      metadata: {
        outcome: "enforced",
        reason: "rate_limited",
        ...(purpose ? { purpose } : {}),
      },
    }));
  });
  if (!config?.enabled) {
    const pass = (_req, _res, next) => next();
    const unavailable = (req, res) => res.status(503).json({
      success: false,
      error: "Authentication protection is temporarily unavailable",
      requestId: req.requestId,
    });
    return {
      beforeBody: pass,
      afterBody: pass,
      mfaEnrollmentStart: unavailable,
      mfaEnrollmentConfirm: unavailable,
      store: effectiveStore,
    };
  }

  const beforeBody = async (req, res, next) => {
    const policy = authPolicyForRequest(req);
    if (!policy) return next();
    const limit = SENSITIVE_IP_POLICIES.has(policy)
      ? config.sensitiveIpMax
      : config.ipMax;
    const allowed = await applyLimit({
      config,
      store: effectiveStore,
      now,
      limit,
      policy,
      layer: "ip",
      key: `auth:${policy}:ip:${ipKeyGenerator(req.ip, 56)}`,
      req,
      res,
    });
    if (allowed) return next();
    return undefined;
  };

  const afterBody = async (req, res, next) => {
    const policy = authPolicyForRequest(req);
    if (!policy) return next();

    let value = "";
    let layers = [];
    if (IDENTIFIER_POLICIES.has(policy)) {
      value = normalizeIdentifier(req.body?.email);
      if (value) {
        const client = ipKeyGenerator(req.ip, 56);
        layers = [
          {
            layer: "identifier",
            limit: config.identifierMax,
            parts: [value],
          },
          {
            layer: "combined",
            limit: config.combinedMax,
            parts: [client, value],
          },
        ];
      }
    } else if (TOKEN_POLICIES.has(policy)) {
      value = String(req.body?.token || "");
      if (value) {
        layers = [
          {
            layer: "token",
            limit: config.identifierMax,
            parts: [value],
          },
        ];
      }
    }
    if (!value) return next();

    for (const layer of layers) {
      const allowed = await applyLimit({
        config,
        store: effectiveStore,
        now,
        limit: layer.limit,
        policy,
        layer: layer.layer,
        key: hmacKey(
          config.keySecret,
          {
            policy,
            layer: layer.layer,
            parts: layer.parts,
          },
        ),
        req,
        res,
      });
      if (!allowed) return undefined;
    }

    return next();
  };

  function enrollmentLimiter({ policy, limit, purpose }) {
    return async (req, res, next) => {
      const allowed = await applyLimit({
        config,
        store: effectiveStore,
        now,
        limit,
        policy,
        layer: "authenticated-user-ip",
        key: hmacKey(config.keySecret, {
          policy,
          layer: "authenticated-user-ip",
          parts: [req.user.sub, ipKeyGenerator(req.ip, 56)],
        }),
        req,
        res,
        onExceeded: () => recordMfaRateLimit({ req, purpose }),
      });
      if (allowed) return next();
      return undefined;
    };
  }

  return {
    beforeBody,
    afterBody,
    mfaEnrollmentStart: enrollmentLimiter({
      policy: "mfa-enrollment-start",
      limit: MFA_ENROLLMENT_LIMITS.start,
    }),
    mfaEnrollmentConfirm: enrollmentLimiter({
      policy: "mfa-enrollment-confirm",
      limit: MFA_ENROLLMENT_LIMITS.confirm,
      purpose: "ENROLLMENT_CONFIRMATION",
    }),
    store: effectiveStore,
  };
}
