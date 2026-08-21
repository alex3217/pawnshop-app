import assert from "node:assert/strict";
import { chmod, link, lstat, mkdir, mkdtemp, open, readFile, readdir, rename, rmdir, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { approvedDirectory, approvedFile, approvedOutput, createApprovedDirectory, deleteValidated, deleteValidatedDirectory, extractValidatedTar, preflightTarArchive } from "../lib/backup-process-safety.mjs";
const run = promisify(execFile);
const root = new URL("../..", import.meta.url).pathname;

test("synthetic backup encryption round trip is restrictive and non-overwriting", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pawnloop-encryption-test-"));
  try {
    const backup = join(dir, "synthetic.dump"); const manifest = `${backup}.manifest.json`; const encrypted = join(dir, "synthetic.tar.enc");
    await writeFile(backup, "synthetic archive", { mode: 0o600 }); await writeFile(manifest, JSON.stringify({ synthetic: true }), { mode: 0o600 });
    await run(join(root, "scripts/encrypt-backup.sh"), ["--backup", backup, "--manifest", manifest, "--output", encrypted, "--working-dir", dir], { env: { ...process.env, BACKUP_ENCRYPTION_SECRET: "synthetic-only-secret" } });
    assert.equal((await stat(encrypted)).mode & 0o777, 0o600);
    await assert.rejects(stat(backup)); await assert.rejects(stat(manifest));
    const restored = join(dir, "restored");
    await run(join(root, "scripts/decrypt-backup.sh"), ["--input", encrypted, "--output-dir", restored, "--working-dir", dir], { env: { ...process.env, BACKUP_ENCRYPTION_SECRET: "synthetic-only-secret" } });
    assert.equal(await readFile(join(restored, "synthetic.dump"), "utf8"), "synthetic archive");
    assert.equal((await stat(restored)).mode & 0o777, 0o700); assert.equal((await stat(join(restored, "synthetic.dump"))).mode & 0o777, 0o600);
    await assert.rejects(run(join(root, "scripts/decrypt-backup.sh"), ["--input", encrypted, "--output-dir", join(dir, "wrong"), "--working-dir", dir], { env: { ...process.env, BACKUP_ENCRYPTION_SECRET: "wrong" } }));
    await assert.rejects(stat(join(dir, "wrong"))); assert.equal((await readdir(dir)).some(name => name.startsWith(".decrypt.")), false);
    await assert.rejects(run(join(root, "scripts/encrypt-backup.sh"), ["--backup", backup, "--manifest", manifest, "--output", encrypted, "--working-dir", dir], { env: { ...process.env, BACKUP_ENCRYPTION_SECRET: "synthetic-only-secret" } }));
  } finally { await removeTree(dir); }
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

function tarOctal(value, length) { return `${value.toString(8).padStart(length - 1, "0")}\0`; }
function tarArchive(entries) {
  const blocks = [];
  for (const entry of entries) {
    const data = Buffer.from(entry.data || ""), header = Buffer.alloc(512), type = entry.type ?? "0";
    header.write(entry.name || "", 0, 100, "ascii");
    header.write(tarOctal(type === "5" ? 0o700 : 0o600, 8), 100, 8, "ascii");
    header.write(tarOctal(0, 8), 108, 8, "ascii"); header.write(tarOctal(0, 8), 116, 8, "ascii");
    header.write(tarOctal(type === "0" || type === "\0" ? data.length : 0, 12), 124, 12, "ascii"); header.write(tarOctal(1, 12), 136, 12, "ascii");
    header.fill(0x20, 148, 156); header[156] = type === "\0" ? 0 : type.charCodeAt(0); header.write(entry.linkname || "", 157, 100, "ascii");
    header.write("ustar\0", 257, 6, "binary"); header.write("00", 263, 2, "ascii");
    const checksum = header.reduce((sum, byte) => sum + byte, 0); header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
    blocks.push(header); if (data.length) blocks.push(data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024)); return Buffer.concat(blocks);
}

test("archive preflight rejects unsafe paths, links, special types, duplicates, and conflicts without touching sentinel", async () => {
  const fixture = await protectedFixture();
  const cases = [
    ["absolute", [{ name: "/absolute.dump", data: "x" }]],
    ["parent traversal", [{ name: "../escape.dump", data: "x" }]],
    ["nested traversal", [{ name: "safe/../../escape.dump", data: "x" }]],
    ["empty name", [{ name: "", data: "x" }]],
    ["symlink", [{ name: "linked", type: "2", linkname: fixture.sentinel }]],
    ["hard link", [{ name: "linked", type: "1", linkname: "target.dump" }]],
    ["symlink then child", [{ name: "linked", type: "2", linkname: fixture.sentinel }, { name: "linked/child.dump", data: "x" }]],
    ["character device", [{ name: "special", type: "3" }]],
    ["block device", [{ name: "special", type: "4" }]],
    ["fifo", [{ name: "special", type: "6" }]],
    ["socket", [{ name: "special", type: "s" }]],
    ["duplicate", [{ name: "same.dump", data: "a" }, { name: "same.dump", data: "b" }]],
    ["case collision", [{ name: "Same.dump", data: "a" }, { name: "same.dump", data: "b" }]],
    ["non-directory ancestor", [{ name: "parent", data: "a" }, { name: "parent/child.dump", data: "b" }]],
  ];
  try {
    for (const [label, entries] of cases) {
      const archive = join(fixture.dir, `${label.replaceAll(" ", "-")}.tar`), output = join(fixture.dir, `output-${label.replaceAll(" ", "-")}`);
      await writeFile(archive, tarArchive(entries), { mode: 0o600 }); const record = await createApprovedDirectory(output, fixture.dir);
      await assert.rejects(extractValidatedTar(archive, record, fixture.dir), undefined, label); await assert.rejects(lstat(output)); await sentinelUnchanged(fixture);
    }
  } finally { await fixture.cleanup(); }
});

test("safe nested archive extraction is lstat-validated, permissioned, and identity-cleaned", async () => {
  const fixture = await protectedFixture();
  try {
    const archive = join(fixture.dir, "safe.tar"); await writeFile(archive, tarArchive([{ name: "nested/", type: "5" }, { name: "nested/data.dump", data: "safe-data" }]), { mode: 0o600 });
    assert.deepEqual((await preflightTarArchive(archive)).map(({ path, type }) => [path, type]), [["nested", "directory"], ["nested/data.dump", "file"]]);
    const output = join(fixture.dir, "safe-output"), record = await createApprovedDirectory(output, fixture.dir), result = await extractValidatedTar(archive, record, fixture.dir);
    assert.equal(await readFile(join(output, "nested/data.dump"), "utf8"), "safe-data"); assert.equal((await stat(join(output, "nested"))).mode & 0o777, 0o700); assert.equal((await stat(join(output, "nested/data.dump"))).mode & 0o777, 0o600);
    await deleteValidatedDirectory(result.directory, fixture.dir); await assert.rejects(lstat(output)); await sentinelUnchanged(fixture);
  } finally { await fixture.cleanup(); }
});

test("archive content changes after preflight fail closed and use identity-bound cleanup", async () => {
  const fixture = await protectedFixture();
  try {
    const archive = join(fixture.dir, "changed-after-preflight.tar"); await writeFile(archive, tarArchive([{ name: "data.dump", data: "original" }]), { mode: 0o600 });
    const output = join(fixture.dir, "changed-output"), record = await createApprovedDirectory(output, fixture.dir);
    await assert.rejects(extractValidatedTar(archive, record, fixture.dir, { beforeExtraction: async ([entry]) => { const handle = await open(archive, "r+"); try { await handle.write(Buffer.from("X"), 0, 1, entry.dataOffset); } finally { await handle.close(); } } }));
    await assert.rejects(lstat(output)); await sentinelUnchanged(fixture);
  } finally { await fixture.cleanup(); }
});

test("identity-bound directory cleanup rejects inode, device, mode, and symlink replacement", async () => {
  const fixture = await protectedFixture();
  try {
    const existingDirectory = join(fixture.dir, "existing-directory"); await mkdir(existingDirectory, { mode: 0o700 }); await assert.rejects(createApprovedDirectory(existingDirectory, fixture.dir));
    const existingFile = join(fixture.dir, "existing-file"); await writeFile(existingFile, "existing", { mode: 0o600 }); await assert.rejects(createApprovedDirectory(existingFile, fixture.dir));
    const deviceOutput = join(fixture.dir, "device-output"), deviceRecord = await createApprovedDirectory(deviceOutput, fixture.dir);
    await assert.rejects(deleteValidatedDirectory({ ...deviceRecord, dev: deviceRecord.dev + 1 }, fixture.dir)); await assert.rejects(deleteValidatedDirectory({ ...deviceRecord, nlink: deviceRecord.nlink + 1 }, fixture.dir)); await sentinelUnchanged(fixture); await deleteValidatedDirectory(deviceRecord, fixture.dir);

    const replacedOutput = join(fixture.dir, "replaced-output"), movedOutput = join(fixture.dir, "moved-output"), replacedRecord = await createApprovedDirectory(replacedOutput, fixture.dir);
    await rename(replacedOutput, movedOutput); await mkdir(replacedOutput, { mode: 0o700 }); await assert.rejects(deleteValidatedDirectory(replacedRecord, fixture.dir)); await sentinelUnchanged(fixture); await removeTree(replacedOutput); await removeTree(movedOutput);

    const symlinkOutput = join(fixture.dir, "symlink-output"), savedOutput = join(fixture.dir, "saved-output"), symlinkRecord = await createApprovedDirectory(symlinkOutput, fixture.dir);
    await rename(symlinkOutput, savedOutput); await symlink(dirname(fixture.sentinel), symlinkOutput); await assert.rejects(deleteValidatedDirectory(symlinkRecord, fixture.dir)); await sentinelUnchanged(fixture); await unlink(symlinkOutput); await removeTree(savedOutput);

    const modeOutput = join(fixture.dir, "mode-output"), modeRecord = await createApprovedDirectory(modeOutput, fixture.dir);
    await chmod(modeOutput, 0o755); await assert.rejects(deleteValidatedDirectory(modeRecord, fixture.dir)); await sentinelUnchanged(fixture); await chmod(modeOutput, 0o700); await deleteValidatedDirectory(modeRecord, fixture.dir);
  } finally { await fixture.cleanup(); }
});

test("extraction and permission failures use identity-bound cleanup and preserve sentinel", async () => {
  const fixture = await protectedFixture();
  try {
    const archive = join(fixture.dir, "faults.tar"); await writeFile(archive, tarArchive([{ name: "nested/", type: "5" }, { name: "nested/data.dump", data: "safe-data" }]), { mode: 0o600 });
    for (const fault of ["extraction", "permissions"]) {
      const output = join(fixture.dir, `${fault}-output`), record = await createApprovedDirectory(output, fixture.dir);
      await assert.rejects(extractValidatedTar(archive, record, fixture.dir, { fault })); await assert.rejects(lstat(output)); await sentinelUnchanged(fixture);
    }
  } finally { await fixture.cleanup(); }
});

test("decrypt script rejects a valid encrypted symlink archive and cleans plaintext", async () => {
  const fixture = await protectedFixture();
  try {
    const archive = join(fixture.dir, "hostile.tar"), encrypted = join(fixture.dir, "hostile.tar.enc"), output = join(fixture.dir, "hostile-output");
    await writeFile(archive, tarArchive([{ name: "linked", type: "2", linkname: fixture.sentinel }]), { mode: 0o600 });
    await run("openssl", ["enc", "-aes-256-cbc", "-pbkdf2", "-iter", "600000", "-salt", "-in", archive, "-out", encrypted, "-pass", "env:BACKUP_ENCRYPTION_SECRET"], { env: { ...process.env, BACKUP_ENCRYPTION_SECRET: "synthetic-only-secret" } }); await chmod(encrypted, 0o600);
    await assert.rejects(run(join(root, "scripts/decrypt-backup.sh"), ["--input", encrypted, "--output-dir", output, "--working-dir", fixture.dir], { env: { ...process.env, BACKUP_ENCRYPTION_SECRET: "synthetic-only-secret" } }));
    await assert.rejects(lstat(output)); assert.equal((await readdir(fixture.dir)).some(name => name.startsWith(".decrypt.")), false); await sentinelUnchanged(fixture);
  } finally { await fixture.cleanup(); }
});
