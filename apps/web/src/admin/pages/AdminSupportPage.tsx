import AdminOperationsPage from "./AdminOperationsPage";

export default function AdminSupportPage() {
  return (
    <AdminOperationsPage
      eyebrow="Admin support"
      title="Support command center"
      description="Triage user, owner, offer, and settlement issues with quick access to the records support needs most."
      primaryAction={{ label: "Open users", to: "/admin/users" }}
      metrics={[
        { label: "Support scope", value: "Buyer + owner", note: "Centralized view for marketplace help requests." },
        { label: "Resolution path", value: "Record-first", note: "Start from user, shop, item, offer, or settlement data." },
        { label: "Escalation", value: "Available", note: "Move payment or risk cases into admin review." },
      ]}
      endpoints={[
        { label: "Users", path: "/admin/users?limit=10", note: "Find the account tied to the issue." },
        { label: "Shops", path: "/admin/shops?limit=10", note: "Check owner and shop context." },
        { label: "Settlements", path: "/settlements?limit=10", note: "Payment and auction issue context." },
      ]}
      checklist={[
        "Verify the user account and role before making changes.",
        "Check whether an issue is tied to an item, auction, or settlement.",
        "Use audit/risk routes for suspicious or repeated behavior.",
      ]}
      links={[
        { label: "Users", to: "/admin/users" },
        { label: "Orders", to: "/admin/orders" },
        { label: "Audit", to: "/admin/audit" },
      ]}
    />
  );
}
