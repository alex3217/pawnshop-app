import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("supported authentication is bearer-only and has no cookie token fallback", () => {
  const auth = fs.readFileSync(new URL("../src/middleware/auth.js", import.meta.url), "utf8");
  assert.match(auth, /getBearerToken\(req\.headers\.authorization\)/);
  assert.doesNotMatch(auth, /req\.cookies|access_token/);
});

test("the fail-closed sensitive mutation inventory requires narrow step-up scopes", () => {
  const sources = Object.fromEntries(
    ["stripe.routes.js", "shops.routes.js", "staff.routes.js", "admin.routes.js", "superAdmin.routes.js", "auth.routes.js", "integrations.routes.js", "settlements.routes.js"]
      .map((name) => [name, fs.readFileSync(new URL(`../src/routes/${name}`, import.meta.url), "utf8")]),
  );
  const sensitive = {
    "stripe.routes.js": [/^POST \/refunds$/],
    "shops.routes.js": [/^POST \/:id\/finance\/(?:payouts|connect\/)/],
    "staff.routes.js": [/^(?:POST|PUT|PATCH|DELETE) \//],
    "admin.routes.js": [/^(?:POST|PATCH|DELETE) \/users(?:\/|$)/],
    "auth.routes.js": [/^POST \/super-admin\/users$/],
    "integrations.routes.js": [
      /^POST \/$/,
      /^PATCH \/:id$/,
      /^(?:POST|DELETE) \/:id\/mappings(?:\/|$)/,
      /^DELETE \/:id$/,
    ],
    "settlements.routes.js": [/^POST \/$/],
    "superAdmin.routes.js": [
      /^(?:POST|PATCH|DELETE) \/users(?:\/|$)/,
      /^POST \/beta-invites(?:\/|$)/,
      /^PATCH \/shops\/:id\/owner$/,
      /^PATCH \/integrations\/:id\/(?:archive|restore)$/,
      /^PATCH \/plans\/seller\//,
      /^(?:PATCH|POST) \/buyer-subscriptions\/:id(?:\/lifecycle)?$/,
      /^PATCH \/settlements\/:id$/,
      /^(?:POST|PATCH) \/pricing-rules(?:\/|$)/,
      /^(?:PATCH|POST) \/platform-settings(?:\/|$)/,
    ],
  };
  for (const [name, source] of Object.entries(sources)) {
    const matches = [...source.matchAll(/router\.(post|put|patch|delete)\(\s*"([^"]+)"/g)];
    for (const match of matches) {
      const routeKey = `${match[1].toUpperCase()} ${match[2]}`;
      if (!(sensitive[name] || []).some((pattern) => pattern.test(routeKey))) continue;
      const nextRoute = source.indexOf("router.", match.index + match[0].length);
      const routeDeclaration = source.slice(match.index, nextRoute < 0 ? source.length : nextRoute);
      assert.match(routeDeclaration, /requireMfaStepUp(?:WhenRequired)?\("[a-z][a-z0-9.-]{2,79}"\)/, `${name}: ${routeKey}`);
    }
  }
  assert.match(sources["admin.routes.js"], /requireOwnerAccessTransitionStepUp/);
  assert.match(sources["superAdmin.routes.js"], /requireShopBillingOverrideStepUp/);
});

test("challenge creation and verification use authenticated rate limiters", () => {
  const routes = fs.readFileSync(new URL("../src/routes/auth.routes.js", import.meta.url), "utf8");
  const limiter = fs.readFileSync(new URL("../src/middleware/authRateLimit.js", import.meta.url), "utf8");
  assert.match(routes, /"\/mfa\/step-up"[\s\S]*enrollmentLimiter\("mfaStepUpCreate"\)/);
  assert.match(routes, /"\/mfa\/step-up\/verify"[\s\S]*enrollmentLimiter\("mfaStepUpVerify"\)/);
  assert.match(limiter, /mfaStepUpCreate: enrollmentLimiter/);
  assert.match(limiter, /mfaStepUpVerify: enrollmentLimiter/);
});

test("step-up is bound to JWT jti and proof consumption fails safe before downstream work", () => {
  const controller = fs.readFileSync(new URL("../src/controllers/mfaStepUp.controller.js", import.meta.url), "utf8");
  const middleware = fs.readFileSync(new URL("../src/middleware/mfaStepUp.js", import.meta.url), "utf8");
  assert.match(controller, /req\.user\?\.jti/);
  assert.doesNotMatch(controller, /session:\$\{token\}/);
  assert.ok(middleware.indexOf("await consumeStepUpProof") < middleware.indexOf("return next()"));
  assert.match(middleware, /MFA_STEP_UP_REQUIRED/);
});
