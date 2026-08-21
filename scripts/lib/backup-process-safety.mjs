import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { lstat, mkdir, open, readFile, readdir, realpath, rmdir, unlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir, userInfo } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const NAMES = { backup: /^[A-Za-z0-9][A-Za-z0-9._-]*\.dump$/, manifest: /^[A-Za-z0-9][A-Za-z0-9._-]*\.dump\.manifest\.json$/, encrypted: /^[A-Za-z0-9][A-Za-z0-9._-]*\.tar\.enc$/ };
const SAFE_COMPONENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const TAR_BLOCK_SIZE = 512;
const uid = userInfo().uid;
function fail(message) { const error = new Error(`Backup safety validation failed: ${message}`); error.code = "BACKUP_SAFETY_FAILED"; throw error; }
function absoluteStable(value) { if (typeof value !== "string" || !value || !path.isAbsolute(value) || value.includes("\0") || path.normalize(value) !== value) fail("path is not absolute and canonical-looking"); return value; }
function isBroad(candidate) { const home = path.resolve(homedir()), temporary = path.resolve(tmpdir()); return candidate === "/" || candidate === home || candidate === "/tmp" || candidate === "/private/tmp" || candidate === temporary || candidate === REPOSITORY_ROOT || REPOSITORY_ROOT.startsWith(`${candidate}${path.sep}`) || path.basename(candidate) === "PawnLoop-Production-Backups"; }
async function rejectSymlinkComponents(candidate) {
  let checked = candidate;
  if (candidate.startsWith("/var/") && await realpath("/var") === "/private/var") checked = `/private${candidate}`;
  let current = path.parse(checked).root;
  for (const component of checked.slice(current.length).split(path.sep).filter(Boolean)) { current = path.join(current, component); const info = await lstat(current); if (info.isSymbolicLink()) fail("path contains a symbolic-link component"); }
  return checked;
}
function identity(canonical, info) { return { canonical, dev: info.dev, ino: info.ino, uid: info.uid, mode: info.mode & 0o777, nlink: info.nlink, type: info.isFile() ? "file" : info.isDirectory() ? "directory" : "other", size: info.size }; }
function assertSameIdentity(info, record, fields, message) { const current = identity(record.canonical, info); for (const field of fields) if (current[field] !== record[field]) fail(message); return current; }
async function approvedDirectoryIdentity(value) {
  const candidate = absoluteStable(value); if (isBroad(candidate)) fail("directory is a broad or protected root");
  const checked = await rejectSymlinkComponents(candidate), canonical = await realpath(checked); if (isBroad(canonical)) fail("directory resolves to a broad or protected root");
  const info = await lstat(canonical); if (!info.isDirectory() || info.uid !== uid || (info.mode & 0o777) !== 0o700) fail("directory ownership or mode is unsafe"); return identity(canonical, info);
}
export async function approvedDirectory(value) { return (await approvedDirectoryIdentity(value)).canonical; }
export async function approvedFile(value, root, { kind = "any" } = {}) {
  const candidate = absoluteStable(value), canonicalRoot = await approvedDirectory(root), checked = await rejectSymlinkComponents(candidate), canonical = await realpath(checked);
  if (path.dirname(canonical) !== canonicalRoot) fail("file is outside the approved root");
  if (kind !== "any" && !NAMES[kind]?.test(path.basename(canonical))) fail("file name is unsafe");
  const info = await lstat(canonical); if (!info.isFile() || info.uid !== uid || (info.mode & 0o777) !== 0o600 || info.nlink !== 1) fail("file ownership, mode, type, or link count is unsafe"); return identity(canonical, info);
}
export async function approvedOutput(value, root) {
  const candidate = absoluteStable(value), canonicalRoot = await approvedDirectory(root), parent = await approvedDirectory(path.dirname(candidate));
  if (parent !== canonicalRoot || !NAMES.encrypted.test(path.basename(candidate))) fail("output is outside approved root or has an unsafe name");
  const canonical = path.join(parent, path.basename(candidate)); try { await lstat(canonical); fail("output already exists"); } catch (error) { if (error.code !== "ENOENT") throw error; } return canonical;
}
function directoryLifecycleIdentity(canonical, info, root) {
  const record = identity(canonical, info);
  return { ...record, createdNlink: record.nlink, rootCanonical: root.canonical, rootDev: root.dev, rootIno: root.ino, rootUid: root.uid, rootMode: root.mode, rootType: root.type };
}
function compareRootIdentity(record, current) {
  const pairs = [["rootCanonical", "canonical"], ["rootDev", "dev"], ["rootIno", "ino"], ["rootUid", "uid"], ["rootMode", "mode"], ["rootType", "type"]];
  for (const [recordField, currentField] of pairs) if (record[recordField] !== current[currentField]) fail("approved root identity changed");
}
function assertDirectoryRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) fail("missing directory identity");
  for (const field of ["canonical", "dev", "ino", "uid", "mode", "nlink", "type", "createdNlink", "rootCanonical", "rootDev", "rootIno", "rootUid", "rootMode", "rootType"]) {
    if (record[field] === undefined) fail("directory identity is incomplete");
  }
  if (record.type !== "directory" || record.uid !== uid || record.mode !== 0o700 || record.rootType !== "directory" || record.rootUid !== uid || record.rootMode !== 0o700) fail("directory identity is unsafe");
  for (const field of ["dev", "ino", "nlink", "createdNlink", "rootDev", "rootIno"]) if (!Number.isInteger(record[field]) || record[field] < 1) fail("directory identity is invalid");
}
export async function createApprovedDirectory(value, root) {
  const candidate = absoluteStable(value), rootRecord = await approvedDirectoryIdentity(root), parentRecord = await approvedDirectoryIdentity(path.dirname(candidate));
  if (parentRecord.canonical !== rootRecord.canonical || parentRecord.dev !== rootRecord.dev || parentRecord.ino !== rootRecord.ino || !SAFE_COMPONENT.test(path.basename(candidate))) fail("new directory is outside the approved root or has an unsafe name");
  const canonical = path.join(parentRecord.canonical, path.basename(candidate));
  try { await mkdir(canonical, { mode: 0o700 }); } catch { fail("new directory could not be created atomically"); }
  let createdRecord;
  try {
    const createdInfo = await lstat(canonical);
    if (!createdInfo.isDirectory() || createdInfo.isSymbolicLink() || createdInfo.uid !== uid || (createdInfo.mode & 0o777) !== 0o700) fail("created directory identity is unsafe");
    createdRecord = directoryLifecycleIdentity(canonical, createdInfo, rootRecord);
    const checked = await rejectSymlinkComponents(canonical), resolved = await realpath(checked), info = await lstat(resolved), rootAfter = await approvedDirectoryIdentity(rootRecord.canonical);
    compareRootIdentity({ rootCanonical: rootRecord.canonical, rootDev: rootRecord.dev, rootIno: rootRecord.ino, rootUid: rootRecord.uid, rootMode: rootRecord.mode, rootType: rootRecord.type }, rootAfter);
    if (resolved !== canonical || path.dirname(resolved) !== rootRecord.canonical || !info.isDirectory() || info.uid !== uid || (info.mode & 0o777) !== 0o700) fail("created directory identity is unsafe");
    for (const field of ["dev", "ino", "uid", "mode", "nlink", "type"]) if (identity(resolved, info)[field] !== createdRecord[field]) fail("created directory identity changed");
    return createdRecord;
  } catch (error) {
    if (createdRecord) try { await deleteValidatedDirectory(createdRecord, rootRecord.canonical); } catch {}
    throw error;
  }
}
export async function validateDirectoryRecord(record, root, { allowLinkCountChange = false } = {}) {
  assertDirectoryRecord(record);
  const rootRecord = await approvedDirectoryIdentity(root); compareRootIdentity(record, rootRecord);
  const candidate = absoluteStable(record.canonical);
  if (path.dirname(candidate) !== rootRecord.canonical) fail("directory left the approved root");
  const checked = await rejectSymlinkComponents(candidate), canonical = await realpath(checked), info = await lstat(canonical), current = identity(canonical, info);
  if (!info.isDirectory() || info.isSymbolicLink()) fail("directory type changed");
  for (const field of ["canonical", "dev", "ino", "uid", "mode", "type"]) if (current[field] !== record[field]) fail("directory identity changed before cleanup");
  if (!allowLinkCountChange && current.nlink !== record.nlink) fail("directory link count changed before cleanup");
  return { ...record, nlink: current.nlink };
}
async function validateRootBinding(rootHandle, record, label = "cleanup") {
  const bound = assertSameIdentity(await rootHandle.stat(), record, ["dev", "ino", "uid", "mode", "type"], `${label} directory identity changed`), currentInfo = await lstat(record.canonical);
  const current = assertSameIdentity(currentInfo, record, ["dev", "ino", "uid", "mode", "type"], `${label} directory identity changed`);
  if (!currentInfo.isDirectory() || currentInfo.isSymbolicLink() || bound.nlink !== current.nlink) fail(`${label} directory link count changed unexpectedly`);
  return current;
}
async function removeTreeNoFollow(candidate, rootHandle, rootRecord) {
  await validateRootBinding(rootHandle, rootRecord); await rejectSymlinkComponents(path.dirname(candidate));
  const info = await lstat(candidate);
  if (info.isSymbolicLink() || !info.isDirectory()) {
    await validateRootBinding(rootHandle, rootRecord); const finalInfo = await lstat(candidate);
    if (finalInfo.dev !== info.dev || finalInfo.ino !== info.ino || finalInfo.isDirectory() !== info.isDirectory() || finalInfo.isSymbolicLink() !== info.isSymbolicLink()) fail("cleanup entry identity changed");
    await unlink(candidate); return;
  }
  if (info.uid !== uid || info.dev !== rootRecord.dev) fail("cleanup directory entry is unsafe");
  for (const entry of await readdir(candidate)) await removeTreeNoFollow(path.join(candidate, entry), rootHandle, rootRecord);
  await validateRootBinding(rootHandle, rootRecord); await rejectSymlinkComponents(path.dirname(candidate)); const finalInfo = await lstat(candidate);
  if (!finalInfo.isDirectory() || finalInfo.isSymbolicLink() || finalInfo.dev !== info.dev || finalInfo.ino !== info.ino || finalInfo.uid !== uid) fail("cleanup entry identity changed");
  await rmdir(candidate);
}
export async function deleteValidatedDirectory(record, root) {
  const current = await validateDirectoryRecord(record, root);
  const rootHandle = await open(current.canonical, constants.O_RDONLY | (constants.O_DIRECTORY || 0) | (constants.O_NOFOLLOW || 0));
  try {
    assertSameIdentity(await rootHandle.stat(), current, ["dev", "ino", "uid", "mode", "nlink", "type"], "cleanup directory identity changed");
    for (const entry of await readdir(current.canonical)) await removeTreeNoFollow(path.join(current.canonical, entry), rootHandle, current);
    const emptied = assertSameIdentity(await rootHandle.stat(), current, ["dev", "ino", "uid", "mode", "type"], "cleanup directory identity changed");
    if (emptied.nlink !== current.createdNlink) fail("cleanup directory link count is unsafe");
    const finalInfo = await lstat(current.canonical);
    assertSameIdentity(finalInfo, { ...current, nlink: current.createdNlink }, ["dev", "ino", "uid", "mode", "nlink", "type"], "cleanup directory identity changed");
    await rmdir(current.canonical);
  } finally { await rootHandle.close(); }
}
export async function deleteValidated(record, root) {
  if (!record || typeof record !== "object") fail("missing deletion identity"); const current = await approvedFile(record.canonical, root);
  for (const field of ["canonical", "dev", "ino", "uid", "mode", "nlink", "type"]) if (current[field] !== record[field]) fail("file identity changed before cleanup"); await unlink(current.canonical);
}

function tarString(header, start, length, label) {
  const field = header.subarray(start, start + length), nul = field.indexOf(0), end = nul === -1 ? field.length : nul;
  if (nul !== -1 && field.subarray(nul).some(byte => byte !== 0)) fail(`${label} is ambiguous`);
  const value = field.subarray(0, end); if (value.some(byte => byte < 0x20 || byte > 0x7e)) fail(`${label} is not safe ASCII`); return value.toString("ascii");
}
function tarOctal(header, start, length, label) {
  const raw = header.subarray(start, start + length); if (raw[0] & 0x80) fail(`${label} uses an unsupported number encoding`);
  const value = raw.toString("ascii").replace(/[\0 ]+$/g, "").trim(); if (!value) return 0;
  if (!/^[0-7]+$/.test(value)) fail(`${label} is malformed`); const number = Number.parseInt(value, 8); if (!Number.isSafeInteger(number) || number < 0) fail(`${label} is unsafe`); return number;
}
function safeArchivePath(rawName, type) {
  if (!rawName || rawName.includes("\\") || rawName.startsWith("/") || /^[A-Za-z]:/.test(rawName)) fail("archive member path is unsafe");
  const withoutSlash = type === "directory" && rawName.endsWith("/") ? rawName.slice(0, -1) : rawName;
  if (!withoutSlash || (type === "file" && rawName.endsWith("/")) || withoutSlash.endsWith("/")) fail("archive member path is ambiguous");
  const components = withoutSlash.split("/");
  if (components.some(component => !component || component === "." || component === ".." || !SAFE_COMPONENT.test(component))) fail("archive member path is unsafe");
  const normalized = path.posix.normalize(withoutSlash);
  if (normalized !== withoutSlash || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) fail("archive member escapes the output root");
  return normalized;
}
async function readBlock(handle, position) {
  const block = Buffer.alloc(TAR_BLOCK_SIZE); const { bytesRead } = await handle.read(block, 0, block.length, position); return { block, bytesRead };
}
async function remainingBytesAreZero(handle, position, size) {
  const buffer = Buffer.alloc(64 * 1024);
  while (position < size) { const length = Math.min(buffer.length, size - position), { bytesRead } = await handle.read(buffer, 0, length, position); if (bytesRead !== length || buffer.subarray(0, bytesRead).some(byte => byte !== 0)) return false; position += bytesRead; }
  return true;
}
async function digestArchiveRange(handle, start, size) {
  const hash = createHash("sha256"), buffer = Buffer.alloc(64 * 1024); let offset = 0;
  while (offset < size) { const length = Math.min(buffer.length, size - offset), { bytesRead } = await handle.read(buffer, 0, length, start + offset); if (bytesRead !== length) fail("archive member data is truncated"); hash.update(buffer.subarray(0, bytesRead)); offset += bytesRead; }
  return hash.digest("hex");
}
async function preflightTarHandle(handle) {
    const archiveInfo = await handle.stat(); if (!archiveInfo.isFile() || archiveInfo.size < TAR_BLOCK_SIZE * 3 || archiveInfo.size % TAR_BLOCK_SIZE !== 0) fail("archive size is invalid");
    const entries = [], paths = new Map(), foldedPaths = new Set(); let position = 0; let zeroBlocks = 0;
    while (position < archiveInfo.size) {
      const { block: header, bytesRead } = await readBlock(handle, position); if (bytesRead !== TAR_BLOCK_SIZE) fail("archive header is truncated");
      if (header.every(byte => byte === 0)) { zeroBlocks += 1; position += TAR_BLOCK_SIZE; if (zeroBlocks === 2) break; continue; }
      if (zeroBlocks !== 0) fail("archive has an ambiguous terminator");
      const storedChecksum = tarOctal(header, 148, 8, "archive checksum"), checksumHeader = Buffer.from(header); checksumHeader.fill(0x20, 148, 156);
      const checksum = checksumHeader.reduce((sum, byte) => sum + byte, 0); if (storedChecksum !== checksum) fail("archive header checksum is invalid");
      if (header.subarray(257, 263).toString("binary") !== "ustar\0" || header.subarray(263, 265).toString("ascii") !== "00") fail("archive format is unsupported");
      const name = tarString(header, 0, 100, "archive member name"), prefix = tarString(header, 345, 155, "archive member prefix"), rawName = prefix ? `${prefix}/${name}` : name;
      const typeByte = header[156], type = typeByte === 0 || typeByte === 0x30 ? "file" : typeByte === 0x35 ? "directory" : "unsupported";
      if (type === "unsupported") fail("archive member type is unsupported");
      if (tarString(header, 157, 100, "archive link target")) fail("archive links are not supported");
      const size = tarOctal(header, 124, 12, "archive member size"); if (type === "directory" && size !== 0) fail("archive directory size is invalid");
      const memberPath = safeArchivePath(rawName, type), folded = memberPath.toLowerCase();
      if (paths.has(memberPath) || foldedPaths.has(folded)) fail("archive member path is duplicated or conflicting");
      const dataOffset = position + TAR_BLOCK_SIZE, paddedSize = Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE, next = dataOffset + paddedSize;
      if (!Number.isSafeInteger(next) || next > archiveInfo.size) fail("archive member data is truncated");
      const entry = { path: memberPath, type, size, dataOffset, digest: type === "file" ? await digestArchiveRange(handle, dataOffset, size) : undefined }; entries.push(entry); paths.set(memberPath, entry); foldedPaths.add(folded); position = next;
    }
    if (zeroBlocks !== 2 || !entries.length || !await remainingBytesAreZero(handle, position, archiveInfo.size)) fail("archive terminator is invalid");
    for (const entry of entries) {
      const components = entry.path.split("/");
      for (let index = 1; index < components.length; index += 1) {
        const ancestor = components.slice(0, index).join("/"); if (paths.get(ancestor)?.type !== "directory") fail("archive member ancestor is not a directory");
      }
    }
    return entries;
}
export async function preflightTarArchive(archive) {
  const handle = await open(archive, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    return await preflightTarHandle(handle);
  } finally { await handle.close(); }
}
async function copyArchiveMember(archiveHandle, outputHandle, start, size, expectedDigest) {
  const hash = createHash("sha256"), buffer = Buffer.alloc(64 * 1024); let offset = 0;
  while (offset < size) { const length = Math.min(buffer.length, size - offset), { bytesRead } = await archiveHandle.read(buffer, 0, length, start + offset); if (bytesRead !== length) fail("archive member data changed during extraction"); hash.update(buffer.subarray(0, bytesRead)); let written = 0; while (written < bytesRead) { const result = await outputHandle.write(buffer, written, bytesRead - written); if (result.bytesWritten < 1) fail("archive member could not be written completely"); written += result.bytesWritten; } offset += bytesRead; }
  if (hash.digest("hex") !== expectedDigest) fail("archive member data changed after preflight");
}
async function validatedOutputParent(rootHandle, rootRecord, memberPath) {
  const components = memberPath.split("/"); components.pop(); let current = rootRecord.canonical;
  for (const component of components) {
    await validateRootBinding(rootHandle, rootRecord, "output"); current = path.join(current, component); const info = await lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== uid || info.dev !== rootRecord.dev) fail("output ancestor identity is unsafe");
  }
  return current;
}
async function inspectExtractedTree(rootHandle, rootRecord, prefix = "", found = new Map()) {
  const directory = prefix ? path.join(rootRecord.canonical, ...prefix.split("/")) : rootRecord.canonical;
  await validateRootBinding(rootHandle, rootRecord, "output");
  for (const name of await readdir(directory)) {
    const relative = prefix ? `${prefix}/${name}` : name, candidate = path.join(directory, name); await validateRootBinding(rootHandle, rootRecord, "output"); await rejectSymlinkComponents(path.dirname(candidate));
    const info = await lstat(candidate), type = info.isDirectory() ? "directory" : info.isFile() ? "file" : "other";
    if (info.isSymbolicLink() || type === "other" || info.uid !== uid || info.dev !== rootRecord.dev || (type === "file" && info.nlink !== 1)) fail("extracted entry identity is unsafe");
    found.set(relative, { absolute: candidate, info, type });
    if (type === "directory") await inspectExtractedTree(rootHandle, rootRecord, relative, found);
  }
  return found;
}
async function applyValidatedMode(rootHandle, memberPath, entry, expected, rootRecord) {
  const parent = await validatedOutputParent(rootHandle, rootRecord, memberPath), candidate = path.join(parent, path.basename(memberPath)); await validateRootBinding(rootHandle, rootRecord, "output");
  const before = await lstat(candidate); if (before.dev !== entry.info.dev || before.ino !== entry.info.ino || before.isSymbolicLink()) fail("extracted entry identity changed");
  const flags = constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (expected.type === "directory" ? (constants.O_DIRECTORY || 0) : 0), handle = await open(candidate, flags);
  try {
    const current = await handle.stat();
    if (current.dev !== entry.info.dev || current.ino !== entry.info.ino || current.uid !== uid || current.dev !== rootRecord.dev || (expected.type === "file" ? !current.isFile() || current.nlink !== 1 || current.size !== expected.size : !current.isDirectory())) fail("extracted entry identity changed");
    await validateRootBinding(rootHandle, rootRecord, "output"); await handle.chmod(expected.type === "directory" ? 0o700 : 0o600);
  } finally { await handle.close(); }
}
async function refreshDirectoryRecord(record, root) { return validateDirectoryRecord(record, root, { allowLinkCountChange: true }); }
export async function extractValidatedTar(archive, directoryRecord, root, { fault, beforeExtraction } = {}) {
  let currentRecord = directoryRecord;
  try {
    const archiveHandle = await open(archive, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const entries = await preflightTarHandle(archiveHandle);
      if (beforeExtraction !== undefined) { if (typeof beforeExtraction !== "function") fail("archive extraction hook is invalid"); await beforeExtraction(entries); }
      currentRecord = await validateDirectoryRecord(directoryRecord, root);
      const rootHandle = await open(currentRecord.canonical, constants.O_RDONLY | (constants.O_DIRECTORY || 0) | (constants.O_NOFOLLOW || 0));
      try {
        assertSameIdentity(await rootHandle.stat(), currentRecord, ["dev", "ino", "uid", "mode", "nlink", "type"], "output directory identity changed");
        let extracted = 0;
        for (const entry of entries.filter(item => item.type === "directory").sort((a, b) => a.path.split("/").length - b.path.split("/").length)) {
          const parent = await validatedOutputParent(rootHandle, currentRecord, entry.path), destination = path.join(parent, path.basename(entry.path)); await mkdir(destination, { mode: 0o700 }); const info = await lstat(destination);
          if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== uid || info.dev !== currentRecord.dev || (info.mode & 0o777) !== 0o700) fail("created archive directory identity is unsafe");
          extracted += 1; if (fault === "extraction" && extracted === 1) fail("synthetic extraction failure");
        }
        for (const entry of entries.filter(item => item.type === "file")) {
          const parent = await validatedOutputParent(rootHandle, currentRecord, entry.path), destination = path.join(parent, path.basename(entry.path)), output = await open(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), 0o600);
          try { await copyArchiveMember(archiveHandle, output, entry.dataOffset, entry.size, entry.digest); } finally { await output.close(); }
          extracted += 1; if (fault === "extraction" && extracted === 1) fail("synthetic extraction failure");
        }
        currentRecord = await refreshDirectoryRecord(currentRecord, root);
        assertSameIdentity(await rootHandle.stat(), currentRecord, ["dev", "ino", "uid", "mode", "nlink", "type"], "output directory identity changed");
        const found = await inspectExtractedTree(rootHandle, currentRecord), expected = new Map(entries.map(entry => [entry.path, entry]));
        if (found.size !== expected.size) fail("extracted tree contains unexpected entries");
        if (fault === "permissions") fail("synthetic permission failure");
        for (const [memberPath, expectedEntry] of expected) { const actual = found.get(memberPath); if (!actual || actual.type !== expectedEntry.type) fail("extracted tree does not match the archive preflight"); await applyValidatedMode(rootHandle, memberPath, actual, expectedEntry, currentRecord); }
        await rootHandle.chmod(0o700);
        return { directory: await refreshDirectoryRecord(currentRecord, root), entries: entries.map(({ path: memberPath, type, size }) => ({ path: memberPath, type, size })) };
      } finally { await rootHandle.close(); }
    } finally { await archiveHandle.close(); }
  } catch (error) {
    try { currentRecord = await refreshDirectoryRecord(currentRecord, root); await deleteValidatedDirectory(currentRecord, root); } catch { fail("archive processing failed and identity-bound cleanup was refused"); }
    throw error;
  }
}

export function assertSafeServiceValue(value, label) { if (typeof value !== "string" || !value || /[\0\r\n]/.test(value)) fail(`${label} is invalid`); return value; }
export async function writeLibpqService({ envFile, root, service = "pawnloop-backup" }) {
  const dir = await approvedDirectory(root), envText = await readFile(envFile, "utf8"), values = Object.fromEntries(envText.split(/\n/).filter(Boolean).map(line => { const i = line.indexOf("="); if (i < 1) fail("environment file is malformed"); return [line.slice(0, i), line.slice(i + 1)]; }));
  let parsed; try { parsed = new URL(assertSafeServiceValue(values.DATABASE_URL, "DATABASE_URL")); } catch { fail("DATABASE_URL is invalid"); }
  if (!["postgresql:", "postgres:"].includes(parsed.protocol) || !parsed.hostname || !parsed.username || !parsed.password || !parsed.pathname.slice(1)) fail("DATABASE_URL is incomplete");
  const servicePath = path.join(dir, `.pg_service_${process.pid}`), lines = [`[${service}]`, `host=${assertSafeServiceValue(parsed.hostname, "host")}`, `port=${parsed.port || "5432"}`, `dbname=${assertSafeServiceValue(decodeURIComponent(parsed.pathname.slice(1)), "database")}`, `user=${assertSafeServiceValue(decodeURIComponent(parsed.username), "user")}`, `password=${assertSafeServiceValue(decodeURIComponent(parsed.password), "password")}`];
  for (const [key, value] of parsed.searchParams) if (!["sslmode", "channel_binding", "schema"].includes(key)) fail("unsupported connection parameter"); else if (key !== "schema") lines.push(`${key}=${assertSafeServiceValue(value, key)}`);
  await writeFile(servicePath, `${lines.join("\n")}\n`, { mode: 0o600, flag: "wx" }); return { servicePath, service };
}
if (process.argv[1] && process.argv[1].endsWith("backup-process-safety.mjs")) {
  const [command, value, root, extra] = process.argv.slice(2);
  try {
    if (command === "dir") process.stdout.write(await approvedDirectory(value));
    else if (command === "file") process.stdout.write(JSON.stringify(await approvedFile(value, root, { kind: extra || "any" })));
    else if (command === "output") process.stdout.write(await approvedOutput(value, root));
    else if (command === "create-directory") process.stdout.write(JSON.stringify(await createApprovedDirectory(value, root)));
    else if (command === "delete-directory") await deleteValidatedDirectory(JSON.parse(value), root);
    else if (command === "extract-archive") process.stdout.write(JSON.stringify(await extractValidatedTar(value, JSON.parse(extra), root)));
    else if (command === "delete") await deleteValidated(JSON.parse(value), root);
    else if (command === "service") { const result = await writeLibpqService({ envFile: value, root }); process.stdout.write(`${result.servicePath}\n`); }
    else fail("unsupported safety command");
  } catch { process.stderr.write("Backup safety validation failed.\n"); process.exitCode = 1; }
}
