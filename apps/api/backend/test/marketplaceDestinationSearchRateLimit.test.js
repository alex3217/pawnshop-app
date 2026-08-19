import assert from "node:assert/strict";
import test from "node:test";
import { createMarketplaceDestinationSearchRateLimit } from "../src/middleware/marketplaceDestinationSearchRateLimit.js";

function response() {
  return { headers: {}, statusCode: 200, body: null, setHeader(name, value) { this.headers[name] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test("destination search has a dedicated authenticated per-user rate limit", async () => {
  let count = 0;
  const limiter = createMarketplaceDestinationSearchRateLimit({ env: { MARKETPLACE_DESTINATION_SEARCH_RATE_LIMIT_MAX: "1" }, store: { increment: async (key) => ({ count: ++count, resetAt: Date.now() + 60_000, key }) } });
  const req = { user: { sub: "buyer-1" } };
  let nextCalls = 0;
  await limiter(req, response(), () => { nextCalls += 1; });
  const blocked = response();
  await limiter(req, blocked, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.body.code, "MARKETPLACE_DESTINATION_SEARCH_RATE_LIMITED");
});
