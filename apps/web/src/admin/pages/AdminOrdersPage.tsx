import AdminOperationsPage from "./AdminOperationsPage";

export default function AdminOrdersPage() {
  return (
    <AdminOperationsPage
      eyebrow="Admin orders"
      title="Orders, settlements, and fulfillment"
      description="Monitor buyer payments, auction settlement handoffs, and operational order issues from one control surface."
      primaryAction={{ label: "Review settlements", to: "/admin/revenue" }}
      metrics={[
        { label: "Settlement queue", value: "Live", note: "Tracks payment and winner handoff records." },
        { label: "Inventory dependency", value: "Connected", note: "Orders are tied back to item and shop records." },
        { label: "Admin action", value: "Audit-ready", note: "Use related controls before escalating disputes." },
      ]}
      endpoints={[
        { label: "Settlements", path: "/settlements", note: "Payment and auction outcome records visible to admin." },
        { label: "Inventory", path: "/admin/items?limit=10", note: "Items connected to order and settlement review." },
        { label: "Shops", path: "/admin/shops?limit=10", note: "Seller locations involved in fulfillment." },
      ]}
      checklist={[
        "Review failed or pending settlements before contacting owners.",
        "Confirm item status before approving manual order corrections.",
        "Use shop records to verify owner responsibility and pickup details.",
      ]}
      links={[
        { label: "Inventory moderation", to: "/admin/inventory" },
        { label: "Shop controls", to: "/admin/shops" },
        { label: "Revenue summary", to: "/admin/revenue" },
      ]}
    />
  );
}
