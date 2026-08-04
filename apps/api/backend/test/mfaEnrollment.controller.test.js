import assert from "node:assert/strict";
import test from "node:test";
import {
  beginMfaEnrollment,
  confirmEnrollment,
  getMfaEnrollmentStatus,
} from "../src/controllers/mfaEnrollment.controller.js";

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
}

test("all enrollment controllers remain unavailable while MFA rollout is disabled", async () => {
  const previousMode = process.env.MFA_MODE;
  const previousKey = process.env.MFA_ENCRYPTION_KEY;
  process.env.MFA_MODE = "disabled";
  delete process.env.MFA_ENCRYPTION_KEY;
  const req = {
    user: { sub: "user-1", email: "admin@example.test", role: "SUPER_ADMIN" },
    body: { code: "123456" },
    get: () => null,
  };
  try {
    for (const handler of [getMfaEnrollmentStatus, beginMfaEnrollment, confirmEnrollment]) {
      await assert.rejects(
        handler(req, responseRecorder()),
        (error) => error.code === "MFA_ENROLLMENT_UNAVAILABLE" && error.statusCode === 404,
      );
    }
  } finally {
    if (previousMode === undefined) delete process.env.MFA_MODE;
    else process.env.MFA_MODE = previousMode;
    if (previousKey === undefined) delete process.env.MFA_ENCRYPTION_KEY;
    else process.env.MFA_ENCRYPTION_KEY = previousKey;
  }
});
