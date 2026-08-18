import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { issueToken } from "../src/controllers/auth.controller.js";

test("login and refresh token issuance gives simultaneous sessions distinct random identifiers", () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "session-token-test-secret-with-sufficient-entropy";
  try {
    const user = { id: "user-a", email: "owner@example.test", role: "OWNER", authVersion: 4 };
    const first = jwt.decode(issueToken(user));
    const second = jwt.decode(issueToken(user));
    assert.match(first.jti, /^[0-9a-f-]{36}$/i);
    assert.match(second.jti, /^[0-9a-f-]{36}$/i);
    assert.notEqual(first.jti, second.jti);
    assert.equal(first.authVersion, second.authVersion);
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
});
