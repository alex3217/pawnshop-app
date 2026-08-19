import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { sendControllerError } from "../src/lib/controllerErrorResponse.js";

function responseRecorder() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("unexpected controller failures do not expose internal exception messages", () => {
  const response = responseRecorder();
  sendControllerError(response, new Error('column "stripeSecret" does not exist'), {
    fallback: "Unable to complete request",
  });

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, {
    success: false,
    error: "Unable to complete request",
  });
});

test("explicit client errors preserve their status, message, and stable code", () => {
  const response = responseRecorder();
  const error = new Error("Forbidden");
  error.statusCode = 403;
  error.code = "RESOURCE_FORBIDDEN";

  sendControllerError(response, error, { fallback: "Unable to complete request" });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, {
    success: false,
    error: "Forbidden",
    code: "RESOURCE_FORBIDDEN",
  });
});

test("launch-critical controllers use the shared fail-closed responder", async () => {
  const controllers = [
    "bids.controller.js",
    "buyerMessagingProfile.controller.js",
    "marketplaceListings.controller.js",
    "marketplaceTransactions.controller.js",
    "offers.controller.js",
    "settlements.controller.js",
    "shopConversations.controller.js",
  ];

  for (const controller of controllers) {
    const source = await readFile(new URL(`../src/controllers/${controller}`, import.meta.url), "utf8");
    assert.match(source, /import \{ sendControllerError \} from "\.\.\/lib\/controllerErrorResponse\.js";/, controller);
  }
});
