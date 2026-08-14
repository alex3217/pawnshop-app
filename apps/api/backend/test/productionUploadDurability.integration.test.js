import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";
import { validateTestDatabaseEnvironment } from "../scripts/assert-test-database.mjs";

const execFileAsync = promisify(execFile);
const helper = fileURLToPath(new URL("./helpers/productionUploadColdRestart.fixture.js", import.meta.url));

async function runProcess(mode, storageDirectory, marker) {
  const { stdout, stderr } = await execFileAsync(process.execPath, [helper, mode], {
    cwd: path.dirname(helper),
    env: {
      ...process.env,
      NODE_ENV: "test",
      APP_ENV: "test",
      DURABLE_UPLOADS_ENABLED: "false",
      COLD_RESTART_STORAGE_DIRECTORY: storageDirectory,
      COLD_RESTART_MARKER: marker,
    },
    timeout: 30_000,
  });
  assert.equal(stderr, "");
  const jsonStart = stdout.lastIndexOf('{"database"');
  assert.notEqual(jsonStart, -1, `child ${mode} did not emit certification evidence`);
  return JSON.parse(stdout.slice(jsonStart));
}

test("uploaded image survives a complete process exit and fresh public read process", async () => {
  validateTestDatabaseEnvironment(process.env);
  const storageDirectory = await mkdtemp(path.join(tmpdir(), "pawnloop-cold-restart-"));
  const marker = `production-upload-cold-restart-${process.pid}-${Date.now()}`;

  try {
    const written = await runProcess("write", storageDirectory, marker);
    assert.equal(written.database, "pawnshop_test");
    assert.equal(written.persisted.uploadAsset, true);
    assert.equal(written.persisted.item, true);
    assert.equal(written.persisted.auction, true);

    // The writer is fully gone before this separate Node process starts. The reader
    // discovers application identifiers and image references from PostgreSQL rather
    // than receiving process-local application state from the writer.
    const read = await runProcess("read", storageDirectory, marker);
    assert.equal(read.database, "pawnshop_test");
    assert.notEqual(read.pid, written.pid);
    assert.equal(read.objectExists, true);
    assert.deepEqual(read.referenceCleanup, {
      attachedPreserved: true,
      orphanDeleted: true,
      detachedDeleted: true,
    });
    assert.deepEqual(read.representations, {
      itemCard: [written.url],
      itemDetail: [written.url],
      auctionCard: [written.url],
      auctionDetail: [written.url],
    });
  } finally {
    await runProcess("cleanup", storageDirectory, marker).catch(() => {});
    await rm(storageDirectory, { recursive: true, force: true });
  }
});
