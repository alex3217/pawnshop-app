import test from "node:test";
import assert from "node:assert/strict";
import { validatePublishedTrainingContent, validateTrainingVideoUrl } from "../src/services/training.service.js";
import { runTrainingAuditTransaction } from "../src/controllers/training.controller.js";

test("accepts and normalizes approved HTTPS video URLs", () => {
  assert.match(validateTrainingVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&utm_source=x"), /^https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ$/);
  assert.equal(validateTrainingVideoUrl("https://vimeo.com/123456789"), "https://vimeo.com/123456789");
});

test("reconstructs YouTube queries from only canonical v and optional t parameters", () => {
  assert.equal(
    validateTrainingVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&utm_one=1&redirect=x&utm_two=2&redirect=y&t=1m30s&tail=z"),
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s",
  );
  assert.equal(
    validateTrainingVideoUrl("https://youtu.be/dQw4w9WgXcQ?bad=1&bad=2&t=90&tail=3"),
    "https://youtu.be/dQw4w9WgXcQ?t=90",
  );
});

test("published-content invariant requires material for the resulting type", () => {
  assert.throws(
    () => validatePublishedTrainingContent({ type: "VIDEO", videoUrl: null, audiences: ["CONSUMER"], steps: [] }),
    /requires a video URL/,
  );
  assert.throws(
    () => validatePublishedTrainingContent({ type: "TUTORIAL", videoUrl: null, audiences: ["CONSUMER"], steps: [] }),
    /requires at least one step/,
  );
  assert.doesNotThrow(() => validatePublishedTrainingContent({ type: "VIDEO", videoUrl: "https://vimeo.com/123456789", audiences: ["CONSUMER"], steps: [] }));
  assert.doesNotThrow(() => validatePublishedTrainingContent({ type: "TUTORIAL", videoUrl: null, audiences: ["CONSUMER"], steps: [{ title: "One", body: "Do it" }] }));
});

test("audit persistence failure rolls back the paired content mutation", async () => {
  const committed = { title: "Before" };
  const fakeDb = {
    async $transaction(callback) {
      const pending = { ...committed };
      const tx = {
        setTitle(value) { pending.title = value; },
        superAdminAuditLog: { async create() { throw new Error("audit unavailable"); } },
      };
      const result = await callback(tx);
      Object.assign(committed, pending);
      return result;
    },
  };
  const req = { user: { id: "admin", email: "admin@example.test", role: "SUPER_ADMIN" }, method: "PATCH", originalUrl: "/api/training/admin/content", requestId: "request-test" };
  await assert.rejects(
    runTrainingAuditTransaction(req, "TRAINING_CONTENT_UPDATED", "content", async (tx) => {
      tx.setTitle("After");
      return { id: "content" };
    }, fakeDb),
    /audit unavailable/,
  );
  assert.equal(committed.title, "Before");
});

for (const value of [
  "http://youtube.com/watch?v=dQw4w9WgXcQ",
  "https://evil.example/watch?v=dQw4w9WgXcQ",
  "https://user:secret@youtube.com/watch?v=dQw4w9WgXcQ",
  "https://youtube.com:444/watch?v=dQw4w9WgXcQ",
  "https://youtube.com/embed/dQw4w9WgXcQ",
  "https://youtube.com/watch?v=dQw4w9WgXcQ&t=not-a-time",
  "<iframe src=\"https://youtube.com/watch?v=dQw4w9WgXcQ\"></iframe>",
]) test(`rejects unsafe video value: ${value.slice(0, 35)}`, () => assert.throws(() => validateTrainingVideoUrl(value)));
