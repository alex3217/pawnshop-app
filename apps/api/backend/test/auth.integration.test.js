import assert from "node:assert/strict";
import test, {
  after,
  before,
  beforeEach,
} from "node:test";

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import request from "supertest";

const TEST_JWT_SECRET =
  "pawnloop-db-tests-only-secret-2026";

const TEST_DOMAIN = "@integration.pawnloop.test";

let app;
let prisma;
let databaseVerified = false;

function email(prefix) {
  return `${prefix}${TEST_DOMAIN}`;
}

async function registerUser({
  name = "Integration Consumer",
  userEmail = email("consumer"),
  password = "ConsumerSecure123!",
  role = "CONSUMER",
} = {}) {
  return request(app)
    .post("/api/auth/register")
    .send({
      name,
      email: userEmail,
      password,
      role,
    });
}

before(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    APP_ENV: "test",
    APP_NAME: "pawnloop-api-integration-test",
    JWT_SECRET: TEST_JWT_SECRET,
    AUCTION_SCHEDULER_ENABLED: "false",
  });

  const rawDatabaseUrl = String(
    process.env.DATABASE_URL || "",
  );

  assert.ok(
    rawDatabaseUrl,
    "DATABASE_URL is required",
  );

  const databaseName = decodeURIComponent(
    new URL(rawDatabaseUrl).pathname.replace(/^\/+/, ""),
  );

  assert.equal(
    databaseName,
    "pawnshop_test",
    "Integration tests may only use pawnshop_test",
  );

  const appModule = await import("../src/app.js");
  const prismaModule = await import("../src/lib/prisma.js");

  app = appModule.createApp();
  prisma = prismaModule.prisma;

  const databaseResult = await prisma.$queryRaw`
    SELECT current_database() AS database_name
  `;

  assert.equal(
    databaseResult[0]?.database_name,
    "pawnshop_test",
  );

  databaseVerified = true;
});

beforeEach(async () => {
  assert.equal(
    databaseVerified,
    true,
    "Database isolation must be verified before cleanup",
  );

  await prisma.user.deleteMany({
    where: {
      email: {
        endsWith: TEST_DOMAIN,
      },
    },
  });
});

after(async () => {
  if (!prisma) return;

  try {
    if (databaseVerified) {
      await prisma.user.deleteMany({
        where: {
          email: {
            endsWith: TEST_DOMAIN,
          },
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
});

test("consumer registration persists a normalized user", async () => {
  const response = await registerUser({
    userEmail: "Consumer@Integration.PawnLoop.Test",
    role: "BUYER",
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);
  assert.equal(response.body.user.email, email("consumer"));
  assert.equal(response.body.user.role, "CONSUMER");
  assert.equal(response.body.user.isActive, true);
  assert.equal(typeof response.body.token, "string");
  assert.equal("password" in response.body.user, false);

  const stored = await prisma.user.findUnique({
    where: {
      email: email("consumer"),
    },
  });

  assert.ok(stored);
  assert.ok(stored.emailVerifiedAt instanceof Date);
  assert.equal(stored.role, "CONSUMER");
  assert.notEqual(stored.password, "ConsumerSecure123!");
  assert.equal(
    await bcrypt.compare(
      "ConsumerSecure123!",
      stored.password,
    ),
    true,
  );

  const tokenPayload = jwt.verify(
    response.body.token,
    TEST_JWT_SECRET,
  );

  assert.equal(tokenPayload.sub, stored.id);
  assert.equal(tokenPayload.role, "CONSUMER");
  assert.equal(tokenPayload.authVersion, 0);
});

test("duplicate registration returns 409", async () => {
  const first = await registerUser({
    userEmail: email("duplicate"),
  });

  assert.equal(first.status, 201);

  const duplicate = await registerUser({
    name: "Duplicate User",
    userEmail: "DUPLICATE@INTEGRATION.PAWNLOOP.TEST",
  });

  assert.equal(duplicate.status, 409);
  assert.deepEqual(duplicate.body, {
    error: "Email already registered",
  });
});

test("public registration cannot create an admin", async () => {
  const response = await registerUser({
    userEmail: email("public-admin"),
    role: "ADMIN",
  });

  assert.equal(response.status, 403);
  assert.deepEqual(response.body, {
    error: "Invalid role",
  });

  const stored = await prisma.user.findUnique({
    where: {
      email: email("public-admin"),
    },
  });

  assert.equal(stored, null);
});

test("registration applies the centralized password policy", async () => {
  const response = await registerUser({
    userEmail: email("short-password"),
    password: "12345",
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    error: "Password must be at least 12 characters.",
    code: "PASSWORD_TOO_SHORT",
  });
});

test("registered users can log in", async () => {
  const registered = await registerUser({
    userEmail: email("login"),
    password: "LoginSecure123!",
  });

  assert.equal(registered.status, 201);

  const response = await request(app)
    .post("/api/auth/login")
    .send({
      email: "LOGIN@INTEGRATION.PAWNLOOP.TEST",
      password: "LoginSecure123!",
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.user.email, email("login"));
  assert.equal(typeof response.body.token, "string");

  const payload = jwt.verify(
    response.body.token,
    TEST_JWT_SECRET,
  );

  assert.equal(payload.role, "CONSUMER");
  assert.equal(payload.authVersion, 0);
});

test("login rejects an incorrect password", async () => {
  const registered = await registerUser({
    userEmail: email("wrong-password"),
    password: "CorrectSecure123!",
  });

  assert.equal(registered.status, 201);

  const response = await request(app)
    .post("/api/auth/login")
    .send({
      email: email("wrong-password"),
      password: "IncorrectSecure123!",
    });

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, {
    error: "Invalid credentials",
  });
});

test("inactive users cannot log in", async () => {
  const registered = await registerUser({
    userEmail: email("inactive"),
  });

  assert.equal(registered.status, 201);

  await prisma.user.update({
    where: {
      email: email("inactive"),
    },
    data: {
      isActive: false,
    },
  });

  const response = await request(app)
    .post("/api/auth/login")
    .send({
      email: email("inactive"),
      password: "ConsumerSecure123!",
    });

  assert.equal(response.status, 401);
  assert.deepEqual(response.body, {
    error: "Invalid credentials",
  });
});

test("authenticated users can load their profile", async () => {
  const registered = await registerUser({
    userEmail: email("profile"),
  });

  assert.equal(registered.status, 201);

  const response = await request(app)
    .get("/api/auth/me")
    .set(
      "Authorization",
      `Bearer ${registered.body.token}`,
    );

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.user.email, email("profile"));
  assert.equal("password" in response.body.user, false);
});

test("legacy password hashes continue to authenticate", async () => {
  await prisma.user.create({
    data: {
      name: "Legacy User",
      email: email("legacy-password"),
      password: await bcrypt.hash("old-pass", 10),
      role: "CONSUMER",
      isActive: true,
    },
  });

  const response = await request(app).post("/api/auth/login").send({
    email: email("legacy-password"),
    password: "old-pass",
  });
  assert.equal(response.status, 200);
});

test("authenticated requests reject missing or wrong authVersion", async () => {
  const registered = await registerUser({ userEmail: email("token-version") });
  const payload = jwt.decode(registered.body.token);
  const legacyToken = jwt.sign({ sub: payload.sub, role: "CONSUMER" }, TEST_JWT_SECRET);
  const wrongToken = jwt.sign(
    { sub: payload.sub, role: "CONSUMER", authVersion: 99 },
    TEST_JWT_SECRET,
  );

  for (const token of [legacyToken, wrongToken]) {
    const response = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(response.status, 401);
    assert.deepEqual(response.body, { error: "Invalid token" });
  }
});

test("authenticated requests reject users made inactive after issuance", async () => {
  const registered = await registerUser({ userEmail: email("session-inactive") });
  await prisma.user.update({
    where: { email: email("session-inactive") },
    data: { isActive: false },
  });

  const response = await request(app)
    .post("/api/auth/refresh")
    .set("Authorization", `Bearer ${registered.body.token}`);
  assert.equal(response.status, 401);
});

test("database role, not stale JWT role, controls authorization", async () => {
  const user = await prisma.user.create({
    data: {
      name: "Role Authority",
      email: email("role-authority"),
      password: await bcrypt.hash("RoleAuthoritySecure123!", 12),
      role: "CONSUMER",
      isActive: true,
    },
  });

  const forgedPrivilege = jwt.sign(
    { sub: user.id, role: "SUPER_ADMIN", authVersion: user.authVersion },
    TEST_JWT_SECRET,
  );
  const denied = await request(app)
    .post("/api/auth/super-admin/users")
    .set("Authorization", `Bearer ${forgedPrivilege}`)
    .send({ name: "Denied", email: email("denied-role"), password: "DeniedSecure123!", role: "ADMIN" });
  assert.equal(denied.status, 403);

  await prisma.user.update({ where: { id: user.id }, data: { role: "SUPER_ADMIN" } });
  const staleLowRole = jwt.sign(
    { sub: user.id, role: "CONSUMER", authVersion: user.authVersion },
    TEST_JWT_SECRET,
  );
  const allowed = await request(app)
    .post("/api/auth/super-admin/users")
    .set("Authorization", `Bearer ${staleLowRole}`)
    .send({ name: "Allowed", email: email("allowed-role"), password: "AllowedSecure123!", role: "ADMIN" });
  assert.equal(allowed.status, 201);
});

test("admin and super-admin creation use the centralized password policy", async () => {
  const admin = await prisma.user.create({
    data: {
      name: "Creation Admin",
      email: email("creation-admin"),
      password: await bcrypt.hash("CreationAdminSecure123!", 12),
      role: "SUPER_ADMIN",
      isActive: true,
    },
  });
  const token = jwt.sign(
    { sub: admin.id, role: admin.role, authVersion: admin.authVersion },
    TEST_JWT_SECRET,
  );
  const input = { name: "Weak User", email: email("weak-created"), password: "short", role: "CONSUMER" };

  const adminResponse = await request(app)
    .post("/api/admin/users")
    .set("Authorization", `Bearer ${token}`)
    .send(input);
  assert.equal(adminResponse.status, 400);
  assert.equal(adminResponse.body.code, "PASSWORD_TOO_SHORT");

  const superResponse = await request(app)
    .post("/api/auth/super-admin/users")
    .set("Authorization", `Bearer ${token}`)
    .send(input);
  assert.equal(superResponse.status, 400);
  assert.equal(superResponse.body.code, "PASSWORD_TOO_SHORT");
});

test("authenticated users can refresh their token", async () => {
  const registered = await registerUser({
    userEmail: email("refresh"),
  });

  assert.equal(registered.status, 201);

  const response = await request(app)
    .post("/api/auth/refresh")
    .set(
      "Authorization",
      `Bearer ${registered.body.token}`,
    );

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(typeof response.body.token, "string");
  assert.equal(response.body.user.email, email("refresh"));

  const payload = jwt.verify(
    response.body.token,
    TEST_JWT_SECRET,
  );

  assert.equal(payload.role, "CONSUMER");
  assert.equal(payload.authVersion, 0);
});

test("admin deactivation increments authVersion and invalidates an issued token", async () => {
  const superAdmin = await prisma.user.create({
    data: {
      name: "Session Admin",
      email: email("session-admin"),
      password: await bcrypt.hash("SessionAdminSecure123!", 12),
      role: "SUPER_ADMIN",
      isActive: true,
    },
  });
  const target = await registerUser({ userEmail: email("session-target") });
  const actorToken = jwt.sign(
    { sub: superAdmin.id, role: superAdmin.role, authVersion: superAdmin.authVersion },
    TEST_JWT_SECRET,
  );

  const deactivated = await request(app)
    .delete(`/api/admin/users/${target.body.user.id}`)
    .set("Authorization", `Bearer ${actorToken}`);
  assert.equal(deactivated.status, 200);

  const stored = await prisma.user.findUnique({ where: { id: target.body.user.id } });
  assert.equal(stored.isActive, false);
  assert.equal(stored.authVersion, 1);

  const denied = await request(app)
    .get("/api/auth/me")
    .set("Authorization", `Bearer ${target.body.token}`);
  assert.equal(denied.status, 401);
});

test("super-admin role changes increment authVersion", async () => {
  const superAdmin = await prisma.user.create({
    data: {
      name: "Governance Admin",
      email: email("governance-admin"),
      password: await bcrypt.hash("GovernanceAdminSecure123!", 12),
      role: "SUPER_ADMIN",
      isActive: true,
    },
  });
  const target = await prisma.user.create({
    data: {
      name: "Governance Target",
      email: email("governance-target"),
      password: await bcrypt.hash("GovernanceTargetSecure123!", 12),
      role: "CONSUMER",
      isActive: true,
    },
  });
  const actorToken = jwt.sign(
    { sub: superAdmin.id, role: superAdmin.role, authVersion: superAdmin.authVersion },
    TEST_JWT_SECRET,
  );

  const response = await request(app)
    .patch(`/api/super-admin/users/${target.id}`)
    .set("Authorization", `Bearer ${actorToken}`)
    .send({ role: "OWNER" });
  assert.equal(response.status, 200);

  const stored = await prisma.user.findUnique({ where: { id: target.id } });
  assert.equal(stored.role, "OWNER");
  assert.equal(stored.authVersion, 1);
});

test("consumers cannot create privileged users", async () => {
  const registered = await registerUser({
    userEmail: email("consumer-denied"),
  });

  assert.equal(registered.status, 201);

  const response = await request(app)
    .post("/api/auth/super-admin/users")
    .set(
      "Authorization",
      `Bearer ${registered.body.token}`,
    )
    .send({
      name: "Unauthorized Admin",
      email: email("unauthorized-admin"),
      password: "AdminSecure123!",
      role: "ADMIN",
    });

  assert.equal(response.status, 403);
  assert.deepEqual(response.body, {
    error: "Forbidden",
  });
});

test("super admins can create privileged users", async () => {
  const superAdminPassword = "SuperAdmin123!";

  await prisma.user.create({
    data: {
      name: "Integration Super Admin",
      email: email("super-admin"),
      password: await bcrypt.hash(
        superAdminPassword,
        12,
      ),
      role: "SUPER_ADMIN",
      isActive: true,
    },
  });

  const login = await request(app)
    .post("/api/auth/login")
    .send({
      email: email("super-admin"),
      password: superAdminPassword,
    });

  assert.equal(login.status, 200);

  const response = await request(app)
    .post("/api/auth/super-admin/users")
    .set(
      "Authorization",
      `Bearer ${login.body.token}`,
    )
    .send({
      name: "Created Integration Admin",
      email: email("created-admin"),
      password: "CreatedAdmin123!",
      role: "ADMIN",
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);
  assert.equal(response.body.user.role, "ADMIN");
  assert.equal(
    response.body.user.email,
    email("created-admin"),
  );

  const stored = await prisma.user.findUnique({
    where: {
      email: email("created-admin"),
    },
  });

  assert.ok(stored);
  assert.equal(stored.role, "ADMIN");
  assert.equal("password" in response.body.user, false);
});
