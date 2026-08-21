import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
const run = promisify(execFile);
const root = new URL("../..", import.meta.url).pathname;

test("synthetic backup encryption round trip is restrictive and non-overwriting", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pawnloop-encryption-test-"));
  const backup = join(dir, "synthetic.dump"); const manifest = `${backup}.manifest.json`; const encrypted = join(dir, "synthetic.tar.enc");
  await writeFile(backup, "synthetic archive", { mode: 0o600 }); await writeFile(manifest, JSON.stringify({ synthetic: true }), { mode: 0o600 });
  await run(join(root, "scripts/encrypt-backup.sh"), ["--backup", backup, "--manifest", manifest, "--output", encrypted], { env: { ...process.env, BACKUP_ENCRYPTION_SECRET: "synthetic-only-secret" } });
  assert.equal((await stat(encrypted)).mode & 0o777, 0o600);
  await assert.rejects(stat(backup)); await assert.rejects(stat(manifest));
  const restored = join(dir, "restored");
  await run(join(root, "scripts/decrypt-backup.sh"), ["--input", encrypted, "--output-dir", restored], { env: { ...process.env, BACKUP_ENCRYPTION_SECRET: "synthetic-only-secret" } });
  assert.equal(await readFile(join(restored, "synthetic.dump"), "utf8"), "synthetic archive");
  await assert.rejects(run(join(root, "scripts/decrypt-backup.sh"), ["--input", encrypted, "--output-dir", join(dir, "wrong")], { env: { ...process.env, BACKUP_ENCRYPTION_SECRET: "wrong" } }));
  await assert.rejects(run(join(root, "scripts/encrypt-backup.sh"), ["--backup", backup, "--manifest", manifest, "--output", encrypted], { env: { ...process.env, BACKUP_ENCRYPTION_SECRET: "synthetic-only-secret" } }));
});
