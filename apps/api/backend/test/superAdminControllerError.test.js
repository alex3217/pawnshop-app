import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createSuperAdminShop } from "../src/controllers/superAdmin.controller.js";

function responseRecorder() {
  return {
    statusCode: null,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("Super Admin shop creation preserves the controller error response contract", async () => {
  const upstreamError = Object.assign(new Error("Injected controller failure"), {
    statusCode: 503,
    code: "INJECTED_FAILURE",
    details: { retryable: false },
  });
  const req = {};
  Object.defineProperty(req, "body", {
    get() {
      throw upstreamError;
    },
  });
  const res = responseRecorder();

  await createSuperAdminShop(req, res);

  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, {
    success: false,
    error: "Injected controller failure",
    code: "INJECTED_FAILURE",
    details: { retryable: false },
  });
});

test("all Super Admin controller catch paths use the defined error responder", async () => {
  const source = await readFile(
    new URL("../src/controllers/superAdmin.controller.js", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /\bhandleSuperAdminError\b/);
  assert.equal(
    source.match(/return sendError\(res, err, "Failed to/g)?.length,
    6,
  );
});
