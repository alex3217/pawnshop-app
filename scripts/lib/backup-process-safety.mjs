import { lstat, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir, userInfo } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const NAMES = { backup: /^[A-Za-z0-9][A-Za-z0-9._-]*\.dump$/, manifest: /^[A-Za-z0-9][A-Za-z0-9._-]*\.dump\.manifest\.json$/, encrypted: /^[A-Za-z0-9][A-Za-z0-9._-]*\.tar\.enc$/ };
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
export async function approvedDirectory(value) {
  const candidate = absoluteStable(value); if (isBroad(candidate)) fail("directory is a broad or protected root");
  const checked = await rejectSymlinkComponents(candidate), canonical = await realpath(checked); if (isBroad(canonical)) fail("directory resolves to a broad or protected root");
  const info = await lstat(canonical); if (!info.isDirectory() || info.uid !== uid || (info.mode & 0o777) !== 0o700) fail("directory ownership or mode is unsafe"); return canonical;
}
function identity(canonical, info) { return { canonical, dev: info.dev, ino: info.ino, uid: info.uid, mode: info.mode & 0o777, nlink: info.nlink, type: info.isFile() ? "file" : "other", size: info.size }; }
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
export async function approvedNewDirectory(value, root) {
  const candidate = absoluteStable(value), canonicalRoot = await approvedDirectory(root), parent = await approvedDirectory(path.dirname(candidate));
  if (parent !== canonicalRoot || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(path.basename(candidate))) fail("new directory is outside approved root or has an unsafe name");
  const canonical = path.join(parent, path.basename(candidate)); try { await lstat(canonical); fail("new directory already exists"); } catch (error) { if (error.code !== "ENOENT") throw error; } return canonical;
}
export async function deleteValidated(record, root) {
  if (!record || typeof record !== "object") fail("missing deletion identity"); const current = await approvedFile(record.canonical, root);
  for (const field of ["canonical", "dev", "ino", "uid", "mode", "nlink", "type"]) if (current[field] !== record[field]) fail("file identity changed before cleanup"); await unlink(current.canonical);
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
    else if (command === "new-directory") process.stdout.write(await approvedNewDirectory(value, root));
    else if (command === "delete") await deleteValidated(JSON.parse(value), root);
    else if (command === "service") { const result = await writeLibpqService({ envFile: value, root }); process.stdout.write(`${result.servicePath}\n`); }
    else fail("unsupported safety command");
  } catch { process.stderr.write("Backup safety validation failed.\n"); process.exitCode = 1; }
}
