import AdminOperationsPage from "./AdminOperationsPage";

export default function AdminAuditPage() {
  return (
    <AdminOperationsPage
      eyebrow="Admin audit"
      title="Audit and governance"
      description="Review governance-related records, moderation context, and Super Admin audit visibility."
      primaryAction={{ label: "Open Super Admin audit", to: "/super-admin/audit" }}
      metrics={[
        { label: "Audit trail", value: "Governed", note: "Super Admin audit APIs are available." },
        { label: "Admin actions", value: "Trackable", note: "Inventory and shop actions are linked to moderation." },
        { label: "Review model", value: "Escalation-based", note: "Use Super Admin for sensitive changes." },
      ]}
      endpoints={[
        { label: "Super Admin audit", path: "/super-admin/audit?limit=10", note: "Governance records for sensitive changes." },
        { label: "Users", path: "/admin/users?limit=10", note: "Account context for audit review." },
        { label: "Shops", path: "/admin/shops?limit=10", note: "Shop context for operational review." },
      ]}
      checklist={[
        "Use audit records before reversing sensitive changes.",
        "Verify user and shop context before escalation.",
        "Keep Super Admin-only controls separate from routine admin workflows.",
      ]}
      links={[
        { label: "Super Admin audit", to: "/super-admin/audit" },
        { label: "Risk", to: "/admin/risk" },
        { label: "System", to: "/admin/system" },
      ]}
    />
  );
}
