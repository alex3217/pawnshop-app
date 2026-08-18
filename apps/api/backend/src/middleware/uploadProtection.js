import crypto from "node:crypto";
import { createClient } from "redis";

function keyFor(req, type) {
  if (type === "user") return String(req.user?.sub || req.user?.id || "");
  return String(req.ip || req.socket?.remoteAddress || "unknown");
}

export class RedisRateLimitStore {
  constructor({ url, client, namespace = "rate" } = {}) {
    this.client = client || createClient({ url });
    this.namespace = namespace;
    this.connecting = null;
  }
  async ready() {
    if (this.client.isReady) return;
    this.connecting ||= this.client.connect().finally(() => { this.connecting = null; });
    await this.connecting;
  }
  async increment(key, windowMs) {
    await this.ready();
    const redisKey = `${this.namespace}:${crypto.createHash("sha256").update(key).digest("hex")}`;
    const count = Number(await this.client.eval(
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return n",
      { keys: [redisKey], arguments: [String(windowMs)] },
    ));
    const ttl = Number(await this.client.pTTL(redisKey));
    return { count, resetAt: Date.now() + Math.max(1, ttl) };
  }
}

export class RedisUploadRateLimitStore extends RedisRateLimitStore {
  constructor(options = {}) {
    super({ ...options, namespace: "uploads:rate" });
  }
}

export function createUploadProtection({ limits, now = Date.now, store, requireDistributed = false } = {}) {
  const counters = new Map();
  const maxCounterEntries = 10_000;
  let active = 0;

  const distributedStore = store || (process.env.REDIS_URL ? new RedisUploadRateLimitStore({ url: process.env.REDIS_URL }) : null);

  async function consume(type, key, maximum) {
    const mapKey = `${type}:${key}`;
    if (distributedStore) {
      const current = await distributedStore.increment(mapKey, limits.rateLimitWindowMs);
      return current.count <= maximum;
    }
    const timestamp = now();
    const current = counters.get(mapKey);
    if (!current || current.resetAt <= timestamp) {
      if (!current && counters.size >= maxCounterEntries) {
        for (const [storedKey, value] of counters) {
          if (value.resetAt <= timestamp) counters.delete(storedKey);
        }
        if (counters.size >= maxCounterEntries) return false;
      }
      counters.set(mapKey, { count: 1, resetAt: timestamp + limits.rateLimitWindowMs });
      return true;
    }
    current.count += 1;
    return current.count <= maximum;
  }

  async function rateLimit(req, res, next) {
    try {
      if (requireDistributed && !distributedStore) throw new Error("Distributed rate-limit store is not configured");
      const userAllowed = await consume("user", keyFor(req, "user"), limits.rateLimitUserMax);
      const ipAllowed = userAllowed && await consume("ip", keyFor(req, "ip"), limits.rateLimitIpMax);
      if (ipAllowed) return next();
      res.setHeader("Retry-After", String(Math.ceil(limits.rateLimitWindowMs / 1000)));
      return res.status(429).json({ success: false, error: "Upload rate limit exceeded", requestId: req.requestId });
    } catch (error) {
      console.error("[uploads]", { event: "rate_limit_store_failed", requestId: req.requestId, reason: error?.name || "Error" });
      return res.status(503).json({ success: false, error: "Upload protection is temporarily unavailable", requestId: req.requestId });
    }
  }

  function concurrency(req, res, next) {
    if (active >= limits.maxConcurrent) {
      res.setHeader("Retry-After", "1");
      return res.status(503).json({ success: false, error: "Upload capacity is temporarily unavailable", requestId: req.requestId });
    }
    active += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      active = Math.max(0, active - 1);
    };
    res.once("finish", release);
    res.once("close", release);
    return next();
  }

  return { rateLimit, concurrency, get active() { return active; } };
}
