import AdminOperationsPage from "./AdminOperationsPage";

export default function AdminSystemPage() {
  return (
    <AdminOperationsPage
      eyebrow="Admin system"
      title="System health and platform status"
      description="Monitor API health, configuration readiness, and operational status before running deeper audits."
      primaryAction={{ label: "Open Super Admin health", to: "/super-admin/system-health" }}
      metrics={[
        { label: "API health", value: "Checked", note: "Uses the live health endpoint." },
        { label: "Auth wiring", value: "Verified", note: "Dev-safe checks validate auth files and proxy wiring." },
        { label: "System detail", value: "Super Admin", note: "Provider health belongs in Super Admin controls." },
      ]}
      endpoints={[
        { label: "API health", path: "/health", note: "Backend health response." },
        { label: "Users API", path: "/admin/users?limit=5", note: "Confirms admin API access." },
        { label: "Super Admin system", path: "/super-admin/system", note: "Detailed provider/runtime status for Super Admin." },
      ]}
      checklist={[
        "Confirm health before running visual audits.",
        "Use Super Admin system health for provider configuration.",
        "Keep non-PawnShop ports stopped during PawnShop-only audits.",
      ]}
      links={[
        { label: "Super Admin system", to: "/super-admin/system-health" },
        { label: "Settings", to: "/admin/settings" },
        { label: "Audit", to: "/admin/audit" },
      ]}
    />
  );
}
