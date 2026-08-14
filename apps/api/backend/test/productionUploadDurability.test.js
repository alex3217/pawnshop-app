import assert from "node:assert/strict";
import test from "node:test";
import { createS3UploadStorage } from "../src/services/uploadStorage.service.js";

function fakeDurableStore() {
  const objects = new Map();
  return {
    client: {
      async send(command) {
        const name = command.constructor.name;
        const input = command.input;
        if (name === "PutObjectCommand") objects.set(input.Key, Buffer.from(input.Body));
        if (name === "DeleteObjectCommand") objects.delete(input.Key);
        return {};
      },
    },
    objects,
  };
}

function storageFor(store) {
  return createS3UploadStorage({
    enabled: true,
    endpoint: "https://storage.example.test",
    region: "auto",
    forcePathStyle: false,
    accessKeyId: "fixture",
    secretAccessKey: "fixture",
    bucket: "fixture",
    publicBaseUrl: "https://images.example.test",
    limits: { storageTimeoutMs: 100 },
  }, { client: store.client });
}

test("canonical public image identity survives application recreation for item and auction reads", async () => {
  const durable = fakeDurableStore();
  const firstProcess = storageFor(durable);
  const key = "uploads/123e4567-e89b-12d3-a456-426614174000.webp";
  const stored = await firstProcess.put({ key, body: Buffer.from("normalized-image"), contentType: "image/webp" });
  const database = { item: { id: "item-1", images: [stored.url] } };
  database.auction = { id: "auction-1", item: database.item };

  const secondProcess = storageFor(durable);
  assert.notEqual(secondProcess, firstProcess);
  assert.equal(durable.objects.has(key), true);
  assert.equal(database.item.images[0], stored.url);
  assert.equal(database.auction.item.images[0], stored.url);
  assert.equal(new URL(stored.url).search, "");
  assert.equal(new URL(stored.url).protocol, "https:");
});

test("managed storage rejects traversal and cleanup outside the configured prefix", async () => {
  const storage = storageFor(fakeDurableStore());
  for (const key of ["../secret", "uploads/../secret.png", "/uploads/id.png", "other/id.png", "uploads/name.exe"]) {
    await assert.rejects(storage.delete({ key }), /managed upload prefix/);
    await assert.rejects(storage.put({ key, body: Buffer.from("x"), contentType: "image/png" }), /managed upload prefix/);
  }
});

test("deleting a missing managed object is safe and idempotent", async () => {
  const durable = fakeDurableStore();
  const storage = storageFor(durable);
  const key = "uploads/123e4567-e89b-12d3-a456-426614174000.png";
  await storage.delete({ key });
  await storage.delete({ key });
  assert.equal(durable.objects.has(key), false);
});
