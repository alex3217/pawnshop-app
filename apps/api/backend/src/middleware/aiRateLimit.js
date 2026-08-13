import { RedisRateLimitStore } from "./uploadProtection.js";

class DevelopmentMemoryStore {
  constructor({ now = Date.now } = {}) { this.now = now; this.entries = new Map(); }
  async increment(key, windowMs) {
    const timestamp = this.now();
    const current = this.entries.get(key);
    const entry = !current || current.resetAt <= timestamp
      ? { count: 1, resetAt: timestamp + windowMs }
      : { ...current, count: current.count + 1 };
    this.entries.set(key, entry);
    return entry;
  }
}

export function createAiRateLimit({
  windowMs = Number(process.env.AI_LISTING_RATE_LIMIT_WINDOW_MS) || 60_000,
  max = Number(process.env.AI_LISTING_RATE_LIMIT_MAX) || 10,
  now = Date.now,
  store,
  env = process.env,
} = {}) {
  const sharedStore = store || (env.REDIS_URL
    ? new RedisRateLimitStore({ url: env.REDIS_URL, namespace: "ai-listing:rate" })
    : env.NODE_ENV === "production" ? null : new DevelopmentMemoryStore({ now }));

  return async (req, res, next) => {
    const userId = String(req.user?.sub || req.user?.id || "").trim();
    try {
      if (!sharedStore) throw new Error("Redis rate-limit store is not configured");
      const entry = await sharedStore.increment(`user:${userId}`, windowMs);
      const currentTime = now();
      res.setHeader("RateLimit-Limit", String(max));
      res.setHeader("RateLimit-Remaining", String(Math.max(0, max - entry.count)));
      if (entry.count > max) {
        res.setHeader("Retry-After", String(Math.max(1, Math.ceil((entry.resetAt - currentTime) / 1000))));
        return res.status(429).json({ success: false, error: "Too many AI description requests. Please try again later.", code: "AI_RATE_LIMITED" });
      }
      return next();
    } catch (error) {
      console.error("[aiListingAssistant]", { event: "rate_limit_store_failed", requestId: req.requestId, reason: error?.name || "Error" });
      return res.status(503).json({ success: false, error: "AI request protection is temporarily unavailable.", code: "AI_RATE_LIMIT_UNAVAILABLE" });
    }
  };
}

export const aiListingRateLimit = createAiRateLimit();
