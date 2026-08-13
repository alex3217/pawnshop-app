import { RedisRateLimitStore } from "./uploadProtection.js";

class MemoryStore {
  constructor() { this.entries = new Map(); }
  async increment(key, windowMs) {
    const now = Date.now();
    const previous = this.entries.get(key);
    const entry = !previous || previous.resetAt <= now
      ? { count: 1, resetAt: now + windowMs }
      : { count: previous.count + 1, resetAt: previous.resetAt };
    this.entries.set(key, entry);
    return entry;
  }
}

// REDIS_URL is the distributed source of truth. Local/test environments use a
// bounded-process fallback; production fails closed if Redis is unavailable.
export function createShopMessagingRateLimit({ env = process.env, store } = {}) {
  const windowMs = Number(env.SHOP_MESSAGE_RATE_LIMIT_WINDOW_MS) || 60_000;
  const max = Number(env.SHOP_MESSAGE_RATE_LIMIT_MAX) || 30;
  const limiterStore = store || (env.REDIS_URL
    ? new RedisRateLimitStore({ url: env.REDIS_URL, namespace: "shop-message:rate" })
    : env.NODE_ENV === "production" ? null : new MemoryStore());

  return async (req, res, next) => {
    try {
      if (!limiterStore) throw new Error("Redis rate-limit store is not configured");
      const userId = String(req.user?.sub || "").trim();
      const entry = await limiterStore.increment(`user:${userId}`, windowMs);
      res.setHeader("RateLimit-Limit", String(max));
      res.setHeader("RateLimit-Remaining", String(Math.max(0, max - entry.count)));
      if (entry.count > max) {
        res.setHeader("Retry-After", String(Math.max(1, Math.ceil((entry.resetAt - Date.now()) / 1000))));
        return res.status(429).json({ success: false, error: "Too many messages. Please try again shortly.", code: "SHOP_MESSAGE_RATE_LIMITED" });
      }
      return next();
    } catch (error) {
      console.error("[shopMessaging]", { event: "rate_limit_store_failed", requestId: req.requestId, reason: error?.name || "Error" });
      return res.status(503).json({ success: false, error: "Message protection is temporarily unavailable.", code: "SHOP_MESSAGE_RATE_LIMIT_UNAVAILABLE" });
    }
  };
}

export const shopMessagingRateLimit = createShopMessagingRateLimit();
