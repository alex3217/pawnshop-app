export const LAUNCH_STATUSES = ["PASS", "FAIL", "BLOCKED", "PARTIAL", "DEFERRED", "NOT_RUN"] as const;
export type LaunchStatus = (typeof LAUNCH_STATUSES)[number];
export type LaunchReadinessItem = { area: string; status: LaunchStatus; evidence: string };

export const launchReadiness = {
  lastUpdated: "2026-08-01T23:00:00.000Z",
  items: [
    { area: "Database", status: "BLOCKED", evidence: "No certified disposable target or clean replay evidence." },
    { area: "Migrations", status: "PARTIAL", evidence: "Static prefix guard exists; applied-history reconciliation remains blocked." },
    { area: "Stripe", status: "BLOCKED", evidence: "Mock contracts pass; provider-backed test-mode lifecycle was not run." },
    { area: "Browser tests", status: "PARTIAL", evidence: "Mock suite remediation is in progress; staging role matrix remains blocked." },
    { area: "Accessibility", status: "PARTIAL", evidence: "Automated axe coverage exists; manual keyboard, screen-reader, and measured contrast certification remain." },
    { area: "Upload security", status: "PARTIAL", evidence: "CSV boundary is hardened; production object storage is not configured." },
    { area: "Dependencies", status: "FAIL", evidence: "Web advisories require reviewed remediation; mobile advisories remain deferred." },
    { area: "Monitoring", status: "FAIL", evidence: "No exercised centralized telemetry or paging evidence." },
    { area: "Backups", status: "BLOCKED", evidence: "No certified isolated restore drill or current off-host retention evidence." },
    { area: "Rollback", status: "PARTIAL", evidence: "Checklist exists; no completed rollback drill evidence." },
    { area: "Role isolation", status: "PARTIAL", evidence: "Contract denials pass; seeded cross-tenant HTTP/browser matrix is blocked." },
    { area: "Dealer readiness", status: "DEFERRED", evidence: "Provider funds flow and operations certification are incomplete." },
    { area: "Mobile readiness", status: "DEFERRED", evidence: "Native launch and dependency remediation are outside this phase." },
  ] satisfies LaunchReadinessItem[],
  decisions: [
    { area: "Invite-only web beta", status: "BLOCKED", evidence: "Database, provider, staging, and operations gates remain." },
    { area: "General public web", status: "BLOCKED", evidence: "Invite-only gates plus public scale and manual accessibility certification remain." },
    { area: "Mobile", status: "DEFERRED", evidence: "Native mobile certification is deferred." },
    { area: "Dealer Marketplace", status: "DEFERRED", evidence: "Dealer activation remains disabled pending funds-flow and operations evidence." },
  ] satisfies LaunchReadinessItem[],
};
