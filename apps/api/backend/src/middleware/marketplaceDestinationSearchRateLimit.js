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

export function createMarketplaceDestinationSearchRateLimit({ env = process.env, store } = {}) {
  const windowMs = Number(env.MARKETPLACE_DESTINATION_SEARCH_RATE_LIMIT_WINDOW_MS) || 60_000;
  const max = Number(env.MARKETPLACE_DESTINATION_SEARCH_RATE_LIMIT_MAX) || 60;
  const limiterStore = store || (env.REDIS_URL
    ? new RedisRateLimitStore({ url: env.REDIS_URL, namespace: "marketplace-destination-search:rate" })
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
        return res.status(429).json({ success: false, error: "Too many destination searches. Please try again shortly.", code: "MARKETPLACE_DESTINATION_SEARCH_RATE_LIMITED" });
      }
      return next();
    } catch (error) {
      console.error("[marketplaceDestinationSearch]", { event: "rate_limit_store_failed", requestId: req.requestId, reason: error?.name || "Error" });
      return res.status(503).json({ success: false, error: "Destination search is temporarily unavailable.", code: "MARKETPLACE_DESTINATION_SEARCH_RATE_LIMIT_UNAVAILABLE" });
    }
  };
}

export const marketplaceDestinationSearchRateLimit = createMarketplaceDestinationSearchRateLimit();
