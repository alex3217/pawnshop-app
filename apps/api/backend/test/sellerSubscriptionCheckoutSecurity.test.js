import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { validateStripeConnectReturnUrl } from "../src/services/stripeConnect.service.js";

const allowedOrigins = [
  "https://app.pawnloop.test",
  "http://localhost:5177",
];

test("seller checkout accepts only configured PawnLoop completion origins", () => {
  assert.equal(
    validateStripeConnectReturnUrl(
      "https://app.pawnloop.test/owner/subscription?checkout=success&plan=PRO",
      "successUrl",
      { allowedOrigins },
    ),
    "https://app.pawnloop.test/owner/subscription?checkout=success&plan=PRO",
  );
  assert.equal(
    validateStripeConnectReturnUrl(
      "http://localhost:5177/owner/onboarding?step=2&checkout=cancelled",
      "cancelUrl",
      { allowedOrigins },
    ),
    "http://localhost:5177/owner/onboarding?step=2&checkout=cancelled",
  );
});

test("seller checkout rejects hostile completion destinations", () => {
  for (const value of [
    "https://evil.test/owner/subscription",
    "https://app.pawnloop.test.evil.test/owner/subscription",
    "https://app.pawnloop.test@evil.test/owner/subscription",
    "https://user:password@app.pawnloop.test/owner/subscription",
    "https://app.pawnloop.test:444/owner/subscription",
    "http://app.pawnloop.test/owner/subscription",
    "https://%61pp.pawnloop.test/owner/subscription",
    "https://app%2Epawnloop.test/owner/subscription",
    "https:\\\\evil.test\\owner\\subscription",
    "javascript:alert(1)",
    "data:text/html,checkout",
    "not a url",
  ]) {
    assert.throws(
      () => validateStripeConnectReturnUrl(value, "successUrl", { allowedOrigins }),
      (error) => error.statusCode === 400 && error.code === "INVALID_CONNECT_URL",
      value,
    );
  }
});

test("seller checkout controller applies the trusted-origin validator to both URLs", async () => {
  const source = await readFile(
    new URL("../src/controllers/stripe.controller.js", import.meta.url),
    "utf8",
  );
  const handler = source.slice(
    source.indexOf("export async function createSubscriptionCheckoutSession"),
    source.indexOf("export async function createBuyerSubscriptionCheckoutSession"),
  );

  assert.match(handler, /validateStripeConnectReturnUrl\(\s*req\?\.body\?\.successUrl/);
  assert.match(handler, /validateStripeConnectReturnUrl\(\s*req\?\.body\?\.cancelUrl/);
  assert.doesNotMatch(handler, /assertAbsoluteHttpUrl/);
});
