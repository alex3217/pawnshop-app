import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import jwt from "jsonwebtoken";
import request from "supertest";

const secret = "training-integration-secret-not-for-production";
const suffix = "@training.integration.test";
let app; let prisma; let admin; let consumer; let otherConsumer; let owner; let runTrainingAuditTransaction; let updateTrainingContent;
const auth = (user) => `Bearer ${jwt.sign({ sub: user.id, email: user.email, role: user.role, authVersion: 0 }, secret)}`;

before(async () => {
  Object.assign(process.env, { NODE_ENV: "test", APP_ENV: "test", JWT_SECRET: secret, AUCTION_SCHEDULER_ENABLED: "false" });
  const url = new URL(process.env.DATABASE_URL || "");
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname)); assert.equal(url.pathname, "/pawnshop_test");
  ({ prisma } = await import("../src/lib/prisma.js"));
  ({ runTrainingAuditTransaction } = await import("../src/controllers/training.controller.js"));
  ({ updateTrainingContent } = await import("../src/services/training.service.js"));
  const { createApp } = await import("../src/app.js"); app = createApp();
  admin = await prisma.user.create({ data: { name: "Training Admin", email: `admin${suffix}`, password: "test-only", role: "SUPER_ADMIN", emailVerifiedAt: new Date() } });
  consumer = await prisma.user.create({ data: { name: "Training Consumer", email: `consumer${suffix}`, password: "test-only", role: "CONSUMER", emailVerifiedAt: new Date() } });
  otherConsumer = await prisma.user.create({ data: { name: "Other Training Consumer", email: `other-consumer${suffix}`, password: "test-only", role: "CONSUMER", emailVerifiedAt: new Date() } });
  owner = await prisma.user.create({ data: { name: "Training Owner", email: `owner${suffix}`, password: "test-only", role: "OWNER", emailVerifiedAt: new Date() } });
});

after(async () => {
  await prisma.trainingProgress.deleteMany({ where: { user: { email: { endsWith: suffix } } } });
  await prisma.trainingContent.deleteMany({ where: { createdByUserId: admin.id } });
  await prisma.superAdminAuditLog.deleteMany({ where: { actorId: admin.id, routeKey: "training-content" } });
  await prisma.user.deleteMany({ where: { email: { endsWith: suffix } } });
  await prisma.$disconnect();
});

test("draft privacy, Super Admin management, audience targeting, idempotent completion, and retained progress", async () => {
  assert.equal((await request(app).get("/api/training/admin").set("Authorization", auth(consumer))).status, 403);
  const created = await request(app).post("/api/training/admin").set("Authorization", auth(admin)).send({ slug: "consumer-basics", title: "Consumer basics", summary: "A safe test tutorial", category: "Getting Started", type: "TUTORIAL", difficulty: "BEGINNER", audiences: ["CONSUMER"], steps: [{ title: "Open PawnLoop", body: "Sign in and open your dashboard." }], featured: true, required: true, sortOrder: 1 });
  assert.equal(created.status, 201); const id = created.body.item.id;
  assert.equal((await request(app).get("/api/training").set("Authorization", auth(consumer))).body.items.length, 0);
  await request(app).post(`/api/training/admin/${id}/lifecycle`).set("Authorization", auth(admin)).send({ status: "PUBLISHED" }).expect(200);
  assert.equal((await request(app).get("/api/training").set("Authorization", auth(consumer))).body.items.length, 1);
  assert.equal((await request(app).get("/api/training").set("Authorization", auth(owner))).body.items.length, 0);
  const first = await request(app).put(`/api/training/content/${id}/progress`).set("Authorization", auth(consumer)).send({ resumePositionSeconds: 0, completed: true });
  const second = await request(app).put(`/api/training/content/${id}/progress`).set("Authorization", auth(consumer)).send({ resumePositionSeconds: 0, completed: true });
  assert.equal(first.status, 200); assert.equal(second.status, 200); assert.equal(first.body.progress.completedAt, second.body.progress.completedAt);
  assert.equal(await prisma.trainingProgress.count({ where: { contentId: id } }), 1);
  const privateView = await request(app).get("/api/training/content/consumer-basics").set("Authorization", auth(otherConsumer));
  assert.equal(privateView.status, 200); assert.equal(privateView.body.item.progress, null);
  await request(app).post(`/api/training/admin/${id}/lifecycle`).set("Authorization", auth(admin)).send({ status: "ARCHIVED" }).expect(200);
  assert.equal((await request(app).get("/api/training").set("Authorization", auth(consumer))).body.items.length, 0);
  assert.equal(await prisma.trainingProgress.count({ where: { contentId: id } }), 1);
});

const base = (slug, overrides = {}) => ({
  slug, title: slug.replaceAll("-", " "), summary: "Training invariant regression content",
  category: "Regression", type: "TUTORIAL", difficulty: "BEGINNER",
  audiences: ["CONSUMER"], steps: [{ title: "Valid step", body: "Complete the valid step." }],
  featured: false, required: false, sortOrder: 10, ...overrides,
});
const create = (payload) => request(app).post("/api/training/admin").set("Authorization", auth(admin)).send(payload);
const lifecycle = (id, status) => request(app).post(`/api/training/admin/${id}/lifecycle`).set("Authorization", auth(admin)).send({ status });
const edit = (id, payload) => request(app).patch(`/api/training/admin/${id}`).set("Authorization", auth(admin)).send(payload);

test("incomplete drafts are allowed but invalid video and tutorial records cannot publish", async () => {
  assert.equal((await create(base("direct-published-video-missing", { status: "PUBLISHED", type: "VIDEO", videoUrl: null, steps: [] }))).status, 400);
  assert.equal((await create(base("direct-published-tutorial-missing", { status: "PUBLISHED", steps: [] }))).status, 400);
  const video = await create(base("draft-video-incomplete", { type: "VIDEO", videoUrl: null, steps: [] }));
  assert.equal(video.status, 201); assert.equal(video.body.item.status, "DRAFT");
  assert.equal((await lifecycle(video.body.item.id, "PUBLISHED")).status, 400);

  const tutorial = await create(base("draft-tutorial-incomplete", { steps: [] }));
  assert.equal(tutorial.status, 201);
  assert.equal((await lifecycle(tutorial.body.item.id, "PUBLISHED")).status, 400);

  const invalidCreate = await create(base("invalid-video-url", { type: "VIDEO", videoUrl: "http://youtube.com/watch?v=dQw4w9WgXcQ", steps: [] }));
  assert.equal(invalidCreate.status, 400);
  await prisma.trainingContent.update({ where: { id: video.body.item.id }, data: { videoUrl: "http://youtube.com/watch?v=dQw4w9WgXcQ" } });
  assert.equal((await lifecycle(video.body.item.id, "PUBLISHED")).status, 400);
  assert.equal(await prisma.superAdminAuditLog.count({ where: { actorId: admin.id, targetId: video.body.item.id, action: "TRAINING_CONTENT_PUBLISHED", success: true } }), 0);
});

test("published edits validate final merged material and valid type changes succeed", async () => {
  const tutorial = await create(base("published-edit-tutorial", { status: "PUBLISHED" }));
  assert.equal(tutorial.status, 201); assert.equal(tutorial.body.item.status, "PUBLISHED");
  const tutorialId = tutorial.body.item.id;
  const auditBefore = await prisma.superAdminAuditLog.count({ where: { actorId: admin.id, targetId: tutorialId, success: true } });
  assert.equal((await edit(tutorialId, { steps: [] })).status, 400);
  assert.equal((await edit(tutorialId, { type: "VIDEO" })).status, 400);
  const unchanged = await prisma.trainingContent.findUnique({ where: { id: tutorialId }, include: { steps: true } });
  assert.equal(unchanged.type, "TUTORIAL"); assert.equal(unchanged.steps.length, 1);
  assert.equal(await prisma.superAdminAuditLog.count({ where: { actorId: admin.id, targetId: tutorialId, success: true } }), auditBefore);
  assert.equal((await edit(tutorialId, { type: "VIDEO", videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&bad=1&tail=2" })).status, 200);

  const video = await create(base("published-edit-video", { status: "PUBLISHED", type: "VIDEO", videoUrl: "https://vimeo.com/123456789", steps: [] }));
  assert.equal(video.status, 201); const videoId = video.body.item.id;
  assert.equal((await edit(videoId, { videoUrl: "" })).status, 400);
  assert.equal((await edit(videoId, { type: "TUTORIAL" })).status, 400);
  const validChange = await edit(videoId, { type: "TUTORIAL", steps: [{ title: "Converted", body: "Now valid." }] });
  assert.equal(validChange.status, 200); assert.equal(validChange.body.item.type, "TUTORIAL");
  assert.equal(await prisma.superAdminAuditLog.count({ where: { actorId: admin.id, targetId: videoId, action: "TRAINING_CONTENT_UPDATED", success: true } }), 1);
});

test("valid lifecycle publication remains atomic and unpublished content may become incomplete", async () => {
  const tutorial = await create(base("valid-lifecycle-tutorial")); const tutorialId = tutorial.body.item.id;
  assert.equal((await lifecycle(tutorialId, "PUBLISHED")).status, 200);
  assert.equal(await prisma.superAdminAuditLog.count({ where: { actorId: admin.id, targetId: tutorialId, action: "TRAINING_CONTENT_PUBLISHED", success: true } }), 1);
  await lifecycle(tutorialId, "UNPUBLISHED");
  assert.equal((await edit(tutorialId, { steps: [] })).status, 200);
  assert.equal((await lifecycle(tutorialId, "PUBLISHED")).status, 400);

  const video = await create(base("valid-lifecycle-video", { type: "VIDEO", videoUrl: "https://vimeo.com/987654321", steps: [] }));
  assert.equal((await lifecycle(video.body.item.id, "PUBLISHED")).status, 200);
});

test("step replacement and type changes reconcile only the target lesson", async () => {
  const target = await create(base("bounded-step-target", {
    steps: [{ title: "Old one", body: "First old step." }, { title: "Old two", body: "Second old step." }],
  }));
  const neighbor = await create(base("bounded-step-neighbor", {
    steps: [{ title: "Neighbor one", body: "Keep this step." }, { title: "Neighbor two", body: "Keep this too." }],
  }));
  assert.equal(target.status, 201); assert.equal(neighbor.status, 201);

  const replaced = await edit(target.body.item.id, {
    steps: [{ title: "New first", body: "Stored first." }, { title: "New second", body: "Stored second." }, { title: "New third", body: "Stored third." }],
  });
  assert.equal(replaced.status, 200);
  assert.deepEqual(replaced.body.item.steps.map(({ position, title }) => ({ position, title })), [
    { position: 1, title: "New first" }, { position: 2, title: "New second" }, { position: 3, title: "New third" },
  ]);
  const untouched = await prisma.trainingTutorialStep.findMany({ where: { contentId: neighbor.body.item.id }, orderBy: { position: "asc" } });
  assert.deepEqual(untouched.map(({ position, title }) => ({ position, title })), [
    { position: 1, title: "Neighbor one" }, { position: 2, title: "Neighbor two" },
  ]);

  const converted = await edit(target.body.item.id, { type: "VIDEO", videoUrl: "https://vimeo.com/123456789" });
  assert.equal(converted.status, 200); assert.equal(converted.body.item.steps.length, 0);
  assert.equal(await prisma.trainingTutorialStep.count({ where: { contentId: target.body.item.id } }), 0);
  assert.equal(await prisma.trainingTutorialStep.count({ where: { contentId: neighbor.body.item.id } }), 2);
});

test("failed audit rolls back bounded content and step replacement", async () => {
  const created = await create(base("bounded-step-rollback", {
    steps: [{ title: "Original", body: "Must survive rollback." }],
  }));
  assert.equal(created.status, 201);
  const id = created.body.item.id;
  const auditBefore = await prisma.superAdminAuditLog.count({ where: { targetId: id, success: true } });
  const failingDb = {
    $transaction: (callback) => prisma.$transaction((tx) => callback(new Proxy(tx, {
      get(target, property) {
        if (property === "superAdminAuditLog") return { create: async () => { throw new Error("audit unavailable"); } };
        return target[property];
      },
    }))),
  };
  const req = { user: admin, method: "PATCH", originalUrl: `/api/training/admin/${id}`, requestId: "bounded-rollback" };
  await assert.rejects(
    runTrainingAuditTransaction(req, "TRAINING_CONTENT_UPDATED", id, (tx) => updateTrainingContent(admin, id, {
      title: "Should roll back",
      steps: [{ title: "Replacement one", body: "Should roll back." }, { title: "Replacement two", body: "Should also roll back." }],
    }, tx), failingDb),
    /audit unavailable/,
  );
  const unchanged = await prisma.trainingContent.findUnique({ where: { id }, include: { steps: { orderBy: { position: "asc" } } } });
  assert.equal(unchanged.title, "bounded step rollback");
  assert.deepEqual(unchanged.steps.map(({ position, title }) => ({ position, title })), [{ position: 1, title: "Original" }]);
  assert.equal(await prisma.superAdminAuditLog.count({ where: { targetId: id, success: true } }), auditBefore);
});
