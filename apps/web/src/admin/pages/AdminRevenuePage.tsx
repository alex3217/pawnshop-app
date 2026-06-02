import AdminOperationsPage from "./AdminOperationsPage";

export default function AdminRevenuePage() {
  return (
    <AdminOperationsPage
      eyebrow="Admin revenue"
      title="Revenue and settlement oversight"
      description="Track marketplace settlement flow, subscription exposure, and high-level revenue health."
      primaryAction={{ label: "View subscriptions", to: "/admin/subscriptions" }}
      metrics={[
        { label: "Settlement revenue", value: "Connected", note: "Reads settlement records from the API." },
        { label: "Subscription revenue", value: "Connected", note: "Uses seller subscription records and plans." },
        { label: "Super admin summary", value: "Available", note: "Revenue summary is available to super-admin workflows." },
      ]}
      endpoints={[
        { label: "Settlements", path: "/settlements?limit=10", note: "Payment and auction settlement records." },
        { label: "Subscriptions", path: "/admin/subscriptions?limit=10", note: "Seller subscription records." },
        { label: "Seller plans", path: "/seller-plans", note: "Plan catalog used for owner revenue." },
      ]}
      checklist={[
        "Review pending settlements before treating revenue as collected.",
        "Compare subscription records against owner plan access.",
        "Escalate payment failures to support or risk review.",
      ]}
      links={[
        { label: "Subscriptions", to: "/admin/subscriptions" },
        { label: "Orders", to: "/admin/orders" },
        { label: "Super admin revenue", to: "/super-admin/revenue" },
      ]}
    />
  );
}
