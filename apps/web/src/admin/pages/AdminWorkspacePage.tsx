import { Link, useLocation } from "react-router-dom";
import AdminPageShell from "../components/AdminPageShell";

type WorkspaceConfig = {
  title: string;
  subtitle: string;
  cards: Array<{
    title: string;
    body: string;
    to?: string;
  }>;
};

const WORKSPACE: Record<string, WorkspaceConfig> = {
  orders: {
    title: "Orders & Settlements",
    subtitle: "Triage settlement issues, payment review, and transaction operations.",
    cards: [
      { title: "Settlement Queue", body: "Review settlement records and failed payment handoffs.", to: "/admin/orders" },
      { title: "Payment Issues", body: "Track failed, pending, or delayed settlement activity." },
      { title: "Escalations", body: "Escalate settlement disputes to Super Admin when platform-level action is needed." },
    ],
  },
  reviews: {
    title: "Reviews & Feedback",
    subtitle: "Monitor user feedback, shop reputation, and marketplace quality signals.",
    cards: [
      { title: "Review Moderation", body: "Review suspicious or abusive feedback." },
      { title: "Shop Reputation", body: "Identify shops with repeated negative buyer signals.", to: "/admin/shops" },
      { title: "Quality Trends", body: "Track recurring complaints by category or shop." },
    ],
  },
  support: {
    title: "Support Center",
    subtitle: "Operational support queues for buyers, owners, inventory, auctions, and payments.",
    cards: [
      { title: "Buyer Support", body: "Investigate buyer complaints, bid issues, and item questions." },
      { title: "Owner Support", body: "Help shop owners with onboarding, inventory, integrations, and auctions.", to: "/admin/owners" },
      { title: "Escalation Notes", body: "Use internal notes and escalate governance issues to Super Admin." },
    ],
  },
  revenue: {
    title: "Revenue Operations",
    subtitle: "Operational revenue view for subscriptions, settlements, and marketplace activity.",
    cards: [
      { title: "Subscriptions", body: "Review owner subscription statuses and plan issues.", to: "/admin/subscriptions" },
      { title: "Settlements", body: "Monitor operational settlement volume and failed payments.", to: "/admin/orders" },
      { title: "Revenue Exceptions", body: "Track transactions that need review." },
    ],
  },
  analytics: {
    title: "Analytics",
    subtitle: "Operational marketplace analytics and performance trends.",
    cards: [
      { title: "Marketplace Activity", body: "Track items, shops, offers, and auctions.", to: "/admin" },
      { title: "Owner Activity", body: "Review active shops and owner onboarding.", to: "/admin/owners" },
      { title: "Buyer Activity", body: "Monitor bids, offers, and saved activity." },
    ],
  },
  risk: {
    title: "Risk Center",
    subtitle: "Identify suspicious accounts, listings, shops, auctions, and payment behavior.",
    cards: [
      { title: "Flagged Inventory", body: "Review deleted or suspicious listings.", to: "/admin/inventory" },
      { title: "Inactive Users", body: "Review blocked or inactive accounts.", to: "/admin/users" },
      { title: "Shop Risk", body: "Review shops with repeated issues or suspicious activity.", to: "/admin/shops" },
    ],
  },
  audit: {
    title: "Admin Audit Review",
    subtitle: "Operational audit review for moderation and marketplace actions.",
    cards: [
      { title: "Inventory Moderation", body: "Review item remove/restore activity.", to: "/admin/inventory" },
      { title: "User Actions", body: "Review blocked/unblocked user activity.", to: "/admin/users" },
      { title: "Escalation", body: "Use Super Admin audit for platform governance review." },
    ],
  },
  system: {
    title: "Admin System Status",
    subtitle: "Limited operational health view for the admin team.",
    cards: [
      { title: "Frontend Wiring", body: "Dev wiring should remain locked to backend 6002." },
      { title: "Operational Checks", body: "Run build:web, check:dev-safe, and role-routes before pushing." },
      { title: "Super Admin Health", body: "Full system health is available to Super Admin.", to: "/super-admin/system" },
    ],
  },
  settings: {
    title: "Admin Settings",
    subtitle: "Operational preferences and admin workspace settings.",
    cards: [
      { title: "Workspace Preferences", body: "Admin display and workflow settings will live here." },
      { title: "Notification Rules", body: "Future admin notifications for risk, support, and settlement issues." },
      { title: "Platform Settings", body: "Global platform settings are controlled by Super Admin.", to: "/super-admin/platform-settings" },
    ],
  },
};

function getKey(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] || "orders";
}

export default function AdminWorkspacePage() {
  const location = useLocation();
  const key = getKey(location.pathname);
  const config = WORKSPACE[key] || WORKSPACE.orders;

  return (
    <AdminPageShell title={config.title} subtitle={config.subtitle}>
      <div className="grid gap-3 md:grid-cols-3">
        {config.cards.map((card) => {
          const content = (
            <div className="rounded-2xl border bg-background p-4 shadow-sm transition hover:shadow-md">
              <h3 className="font-semibold">{card.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{card.body}</p>
            </div>
          );

          if (!card.to) return <div key={card.title}>{content}</div>;

          return (
            <Link key={card.title} to={card.to} className="block text-inherit no-underline">
              {content}
            </Link>
          );
        })}
      </div>

      <div className="mt-4 rounded-2xl border bg-background p-4 shadow-sm">
        <h3 className="font-semibold">Recommended next build</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Turn this workspace into a live queue with records, notes, ownership, status,
          assignment, and resolve/escalate actions.
        </p>
      </div>
    </AdminPageShell>
  );
}
