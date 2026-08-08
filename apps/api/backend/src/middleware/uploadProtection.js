function keyFor(req, type) {
  if (type === "user") return String(req.user?.sub || req.user?.id || "");
  return String(req.ip || req.socket?.remoteAddress || "unknown");
}

export function createUploadProtection({ limits, now = Date.now } = {}) {
  const counters = new Map();
  const maxCounterEntries = 10_000;
  let active = 0;

  function consume(type, key, maximum) {
    const mapKey = `${type}:${key}`;
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

  function rateLimit(req, res, next) {
    const userAllowed = consume("user", keyFor(req, "user"), limits.rateLimitUserMax);
    const ipAllowed = userAllowed && consume("ip", keyFor(req, "ip"), limits.rateLimitIpMax);
    if (ipAllowed) return next();
    res.setHeader("Retry-After", String(Math.ceil(limits.rateLimitWindowMs / 1000)));
    return res.status(429).json({ success: false, error: "Upload rate limit exceeded", requestId: req.requestId });
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
