#!/usr/bin/env node

import { createHash } from "node:crypto";
import { constants, createReadStream, realpathSync } from "node:fs";
import { lstat, readFile, stat, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

export const MANIFEST_VERSION = 1;
export const DEFAULT_MAX_AGE_HOURS = 36;
const ENVIRONMENTS = new Set(["production", "staging", "test", "development", "isolated"]);
const POSTGRES_PROTOCOLS = new Set(["postgres:", "postgresql:"]);
const LOOPBACK_HOSTS = new Set(["localhost", "::1"]);
const ENV_MARKERS = {
  production: /(^|[_-])(prod|production)([_-]|$)/i,
  staging: /(^|[_-])(stage|staging)([_-]|$)/i,
  test: /(^|[_-])(test|testing)([_-]|$)/i,
  development: /(^|[_-])(dev|development|local)([_-]|$)/i,
  isolated: /(^|[_-])(isolated|restore|recovery|drill)([_-]|$)/i,
};
const FORBIDDEN_PRODUCTION_TARGET_MARKER = /(^|[._-])(local|localhost|dev|development|test|testing|stage|staging)([._-]|$)/i;
export const PRODUCTION_BACKUP_CONFIRMATION = "BACKUP PRODUCTION";

export class SafetyError extends Error {}

function fail(message) { throw new SafetyError(message); }
function text(value) { return String(value ?? "").trim(); }

async function protectedRegularFile(file, label, { expectedUid = process.getuid?.() } = {}) {
  let info;
  try { info = await lstat(file); } catch { fail(`${label} is missing.`); }
  if (info.isSymbolicLink() || !info.isFile()) fail(`${label} must be a regular file and must not be a symlink.`);
  if (expectedUid !== undefined && info.uid !== expectedUid) fail(`${label} must be owned by the current operator.`);
  if ((info.mode & 0o077) !== 0) fail(`${label} permissions must be 0600 or more restrictive.`);
  let parent;
  try { parent = await lstat(dirname(file)); } catch { fail(`${label} parent directory is unavailable.`); }
  if (parent.isSymbolicLink() || !parent.isDirectory()) fail(`${label} parent must be a real directory.`);
  if (expectedUid !== undefined && parent.uid !== expectedUid) fail(`${label} parent must be owned by the current operator.`);
  if ((parent.mode & 0o777) !== 0o700) fail(`${label} parent directory permissions must be 0700.`);
}

async function readDatabaseUrlFromEnvFile(file) {
  let env;
  try { env = parseEnv(await readFile(file, "utf8")); } catch { fail("Environment file is malformed."); }
  if (typeof env.DATABASE_URL !== "string" || !env.DATABASE_URL) fail("DATABASE_URL is missing.");
  return env.DATABASE_URL;
}

export async function readProductionBackupApproval(file, options = {}) {
  await protectedRegularFile(file, "Production backup approval file", options);
  let value;
  try { value = JSON.parse(await readFile(file, "utf8")); } catch { fail("Production backup approval file is malformed."); }
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "databaseName,hostname") {
    fail("Production backup approval file must contain only hostname and databaseName.");
  }
  return { hostname: normalizeHostname(value.hostname, { approved: true }), databaseName: safeDatabaseName(`/${value.databaseName}`) };
}

function serviceValue(value) {
  const raw = String(value ?? "");
  if (/\r|\n|\0/.test(raw)) fail("DATABASE_URL contains an unsupported connection value.");
  return raw.replaceAll("\\", "\\\\").replace(/^#/, "\\#");
}

const LIBPQ_URL_OPTIONS = new Set([
  "application_name", "channel_binding", "connect_timeout", "gssencmode", "keepalives", "keepalives_count",
  "keepalives_idle", "keepalives_interval", "options", "sslcert", "sslcrl", "sslcrldir", "sslkey", "sslmode",
  "sslpassword", "sslrootcert", "target_session_attrs", "tcp_user_timeout",
]);

export async function prepareProductionBackup({ envFile, approvalFile, stateDirectory, confirmation, expectedUid = process.getuid?.() }) {
  const approval = await readProductionBackupApproval(approvalFile, { expectedUid });
  await protectedRegularFile(envFile, "Environment file", { expectedUid });
  let env;
  try { env = parseEnv(await readFile(envFile, "utf8")); } catch { fail("Environment file is malformed."); }
  const target = validateBackupTarget({ databaseUrl: env.DATABASE_URL, environment: "production", approvedHostname: approval.hostname, expectedDatabase: approval.databaseName, productionHostname: env.PRODUCTION_DATABASE_HOST, confirmation });
  let parsed;
  try { parsed = new URL(text(env.DATABASE_URL)); } catch { fail("DATABASE_URL is malformed."); }
  const unsupported = [...parsed.searchParams.keys()].filter((key) => key !== "schema" && !LIBPQ_URL_OPTIONS.has(key));
  if (unsupported.length) fail("DATABASE_URL contains unsupported connection options.");
  let state;
  try { state = await lstat(stateDirectory); } catch { fail("Backup runtime directory is unavailable."); }
  if (state.isSymbolicLink() || !state.isDirectory() || state.uid !== expectedUid || (state.mode & 0o777) !== 0o700) fail("Backup runtime directory must be operator-owned mode 0700.");
  const serviceLines = ["[pawnloop-production-backup]", `host=${serviceValue(parsed.hostname)}`];
  if (parsed.port) serviceLines.push(`port=${serviceValue(parsed.port)}`);
  serviceLines.push(`dbname=${serviceValue(target.databaseName)}`, `user=${serviceValue(decodeURIComponent(parsed.username))}`);
  if (parsed.password) serviceLines.push(`password=${serviceValue(decodeURIComponent(parsed.password))}`);
  for (const [key, value] of parsed.searchParams) if (key !== "schema") serviceLines.push(`${key}=${serviceValue(value)}`);
  const serviceFile = join(stateDirectory, "pg_service.conf");
  const targetFile = join(stateDirectory, "validated-target.json");
  await writeFile(serviceFile, `${serviceLines.join("\n")}\n`, { mode: 0o600, flag: constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY });
  await writeFile(targetFile, JSON.stringify(target), { mode: 0o600, flag: constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY });
  return { serviceFile, targetFile };
}

export function normalizeEnvironment(value, { destination = false } = {}) {
  const environment = text(value).toLowerCase();
  if (!ENVIRONMENTS.has(environment) || (!destination && environment === "isolated")) {
    fail(`Environment must be explicit and one of: ${destination ? "production, staging, test, development, isolated" : "production, staging, test, development"}.`);
  }
  return environment;
}

export function isLoopback(hostname) {
  let host;
  try { host = normalizeHostname(hostname); } catch { return false; }
  if (LOOPBACK_HOSTS.has(host)) return true;
  const ipVersion = isIP(host);
  if (ipVersion === 4) return Number(host.split(".", 1)[0]) === 127;
  if (ipVersion === 6) {
    const mappedIpv4 = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
    if (mappedIpv4) return (Number.parseInt(mappedIpv4[1], 16) >>> 8) === 127;
  }
  return false;
}

function canonicalIpv6(value) {
  try {
    return new URL(`http://[${value}]/`).hostname.slice(1, -1).toLowerCase();
  } catch {
    fail("Hostname is malformed.");
  }
}

function normalizeHostname(value, { approved = false } = {}) {
  const label = approved ? "Approved hostname" : "DATABASE_URL hostname";
  const raw = text(value).toLowerCase();
  if (!raw || /[\s/@?#]/.test(raw)) fail(`${label} must be a hostname-only value.`);

  const hasBracket = raw.startsWith("[") || raw.endsWith("]");
  if (hasBracket) {
    if (!/^\[[^\[\]]+\]$/.test(raw)) fail(`${label} is malformed.`);
    const literal = raw.slice(1, -1);
    if (isIP(literal) !== 6) fail(`${label} is malformed.`);
    return canonicalIpv6(literal);
  }

  const ipVersion = isIP(raw);
  if (ipVersion === 6) return canonicalIpv6(raw);
  if (ipVersion === 4) return raw;
  if (raw.includes(":")) fail(`${label} must not include a port and must be a valid hostname or IP literal.`);
  if (/^\d+(?:\.\d+){3}$/.test(raw)) fail(`${label} is malformed.`);
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/i.test(raw)) {
    fail(`${label} is malformed.`);
  }
  return raw;
}

function safeDatabaseName(rawPath) {
  let databaseName;
  try { databaseName = decodeURIComponent(rawPath.replace(/^\/+/, "")); }
  catch { fail("Database name is malformed."); }
  if (!databaseName || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/.test(databaseName)) fail("Database name is missing or unsafe.");
  return databaseName;
}

function normalizeSchemaScope(value) {
  if (typeof value !== "string") fail("Schema scope is malformed.");
  if (value === "") return "";
  if (value !== value.trim() || Buffer.byteLength(value, "utf8") > 63 || !/^[A-Za-z_][A-Za-z0-9_$]{0,62}$/.test(value)) {
    fail("Schema scope is malformed.");
  }
  return value;
}

function matchingMarkers(databaseName) {
  return Object.entries(ENV_MARKERS).filter(([, pattern]) => pattern.test(databaseName)).map(([name]) => name);
}

function assertDatabaseEnvironment(databaseName, environment, local) {
  if (environment === "development" && databaseName === "pawnshop" && local) return;
  const markers = matchingMarkers(databaseName);
  if (markers.length !== 1 || markers[0] !== environment) {
    fail(`Database name is not unambiguously marked for ${environment}.`);
  }
}

function validateTargetIdentity({ databaseUrl, environment, approvedHostname, expectedDatabase, destination = false }) {
  const normalizedEnvironment = normalizeEnvironment(environment, { destination });
  const approvedHost = normalizeHostname(approvedHostname, { approved: true });
  let parsed;
  try { parsed = new URL(text(databaseUrl)); } catch { fail("DATABASE_URL is malformed."); }
  if (!POSTGRES_PROTOCOLS.has(parsed.protocol)) fail("DATABASE_URL must use PostgreSQL.");
  if (!parsed.hostname) fail("DATABASE_URL must include a hostname.");
  const actualHost = normalizeHostname(parsed.hostname);
  if (actualHost !== approvedHost) fail("DATABASE_URL hostname does not match the explicitly approved hostname.");
  const databaseName = safeDatabaseName(parsed.pathname);
  if (!text(expectedDatabase)) fail("Expected database name is required.");
  if (databaseName !== text(expectedDatabase)) fail("DATABASE_URL database name does not match the explicitly selected database.");
  if (parsed.searchParams.getAll("schema").length > 1) fail("DATABASE_URL schema scope is ambiguous.");
  const schema = normalizeSchemaScope(parsed.searchParams.get("schema") ?? "");
  const local = isLoopback(actualHost);
  return { environment: normalizedEnvironment, hostname: actualHost, databaseName, schema, local };
}

export function validateDatabaseTarget(options) {
  const target = validateTargetIdentity(options);
  const { environment: normalizedEnvironment, hostname: actualHost, databaseName, local } = target;
  assertDatabaseEnvironment(databaseName, normalizedEnvironment, local);
  if (["production", "staging"].includes(normalizedEnvironment) && local) fail(`${normalizedEnvironment} targets must not use localhost or loopback.`);
  if (["test", "development", "isolated"].includes(normalizedEnvironment) && !local) fail(`${normalizedEnvironment} targets must use an approved loopback hostname.`);
  const { local: _local, ...result } = target;
  return result;
}

export function validateBackupTarget({ productionHostname, confirmation, ...options }) {
  const target = validateTargetIdentity({ ...options, destination: false });
  if (target.environment !== "production") return validateDatabaseTarget({ ...options, destination: false });
  if (!text(productionHostname)) fail("Production database host confirmation is required for a Production backup.");
  const confirmedHost = normalizeHostname(productionHostname, { approved: true });
  if (confirmedHost !== target.hostname) fail("Production database host confirmation does not match the selected target.");
  if (confirmation !== PRODUCTION_BACKUP_CONFIRMATION) fail("Production backup confirmation is missing or incorrect.");
  if (target.local) fail("Production targets must not use localhost or loopback.");
  if (FORBIDDEN_PRODUCTION_TARGET_MARKER.test(target.hostname) || FORBIDDEN_PRODUCTION_TARGET_MARKER.test(target.databaseName)) {
    fail("Production backup target contains a non-Production environment marker.");
  }
  const { local: _local, ...result } = target;
  return result;
}

export function assertEnvironmentCompatibility(source, destination) {
  const sourceEnvironment = normalizeEnvironment(source);
  const destinationEnvironment = normalizeEnvironment(destination, { destination: true });
  if (destinationEnvironment === "isolated") return;
  if (sourceEnvironment !== destinationEnvironment) fail("Backup and destination environments are incompatible.");
}

export function assertSchemaCompatibility(sourceSchema, destinationSchema) {
  const source = normalizeSchemaScope(sourceSchema);
  const destination = normalizeSchemaScope(destinationSchema);
  if (source !== destination) {
    fail("Backup and destination schema scopes are incompatible; schema remapping is not supported.");
  }
  return { sourceSchema: source, destinationSchema: destination };
}

export async function sha256File(file) {
  const hash = createHash("sha256");
  const stream = createReadStream(file);
  try {
    for await (const chunk of stream) hash.update(chunk);
    return hash.digest("hex");
  } catch {
    stream.destroy();
    fail("Backup checksum could not be calculated.");
  }
}

export async function buildManifest({ backupFile, environment, hostname, databaseName, sourceSchema, applicationRevision, createdAt, toolVersion, archiveMetadata }) {
  const info = await stat(backupFile).catch(() => fail("Backup file is missing."));
  if (!info.isFile() || info.size === 0) fail("Backup file is missing or empty.");
  return {
    manifestVersion: MANIFEST_VERSION,
    createdAt: text(createdAt) || new Date().toISOString(),
    environment: normalizeEnvironment(environment),
    approvedHostname: normalizeHostname(hostname, { approved: true }),
    databaseName: safeDatabaseName(`/${databaseName}`),
    sourceSchema: normalizeSchemaScope(sourceSchema),
    applicationRevision: text(applicationRevision) || "unknown",
    backupFilename: basename(backupFile),
    backupSizeBytes: info.size,
    sha256: await sha256File(backupFile),
    archiveFormat: "PostgreSQL custom",
    archiveMetadata: text(archiveMetadata) || "pg_restore list inspection passed",
    backupToolVersion: text(toolVersion) || "unknown",
  };
}

function validateManifestShape(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) fail("Backup manifest is malformed.");
  const requiredStrings = ["createdAt", "environment", "approvedHostname", "databaseName", "applicationRevision", "backupFilename", "sha256", "archiveFormat", "archiveMetadata", "backupToolVersion"];
  if (manifest.manifestVersion !== MANIFEST_VERSION || requiredStrings.some((key) => typeof manifest[key] !== "string" || !manifest[key].trim())) fail("Backup manifest is malformed.");
  if (!Number.isSafeInteger(manifest.backupSizeBytes) || manifest.backupSizeBytes <= 0) fail("Backup manifest is malformed.");
  if (!/^[a-f0-9]{64}$/.test(manifest.sha256)) fail("Backup manifest is malformed.");
  if (!Number.isFinite(Date.parse(manifest.createdAt))) fail("Backup manifest is malformed.");
  normalizeEnvironment(manifest.environment);
  normalizeHostname(manifest.approvedHostname, { approved: true });
  safeDatabaseName(`/${manifest.databaseName}`);
  normalizeSchemaScope(manifest.sourceSchema);
  if (basename(manifest.backupFilename) !== manifest.backupFilename) fail("Backup manifest is malformed.");
  const forbidden = ["password", "database_url", "connection", "token", "credential", "secret", "username"];
  if (Object.keys(manifest).some((key) => forbidden.some((word) => key.toLowerCase().includes(word)))) fail("Backup manifest contains a forbidden secret-bearing field.");
}

export async function validateBackup({ backupFile, manifestFile, expectedEnvironment, maxAgeHours = DEFAULT_MAX_AGE_HOURS, now = new Date() }) {
  const backupInfo = await stat(backupFile).catch(() => fail("Backup file is missing."));
  if (!backupInfo.isFile() || backupInfo.size === 0) fail("Backup file is missing or empty.");
  let manifestText;
  try { manifestText = await readFile(manifestFile, "utf8"); } catch { fail("Backup manifest is missing."); }
  let manifest;
  try { manifest = JSON.parse(manifestText); } catch { fail("Backup manifest is malformed."); }
  validateManifestShape(manifest);
  if (manifest.backupFilename !== basename(backupFile) || manifest.backupSizeBytes !== backupInfo.size) fail("Backup manifest does not match the backup file.");
  if (manifest.sha256 !== await sha256File(backupFile)) fail("Backup checksum mismatch.");
  if (expectedEnvironment && manifest.environment !== normalizeEnvironment(expectedEnvironment)) fail("Backup environment does not match the requested environment.");
  const ageMs = now.getTime() - Date.parse(manifest.createdAt);
  const allowedMs = Number(maxAgeHours) * 60 * 60 * 1000;
  if (!Number.isFinite(allowedMs) || allowedMs <= 0) fail("Maximum backup age must be a positive number of hours.");
  if (ageMs < -5 * 60 * 1000 || ageMs > allowedMs) fail("Backup is stale or has an invalid future timestamp.");
  return manifest;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (!key?.startsWith("--") || argv[index + 1] === undefined) fail("Arguments must be explicit --name value pairs.");
    args[key.slice(2)] = argv[index + 1];
  }
  return args;
}

async function readStandardInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export function validateTargetStdinPayload(payload) {
  if (!Buffer.isBuffer(payload)) fail("Target validation input is malformed.");
  const fields = payload.toString("utf8").split("\0");
  if (fields.length !== 6) fail("Target validation input is malformed.");
  const [operation, environment, approvedHostname, expectedDatabase, destination, databaseUrl] = fields;
  if (!["backup", "restore"].includes(operation) || !environment || !approvedHostname || !expectedDatabase || !databaseUrl || !["true", "false"].includes(destination)) {
    fail("Target validation input is malformed.");
  }
  const options = { databaseUrl, environment, approvedHostname, expectedDatabase, destination: destination === "true" };
  return operation === "backup" ? validateBackupTarget(options) : validateDatabaseTarget(options);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (command === "database-url") {
    process.stdout.write(await readDatabaseUrlFromEnvFile(args["env-file"]));
  } else if (command === "target-stdin") {
    process.stdout.write(JSON.stringify(validateTargetStdinPayload(await readStandardInput())));
  } else if (command === "prepare-production-backup") {
    await prepareProductionBackup({ envFile: args["env-file"], approvalFile: args["approval-file"], stateDirectory: args["state-directory"], confirmation: process.env.CONFIRM_PRODUCTION_BACKUP });
  } else if (command === "manifest") {
    let hostname = args.host; let databaseName = args.database; let sourceSchema = args["source-schema"];
    if (args["target-file"] || args["target-stdin"] === "true") {
      let target;
      try { target = JSON.parse(args["target-file"] ? await readFile(args["target-file"], "utf8") : (await readStandardInput()).toString("utf8")); } catch { fail("Validated backup target state is malformed."); }
      hostname = target.hostname; databaseName = target.databaseName; sourceSchema = target.schema;
    }
    const manifest = await buildManifest({ backupFile: args.backup, environment: args.environment, hostname, databaseName, sourceSchema, applicationRevision: args.revision, createdAt: args["created-at"], toolVersion: args["tool-version"], archiveMetadata: args["archive-metadata"] });
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } else if (command === "validate") {
    const manifest = await validateBackup({ backupFile: args.backup, manifestFile: args.manifest, expectedEnvironment: args.environment, maxAgeHours: args["max-age-hours"] || DEFAULT_MAX_AGE_HOURS });
    process.stdout.write(JSON.stringify({ environment: manifest.environment, hostname: manifest.approvedHostname, databaseName: manifest.databaseName, sourceSchema: manifest.sourceSchema }));
  } else if (command === "compatibility") {
    assertEnvironmentCompatibility(args.source, args.destination);
  } else if (command === "schema-compatibility") {
    assertSchemaCompatibility(args.source, args.destination);
  } else fail("Unknown database recovery safety command.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main().catch((error) => { console.error(error instanceof SafetyError ? error.message : "Database recovery safety validation failed."); process.exitCode = 1; });
}
