import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("supported authentication is bearer-only and has no cookie token fallback", () => {
  const auth = fs.readFileSync(new URL("../src/middleware/auth.js", import.meta.url), "utf8");
  assert.match(auth, /getBearerToken\(req\.headers\.authorization\)/);
  assert.doesNotMatch(auth, /req\.cookies|access_token/);
});

test("privileged route categories fail closed through operation-specific step-up scopes", () => {
  const files = ["stripe.routes.js", "shops.routes.js", "staff.routes.js", "admin.routes.js", "superAdmin.routes.js", "auth.routes.js"]
    .map((name) => fs.readFileSync(new URL(`../src/routes/${name}`, import.meta.url), "utf8"))
    .join("\n");
  for (const scope of [
    "refund.create", "payout.request", "payout.cancel", "payout.process",
    "privilege.admin-user.update", "privilege.staff.update", "privilege.user-governance",
    "configuration.platform-settings.update", "configuration.platform.create", "configuration.platform.update",
  ]) assert.match(files, new RegExp(`requireMfaStepUp\\(\"${scope.replaceAll(".", "\\.")}\"\\)`));
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
