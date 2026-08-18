import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CONDITIONAL_MFA_SCOPES, MUTATION_POLICY_EXCEPTIONS } from "../src/security/mutationPolicy.registry.js";

test("supported authentication is bearer-only and has no cookie token fallback", () => {
  const auth = fs.readFileSync(new URL("../src/middleware/auth.js", import.meta.url), "utf8");
  assert.match(auth, /getBearerToken\(req\.headers\.authorization\)/);
  assert.doesNotMatch(auth, /req\.cookies|access_token/);
});

test("browser CORS policy permits the one-shot proof header", () => {
  const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  assert.match(app, /"X-Mfa-Step-Up-Proof"/);
});

test("every reachable mutation has exactly one fail-closed policy classification", () => {
  const routesDirectory = fileURLToPath(new URL("../src/routes/", import.meta.url));
  const app = fs.readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  const reachable = new Set([...app.matchAll(/from "\.\/routes\/([^"/]+\.routes\.js)"/g)].map((match) => match[1]));
  const mutationModules = fs.readdirSync(routesDirectory)
    .filter((name) => name.endsWith(".routes.js"))
    .filter((name) => /router\.(?:post|put|patch|delete)\(/.test(fs.readFileSync(path.join(routesDirectory, name), "utf8")));
  assert.deepEqual(mutationModules.filter((name) => !reachable.has(name)), [], "all mutation modules must be mounted by app.js");

  const exceptions = new Map();
  for (const [policy, keys] of Object.entries(MUTATION_POLICY_EXCEPTIONS)) {
    for (const key of keys) {
      assert.equal(exceptions.has(key), false, `duplicate exception classification: ${key}`);
      exceptions.set(key, policy);
    }
  }
  const observed = new Set();
  for (const name of mutationModules) {
    const source = fs.readFileSync(path.join(routesDirectory, name), "utf8");
    const matches = [...source.matchAll(/router\.(post|put|patch|delete)\(\s*["']([^"']+)["']/g)];
    for (let index = 0; index < matches.length; index += 1) {
      const match = matches[index];
      const routeKey = `${match[1].toUpperCase()} ${match[2]}`;
      const key = `${name}:${routeKey}`;
      assert.equal(observed.has(key), false, `duplicate mutation registration: ${key}`);
      observed.add(key);
      const next = matches[index + 1]?.index ?? source.length;
      const declaration = source.slice(match.index, next);
      const direct = declaration.match(/(?:requireMfaStepUp(?:WhenRequired|ForRoles)?|administrativeStepUp)\("([a-z][a-z0-9.-]{2,79})"/);
      const conditionalScope = CONDITIONAL_MFA_SCOPES[key];
      const classifications = Number(Boolean(direct)) + Number(Boolean(conditionalScope)) + Number(exceptions.has(key));
      assert.equal(classifications, 1, `${key} must have exactly one mutation policy`);
      if (direct) assert.match(direct[1], /^[a-z][a-z0-9.-]{2,79}$/, `${key} requires a narrow exact scope`);
      if (conditionalScope) {
        assert.match(source, new RegExp(`requireMfaStepUpWhenRequired\\("${conditionalScope.replaceAll(".", "\\.")}\"\\)`));
      }
    }
  }
  assert.deepEqual([...exceptions.keys()].filter((key) => !observed.has(key)), [], "registry cannot contain stale routes");
});

test("challenge creation and verification use authenticated rate limiters", () => {
  const routes = fs.readFileSync(new URL("../src/routes/auth.routes.js", import.meta.url), "utf8");
  const limiter = fs.readFileSync(new URL("../src/middleware/authRateLimit.js", import.meta.url), "utf8");
  assert.match(routes, /"\/mfa\/step-up"[\s\S]*enrollmentLimiter\("mfaStepUpCreate"\)/);
  assert.match(routes, /"\/mfa\/step-up\/verify"[\s\S]*enrollmentLimiter\("mfaStepUpVerify"\)/);
  assert.match(limiter, /mfaStepUpCreate: enrollmentLimiter/);
  assert.match(limiter, /mfaStepUpVerify: enrollmentLimiter/);
});

test("required remediation categories retain their exact scopes and role-sensitive boundaries", () => {
  const required = {
    "settlements.routes.js": ["financial.settlement.fulfillment"],
    "stripe.routes.js": ["financial.settlement.payment-intent"],
    "marketplaceTransactions.routes.js": ["financial.marketplace.payment-intent", "financial.marketplace.reservation.cancel", "financial.marketplace.fulfillment", "financial.marketplace.inspection.start", "financial.marketplace.price.revise", "financial.marketplace.offline-payment"],
    "superAdmin.routes.js": ["privilege.messaging.content.read", "privilege.messaging.moderate", "privilege.shop.create", "privilege.support-session.start", "privilege.support-session.end", "privilege.support.inventory.create", "privilege.support.inventory.update", "privilege.support.listing.update", "privilege.support.location.create"],
    "training.routes.js": ["configuration.training.create", "configuration.training.reorder", "configuration.training.update", "configuration.training.lifecycle"],
    "locations.routes.js": ["configuration.location.coordinates-backfill", "configuration.location.verify"],
  };
  for (const [name, scopes] of Object.entries(required)) {
    const source = fs.readFileSync(new URL(`../src/routes/${name}`, import.meta.url), "utf8");
    for (const scope of scopes) assert.match(source, new RegExp(`(?:requireMfaStepUp(?:WhenRequired|ForRoles)?|administrativeStepUp)\\("${scope.replaceAll(".", "\\.")}\"`), `${name}: ${scope}`);
  }
  const marketplace = fs.readFileSync(new URL("../src/routes/marketplaceTransactions.routes.js", import.meta.url), "utf8");
  const stripe = fs.readFileSync(new URL("../src/routes/stripe.routes.js", import.meta.url), "utf8");
  assert.match(marketplace, /requireMfaStepUpForRoles\(scope, "ADMIN", "SUPER_ADMIN"\)/);
  assert.match(stripe, /requireMfaStepUpForRoles\("financial\.settlement\.payment-intent", "ADMIN", "SUPER_ADMIN"\)/);
  assert.doesNotMatch(marketplace.slice(marketplace.indexOf('router.post(\n  "/reserve"'), marketplace.indexOf('router.post(\n  "/:id/payment-intent"')), /administrativeStepUp/);
});

test("step-up is bound to JWT jti and proof consumption fails safe before downstream work", () => {
  const controller = fs.readFileSync(new URL("../src/controllers/mfaStepUp.controller.js", import.meta.url), "utf8");
  const middleware = fs.readFileSync(new URL("../src/middleware/mfaStepUp.js", import.meta.url), "utf8");
  assert.match(controller, /req\.user\?\.jti/);
  assert.doesNotMatch(controller, /session:\$\{token\}/);
  assert.ok(middleware.indexOf("await consumeStepUpProof") < middleware.indexOf("return next()"));
  assert.match(middleware, /MFA_STEP_UP_REQUIRED/);
});
