import AdminOperationsPage from "./AdminOperationsPage";

export default function AdminAnalyticsPage() {
  return (
    <AdminOperationsPage
      eyebrow="Admin analytics"
      title="Marketplace analytics"
      description="Use live platform records to understand users, shops, inventory, auctions, and settlement coverage."
      primaryAction={{ label: "Review inventory", to: "/admin/inventory" }}
      metrics={[
        { label: "Marketplace data", value: "Live", note: "Data is backed by seeded and live API records." },
        { label: "Auction activity", value: "Tracked", note: "Auction totals are available through public/admin APIs." },
        { label: "Operational view", value: "Unified", note: "Connects activity back to shops and users." },
      ]}
      endpoints={[
        { label: "Users", path: "/admin/users?limit=10", note: "User counts and role mix." },
        { label: "Items", path: "/admin/items?limit=10", note: "Inventory volume and item status." },
        { label: "Auctions", path: "/auctions?limit=10", note: "Live auction activity." },
      ]}
      checklist={[
        "Track user, shop, inventory, and auction health together.",
        "Use revenue and settlement pages for financial analytics.",
        "Use risk controls for abnormal marketplace patterns.",
      ]}
      links={[
        { label: "Revenue", to: "/admin/revenue" },
        { label: "Auctions", to: "/admin/auctions" },
        { label: "Risk", to: "/admin/risk" },
      ]}
    />
  );
}
