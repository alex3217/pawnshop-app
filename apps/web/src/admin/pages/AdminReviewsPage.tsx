import AdminOperationsPage from "./AdminOperationsPage";

export default function AdminReviewsPage() {
  return (
    <AdminOperationsPage
      eyebrow="Admin reviews"
      title="Reviews, trust, and marketplace quality"
      description="Review marketplace quality signals across users, shops, inventory, and buyer-submitted item workflows."
      primaryAction={{ label: "Open shop moderation", to: "/admin/shops" }}
      metrics={[
        { label: "Trust surface", value: "Active", note: "Reviews depend on user, shop, and item quality." },
        { label: "Buyer submissions", value: "Tracked", note: "Submitted items and shop offers feed review workflows." },
        { label: "Escalation", value: "Admin-led", note: "Flag risky shops or listings before they spread." },
      ]}
      endpoints={[
        { label: "Users", path: "/admin/users?limit=10", note: "Account health and reviewer identity checks." },
        { label: "Shops", path: "/admin/shops?limit=10", note: "Shop quality and owner accountability." },
        { label: "Inventory", path: "/admin/items?limit=10", note: "Listing quality and item moderation." },
      ]}
      checklist={[
        "Look for suspicious listing patterns before approving high-value inventory.",
        "Use shop ownership data before taking moderation action.",
        "Escalate repeat trust issues through risk controls.",
      ]}
      links={[
        { label: "Users", to: "/admin/users" },
        { label: "Shops", to: "/admin/shops" },
        { label: "Risk controls", to: "/admin/risk" },
      ]}
    />
  );
}
