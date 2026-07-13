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

function email(prefix) {
  return `${prefix}${TEST_DOMAIN}`;
}

async function registerUser({
  name = "Integration Consumer",
  userEmail = email("consumer"),
  password = "Consumer123!",
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
});

beforeEach(async () => {
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

  await prisma.user.deleteMany({
    where: {
      email: {
        endsWith: TEST_DOMAIN,
      },
    },
  });

  await prisma.$disconnect();
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
  assert.equal(stored.role, "CONSUMER");
  assert.notEqual(stored.password, "Consumer123!");
  assert.equal(
    await bcrypt.compare(
      "Consumer123!",
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

test("registration rejects short passwords", async () => {
  const response = await registerUser({
    userEmail: email("short-password"),
    password: "12345",
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    error: "Password must be at least 6 characters",
  });
});

test("registered users can log in", async () => {
  const registered = await registerUser({
    userEmail: email("login"),
    password: "Login123!",
  });

  assert.equal(registered.status, 201);

  const response = await request(app)
    .post("/api/auth/login")
    .send({
      email: "LOGIN@INTEGRATION.PAWNLOOP.TEST",
      password: "Login123!",
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
});

test("login rejects an incorrect password", async () => {
  const registered = await registerUser({
    userEmail: email("wrong-password"),
    password: "Correct123!",
  });

  assert.equal(registered.status, 201);

  const response = await request(app)
    .post("/api/auth/login")
    .send({
      email: email("wrong-password"),
      password: "Incorrect123!",
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
      password: "Consumer123!",
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
      password: "Admin123!",
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
