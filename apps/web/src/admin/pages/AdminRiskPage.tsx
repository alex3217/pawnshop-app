import AdminOperationsPage from "./AdminOperationsPage";

export default function AdminRiskPage() {
  return (
    <AdminOperationsPage
      eyebrow="Admin risk"
      title="Risk and moderation center"
      description="Monitor high-risk users, shops, inventory, and settlement patterns before they affect marketplace trust."
      primaryAction={{ label: "Open audit controls", to: "/admin/audit" }}
      metrics={[
        { label: "Risk signals", value: "Live", note: "Uses users, inventory, shops, and settlements." },
        { label: "Moderation", value: "Available", note: "Inventory and shop controls support block/restore workflows." },
        { label: "Escalation", value: "Tracked", note: "Audit records support governance review." },
      ]}
      endpoints={[
        { label: "Users", path: "/admin/users?limit=10", note: "Account status and role risk checks." },
        { label: "Inventory", path: "/admin/items?limit=10", note: "Suspicious or high-value listing review." },
        { label: "Settlements", path: "/settlements?limit=10", note: "Payment and winner handoff review." },
      ]}
      checklist={[
        "Check user role and activity before taking action.",
        "Review item value, shop ownership, and settlement state together.",
        "Use audit trails when blocking, restoring, or escalating records.",
      ]}
      links={[
        { label: "Users", to: "/admin/users" },
        { label: "Inventory", to: "/admin/inventory" },
        { label: "Audit", to: "/admin/audit" },
      ]}
    />
  );
}
