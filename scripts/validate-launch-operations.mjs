#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const requirements = new Map([
  ["docs/launch-operations/README.md", ["Documents", "Repository-supported controls", "Controls not established by this repository", "Evidence standard"]],
  ["docs/launch-operations/incident-response.md", ["Severity model", "Incident command structure", "Incident lifecycle", "Emergency access / break-glass", "Status and communication templates", "Postmortem template"]],
  ["docs/launch-operations/incident-playbooks.md", ["Shared financial incident safety", "API outage", "Database corruption", "Credential/secret leak", "Stripe webhook backlog/failure", "Incorrect payout", "DNS/domain outage"]],
  ["docs/launch-operations/rollback-runbook.md", ["Rollback decision triggers", "Application rollback", "Configuration rollback", "Database migration compatibility review", "When database rollback must NOT be attempted", "Validation", "Rollback evidence"]],
  ["docs/launch-operations/paid-beta-launch-checklist.md", ["Decision record"]],
  ["docs/launch-operations/first-72-hours.md", ["Operating cadence", "Review procedure", "Daily continuation go/no-go", "Beta stop / kill criteria"]],
]);

const playbookNames = [
  "API outage", "Frontend outage", "Database outage", "Database corruption",
  "Failed/bad migration", "Excessive 5xx errors", "High latency",
  "Authentication outage", "Suspected account takeover", "Credential/secret leak",
  "Stripe API outage", "Stripe webhook backlog/failure", "Incorrect charge",
  "Incorrect refund", "Incorrect payout", "Payout backlog",
  "Auction/bidding degradation", "Scheduled job failure", "Email provider outage",
  "Upload/storage outage", "DNS/domain outage", "Third-party provider outage",
];
const playbookFields = [
  "Symptoms", "Immediate safety actions", "Evidence to collect", "What NOT to do",
  "Containment", "Recovery", "Validation", "Escalation",
  "Customer communication decision", "Post-incident follow-up",
];

const failures = [];
for (const [path, headings] of requirements) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    failures.push(`${path}: missing or unreadable (${error.code || error.message})`);
    continue;
  }
  const present = new Set([...text.matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map((match) => match[1].trim()));
  for (const heading of headings) {
    if (!present.has(heading)) failures.push(`${path}: missing heading "${heading}"`);
  }
}

try {
  const playbooks = `${await readFile("docs/launch-operations/incident-playbooks.md", "utf8")}\n## __END__\n`;
  const sections = new Map();
  for (const match of playbooks.matchAll(/^## ([^\n]+)\n([\s\S]*?)(?=^## )/gm)) {
    sections.set(match[1].trim(), match[2]);
  }
  for (const name of playbookNames) {
    const section = sections.get(name);
    if (!section) {
      failures.push(`incident-playbooks.md: missing playbook "${name}"`);
      continue;
    }
    for (const field of playbookFields) {
      const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (!new RegExp(`^\\|\\s*${escaped}\\s*\\|`, "m").test(section)) {
        failures.push(`incident-playbooks.md: "${name}" missing field "${field}"`);
      }
    }
  }
} catch {
  // The ordinary missing-file failure above is sufficient.
}

if (failures.length) {
  console.error("Launch operations validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Launch operations validation passed (${requirements.size} documents).`);
