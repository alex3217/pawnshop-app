#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const reportDir = process.argv[2] || "reports/readability-audit-latest";
const detailsPath = path.join(reportDir, "details.json");
const summaryPath = path.join(reportDir, "summary.json");

if (!fs.existsSync(detailsPath)) {
  console.error(`Missing ${detailsPath}`);
  process.exit(1);
}

const details = JSON.parse(fs.readFileSync(detailsPath, "utf8"));
const summary = fs.existsSync(summaryPath)
  ? JSON.parse(fs.readFileSync(summaryPath, "utf8"))
  : null;

const failPages = details
  .filter((page) => page.failCount > 0)
  .sort((a, b) => b.failCount - a.failCount);

console.log("===== READABILITY OVERVIEW =====");
if (summary) {
  console.log(JSON.stringify({
    verdict: summary.verdict,
    pageCount: summary.pageCount,
    totalFailures: summary.totalFailures,
    totalWarnings: summary.totalWarnings,
    issueTotals: summary.issueTotals,
  }, null, 2));
}

console.log("\n===== TOP FAILED PAGES =====");
console.table(
  failPages.slice(0, 20).map((page) => ({
    theme: page.theme,
    role: page.role,
    path: page.path,
    failures: page.failCount,
    warnings: page.warningCount,
    screenshot: page.screenshot,
  })),
);

console.log("\n===== TOP ISSUE TYPES BY PAGE =====");
for (const page of failPages.slice(0, 15)) {
  const counts = {};
  for (const issue of page.issues || []) {
    counts[issue.type] = (counts[issue.type] || 0) + 1;
  }

  console.log(`\n${page.theme} ${page.path} — failures: ${page.failCount}`);
  console.table(counts);
}

console.log("\n===== TOP REPEATED SELECTORS =====");
for (const page of failPages.slice(0, 12)) {
  const groups = new Map();

  for (const issue of page.issues || []) {
    if (issue.severity !== "fail") continue;

    const key = `${issue.type}|||${issue.path || "(no path)"}`;
    const existing = groups.get(key) || {
      type: issue.type,
      path: issue.path || "(no path)",
      count: 0,
      minContrast: Number.POSITIVE_INFINITY,
      required: issue.required || "",
      examples: [],
    };

    existing.count += 1;

    if (typeof issue.contrast === "number") {
      existing.minContrast = Math.min(existing.minContrast, issue.contrast);
    }

    if (existing.examples.length < 3 && issue.text) {
      existing.examples.push(String(issue.text).slice(0, 90));
    }

    groups.set(key, existing);
  }

  const rows = [...groups.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .map((row) => ({
      count: row.count,
      type: row.type,
      minContrast: Number.isFinite(row.minContrast) ? row.minContrast : "",
      required: row.required,
      examples: row.examples.join(" | "),
      selector: row.path,
    }));

  console.log(`\n--- ${page.theme} ${page.path} ---`);
  console.table(rows);
}

console.log("\n===== TOP LOW CONTRAST TEXT EXAMPLES =====");
for (const page of failPages.slice(0, 10)) {
  console.log(`\n--- ${page.theme} ${page.path} ---`);

  const rows = (page.issues || [])
    .filter((issue) => issue.type === "LOW_CONTRAST" || issue.type === "LOW_PLACEHOLDER_CONTRAST")
    .slice(0, 25)
    .map((issue) => ({
      type: issue.type,
      contrast: issue.contrast,
      required: issue.required,
      text: String(issue.text || "").replace(/\s+/g, " ").slice(0, 80),
      selector: issue.path,
    }));

  console.table(rows);
}
