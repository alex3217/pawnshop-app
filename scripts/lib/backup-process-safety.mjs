import { lstat, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { realpath } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import path from "node:path";
import { URL } from "node:url";

function fail(message) { throw new Error(`Backup safety validation failed: ${message}`); }
function absolute(value) { if (typeof value !== "string" || !path.isAbsolute(value) || value.includes("\0")) fail("path is not absolute"); return path.normalize(value); }
export async function approvedDirectory(value, { create = false } = {}) {
  const candidate = absolute(value); if (["/", "/tmp", "/private/tmp", homedir()].includes(candidate)) fail("directory is not an approved protected root");
  if (create) await mkdir(candidate, { recursive: true, mode: 0o700 });
  const info = await lstat(candidate); if (!info.isDirectory() || info.uid !== userInfo().uid || (info.mode & 0o777) !== 0o700) fail("directory ownership or mode is unsafe");
  const canonical = await realpath(candidate); if (["/", "/tmp", "/private/tmp", homedir()].includes(canonical)) fail("directory canonicalization is unsafe");
  return canonical;
}
export async function approvedFile(value, root, { pattern } = {}) {
  const candidate = absolute(value); const canonicalRoot = await approvedDirectory(root); const raw = await lstat(candidate); if (raw.isSymbolicLink()) fail("file is a symbolic link"); const canonical = await realpath(candidate);
  if (path.dirname(canonical) !== canonicalRoot || (pattern && !pattern.test(path.basename(canonical)))) fail("file is outside the approved root");
  const info = await lstat(canonical); if (!info.isFile() || info.uid !== userInfo().uid || (info.mode & 0o777) !== 0o600) fail("file ownership or mode is unsafe");
  return canonical;
}
export function assertSafeServiceValue(value, label) { if (typeof value !== "string" || !value || /[\0\r\n]/.test(value)) fail(`${label} is invalid`); return value; }
export async function writeLibpqService({ envFile, root, service = "pawnloop_backup" }) {
  const dir = await approvedDirectory(root); const envText = await readFile(envFile, "utf8"); const values = Object.fromEntries(envText.split(/\n/).filter(Boolean).map(line => { const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1)]; }));
  let parsed; try { parsed = new URL(assertSafeServiceValue(values.DATABASE_URL, "DATABASE_URL")); } catch { fail("DATABASE_URL is invalid"); }
  if (!["postgresql:", "postgres:"].includes(parsed.protocol) || !parsed.hostname || !parsed.username || !parsed.password || !parsed.pathname.slice(1)) fail("DATABASE_URL is incomplete");
  const servicePath = path.join(dir, `.pg_service_${process.pid}`); const lines = [`[${service}]`, `host=${assertSafeServiceValue(parsed.hostname, "host")}`, `port=${parsed.port || "5432"}`, `dbname=${assertSafeServiceValue(decodeURIComponent(parsed.pathname.slice(1)), "database")}`, `user=${assertSafeServiceValue(decodeURIComponent(parsed.username), "user")}`, `password=${assertSafeServiceValue(decodeURIComponent(parsed.password), "password")}`];
  for (const [key, value] of parsed.searchParams) if (!["sslmode", "channel_binding", "schema"].includes(key)) fail("unsupported connection parameter"); else if (key !== "schema") lines.push(`${key}=${assertSafeServiceValue(value, key)}`);
  await writeFile(servicePath, `${lines.join("\n")}\n`, { mode: 0o600, flag: "wx" }); return { servicePath, service };
}
export async function removeProtectedFile(file, root) { const canonical = await approvedFile(file, root); await (await import("node:fs/promises")).unlink(canonical); }
if (process.argv[1] && process.argv[1].endsWith("backup-process-safety.mjs")) {
  const [command, value, root] = process.argv.slice(2);
  try { if (command === "dir") process.stdout.write(await approvedDirectory(value, { create: true })); else if (command === "file") process.stdout.write(await approvedFile(value, root)); else if (command === "service") { const result = await writeLibpqService({ envFile: value, root }); process.stdout.write(`${result.servicePath}\n`); } else fail("unsupported safety command"); }
  catch (error) { process.stderr.write("Backup safety validation failed.\n"); process.exitCode = 1; }
}
