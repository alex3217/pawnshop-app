import assert from "node:assert/strict";
import test from "node:test";

import { prisma } from "../src/lib/prisma.js";
import { requireRole } from "../src/middleware/auth.js";
import {
  requireOwnerAdminOrStaffPermission,
} from "../src/middleware/staffAccess.middleware.js";

function createResponse() {
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

for (const [name, createMiddleware] of [
  ["role middleware", () => requireRole("OWNER", "ADMIN")],
  [
    "staff access middleware",
    () => requireOwnerAdminOrStaffPermission("inventory:write"),
  ],
]) {
  test(`${name} returns a generic 503 when owner approval lookup fails`, async () => {
    const originalFindUnique =
      prisma.ownerApplication.findUnique;
    const prismaMessage =
      "P2021: The table `OwnerApplication` does not exist.";
    let nextCalled = false;

    try {
      prisma.ownerApplication.findUnique = async () => {
        const error = new Error(prismaMessage);
        error.code = "P2021";
        throw error;
      };

      const response = createResponse();
      await createMiddleware()(
        {
          user: {
            sub: "owner-test",
            role: "OWNER",
          },
        },
        response,
        () => {
          nextCalled = true;
        },
      );

      assert.equal(response.statusCode, 503);
      assert.deepEqual(response.body, {
        error: "Service unavailable",
      });
      assert.equal(nextCalled, false);
      assert.equal(
        JSON.stringify(response.body).includes(prismaMessage),
        false,
      );
      assert.equal(
        JSON.stringify(response.body).includes("OwnerApplication"),
        false,
      );
    } finally {
      prisma.ownerApplication.findUnique =
        originalFindUnique;
    }
  });
}
