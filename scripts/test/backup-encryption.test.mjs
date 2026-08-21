import assert from "node:assert/strict";
import { chmod, link, lstat, mkdir, mkdtemp, readFile, readdir, rmdir, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { approvedDirectory, approvedFile, approvedOutput, deleteValidated } from "../lib/backup-process-safety.mjs";
const run = promisify(execFile);
const root = new URL("../..", import.meta.url).pathname;

test("synthetic backup encryption round trip is restrictive and non-overwriting", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pawnloop-encryption-test-"));
  const backup = join(dir, "synthetic.dump"); const manifest = `${backup}.manifest.json`; const encrypted = join(dir, "synthetic.tar.enc");
  await writeFile(backup, "synthetic archive", { mode: 0o600 }); await writeFile(manifest, JSON.stringify({ synthetic: true }), { mode: 0o600 });
  await run(join(root, "scripts/encrypt-backup.sh"), ["--backup", backup, "--manifest", manifest, "--output", encrypted, "--working-dir", dir], { env: { ...process.env, BACKUP_ENCRYPTION_SECRET: "synthetic-only-secret" } });
  assert.equal((await stat(encrypted)).mode & 0o777, 0o600);
  await assert.rejects(stat(backup)); await assert.rejects(stat(manifest));
  const restored = join(dir, "restored");
  await run(join(root, "scripts/decrypt-backup.sh"), ["--input", encrypted, "--output-dir", restored, "--working-dir", dir], { env: { ...process.env, BACKUP_ENCRYPTION_SECRET: "synthetic-only-secret" } });
  assert.equal(await readFile(join(restored, "synthetic.dump"), "utf8"), "synthetic archive");
  await assert.rejects(run(join(root, "scripts/decrypt-backup.sh"), ["--input", encrypted, "--output-dir", join(dir, "wrong"), "--working-dir", dir], { env: { ...process.env, BACKUP_ENCRYPTION_SECRET: "wrong" } }));
  await assert.rejects(run(join(root, "scripts/encrypt-backup.sh"), ["--backup", backup, "--manifest", manifest, "--output", encrypted, "--working-dir", dir], { env: { ...process.env, BACKUP_ENCRYPTION_SECRET: "synthetic-only-secret" } }));
});

async function protectedFixture() {
  const dir = await mkdtemp(join(tmpdir(), "pawnloop-path-safety-")); await chmod(dir, 0o700);
  const sentinel = join(dirname(dir), `${dir.split("/").pop()}.sentinel`); await writeFile(sentinel, "preserve", { mode: 0o600 });
  const backup = join(dir, "safe.dump"), manifest = join(dir, "safe.dump.manifest.json");
  await writeFile(backup, "backup", { mode: 0o600 }); await writeFile(manifest, "{}", { mode: 0o600 });
  return { dir, sentinel, backup, manifest, cleanup: () => Promise.all([removeTree(dir), removeTree(sentinel)]) };
}
async function removeTree(candidate) { try { const info = await lstat(candidate); if (!info.isDirectory() || info.isSymbolicLink()) return unlink(candidate); for (const entry of await readdir(candidate)) await removeTree(join(candidate, entry)); await rmdir(candidate); } catch (error) { if (error.code !== "ENOENT") throw error; } }
async function sentinelUnchanged(fixture) { assert.equal(await readFile(fixture.sentinel, "utf8"), "preserve"); }

test("rejects broad, repository, traversal, insecure, and symlinked working directories", async () => {
  const fixture = await protectedFixture();
  try {
    for (const value of ["", ".", "/", homedir(), "/tmp", "/private/tmp", root, dirname(root), `${fixture.dir}/../escape`]) await assert.rejects(approvedDirectory(value));
    await chmod(fixture.dir, 0o755); await assert.rejects(approvedDirectory(fixture.dir)); await chmod(fixture.dir, 0o700);
    const target = join(fixture.dir, "target"); await mkdir(target, { mode: 0o700 }); const linked = join(dirname(fixture.dir), `${fixture.dir.split("/").pop()}.link`); await symlink(target, linked); await assert.rejects(approvedDirectory(linked)); await unlink(linked);
    await sentinelUnchanged(fixture);
  } finally { await fixture.cleanup(); }
});

test("rejects symlinked, external, insecure, and hard-linked inputs without touching sentinel", async () => {
  const fixture = await protectedFixture();
  try {
    const external = join(dirname(fixture.dir), `${fixture.dir.split("/").pop()}.dump`); await writeFile(external, "external", { mode: 0o600 });
    await assert.rejects(approvedFile(external, fixture.dir, { kind: "backup" }));
    const linked = join(fixture.dir, "linked.dump"); await symlink(fixture.backup, linked); await assert.rejects(approvedFile(linked, fixture.dir, { kind: "backup" }));
    const hard = join(dirname(fixture.dir), `${fixture.dir.split("/").pop()}.hard`); await link(fixture.backup, hard); await assert.rejects(approvedFile(fixture.backup, fixture.dir, { kind: "backup" })); await unlink(hard);
    const hardManifest = join(dirname(fixture.dir), `${fixture.dir.split("/").pop()}.manifest-hard`); await link(fixture.manifest, hardManifest); await assert.rejects(approvedFile(fixture.manifest, fixture.dir, { kind: "manifest" })); await unlink(hardManifest);
    const alias = join(fixture.dir, "alias.dump.manifest.json"); await link(fixture.backup, alias); await assert.rejects(approvedFile(fixture.backup, fixture.dir, { kind: "backup" })); await assert.rejects(approvedFile(alias, fixture.dir, { kind: "manifest" })); await unlink(alias);
    await chmod(fixture.backup, 0o644); await assert.rejects(approvedFile(fixture.backup, fixture.dir, { kind: "backup" }));
    await unlink(linked); await unlink(external); await sentinelUnchanged(fixture);
  } finally { await fixture.cleanup(); }
});

test("rejects output collisions and every existing destination type", async () => {
  const fixture = await protectedFixture();
  try {
    for (const value of [fixture.backup, fixture.manifest, join(dirname(fixture.dir), "outside.tar.enc"), `${fixture.dir}/../escape.tar.enc`, join(fixture.dir, "bad.enc")]) await assert.rejects(approvedOutput(value, fixture.dir));
    for (const name of ["file.tar.enc", "directory.tar.enc", "symlink.tar.enc", "hardlink.tar.enc"]) {
      const output = join(fixture.dir, name);
      if (name.startsWith("directory")) await mkdir(output, { mode: 0o700 }); else if (name.startsWith("symlink")) await symlink(fixture.sentinel, output); else if (name.startsWith("hardlink")) await link(fixture.sentinel, output); else await writeFile(output, "existing", { mode: 0o600 });
      await assert.rejects(approvedOutput(output, fixture.dir));
    }
    await sentinelUnchanged(fixture);
  } finally { await fixture.cleanup(); }
});

test("identity-bound deletion rejects replacement and relinking, then safely deletes unchanged input", async () => {
  const fixture = await protectedFixture();
  try {
    const original = await approvedFile(fixture.backup, fixture.dir, { kind: "backup" });
    await unlink(fixture.backup); await writeFile(fixture.backup, "replacement", { mode: 0o600 }); await assert.rejects(deleteValidated(original, fixture.dir));
    const replacement = await approvedFile(fixture.backup, fixture.dir, { kind: "backup" }); const hard = join(dirname(fixture.dir), `${fixture.dir.split("/").pop()}.hard2`); await link(fixture.backup, hard); await assert.rejects(deleteValidated(replacement, fixture.dir)); await unlink(hard);
    const stable = await approvedFile(fixture.backup, fixture.dir, { kind: "backup" }); await deleteValidated(stable, fixture.dir); await assert.rejects(lstat(fixture.backup));
    await sentinelUnchanged(fixture);
  } finally { await fixture.cleanup(); }
});
