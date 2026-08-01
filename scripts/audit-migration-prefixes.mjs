import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = resolve(root, "apps/api/backend/prisma/migrations");
const allowlistPath = resolve(root, "scripts/migration-prefix-allowlist.json");

export function duplicatePrefixes(names) {
  const grouped = new Map();
  for (const name of names) {
    const prefix = name.match(/^(\d{14})_/u)?.[1];
    if (!prefix) continue;
    grouped.set(prefix, [...(grouped.get(prefix) || []), name]);
  }
  return [...grouped.entries()].filter(([, entries]) => entries.length > 1);
}

const names = (await readdir(migrationsDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const allowlist = JSON.parse(await readFile(allowlistPath, "utf8"));
const duplicates = duplicatePrefixes(names);
const unapproved = duplicates.filter(([prefix, entries]) => {
  const item = allowlist[prefix];
  return !item || !item.reason || JSON.stringify([...item.migrations].sort()) !== JSON.stringify(entries);
});

for (const [prefix, entries] of duplicates) {
  console.log(`${prefix}: ${entries.join(", ")} (${allowlist[prefix]?.reason || "NOT ALLOWLISTED"})`);
}
if (unapproved.length) {
  console.error(`Migration prefix audit failed: ${unapproved.length} unapproved duplicate prefix(es).`);
  process.exit(1);
}
console.log(`Migration prefix audit passed: ${names.length} migrations; ${duplicates.length} documented duplicate prefix(es).`);
