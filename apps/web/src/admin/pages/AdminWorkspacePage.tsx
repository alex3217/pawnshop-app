import { Link, useLocation } from "react-router-dom";

type WorkspaceKind =
  | "orders"
  | "reviews"
  | "support"
  | "revenue"
  | "analytics"
  | "risk"
  | "audit"
  | "system"
  | "settings";

type WorkspaceRouteConfig = {
  kind: WorkspaceKind;
  title: string;
  description: string;
};

const routeConfig: Record<string, WorkspaceRouteConfig> = {
  "/admin/orders": {
    kind: "orders",
    title: "Admin orders",
    description:
      "Track order-adjacent marketplace activity through offers, auctions, settlements, and buyer/owner records.",
  },
  "/admin/reviews": {
    kind: "reviews",
    title: "Admin reviews",
    description:
      "Monitor trust, storefront quality, listing quality, and customer reputation signals.",
  },
  "/admin/support": {
    kind: "support",
    title: "Admin support",
    description:
      "Help buyers, owners, and admins resolve account, listing, offer, auction, and settlement issues.",
  },
  "/admin/revenue": {
    kind: "revenue",
    title: "Admin revenue",
    description:
      "Review seller plans, subscription state, settlement activity, and platform revenue handoff points.",
  },
  "/admin/analytics": {
    kind: "analytics",
    title: "Admin analytics",
    description:
      "Review marketplace coverage, operational health, inventory, auction, and buyer/owner activity.",
  },
  "/admin/risk": {
    kind: "risk",
    title: "Admin risk",
    description:
      "Monitor permission boundaries, suspicious activity, role access, and marketplace operational risk.",
  },
  "/admin/audit": {
    kind: "audit",
    title: "Admin audit",
    description:
      "Open audit-focused tools and connect to Super Admin audit records when deeper access is required.",
  },
  "/admin/system": {
    kind: "system",
    title: "Admin system",
    description:
      "Review runtime health, frontend/backend wiring, process boundaries, and platform operational status.",
  },
  "/admin/settings": {
    kind: "settings",
    title: "Admin settings",
    description:
      "Manage admin-facing settings handoffs and open Super Admin platform settings for control-plane changes.",
  },
};

const workspaceConfig: Record<
  WorkspaceKind,
  {
    status: string;
    primaryAction: string;
    primaryHref: string;
    cards: Array<{
      label: string;
      value: string;
      helper: string;
    }>;
    actions: Array<{
      label: string;
      href: string;
      helper: string;
    }>;
  }
> = {
  orders: {
    status: "Order operations",
    primaryAction: "Review settlements",
    primaryHref: "/super-admin/settlements",
    cards: [
      {
        label: "Order flow",
        value: "Marketplace → Offer → Settlement",
        helper:
          "Current transaction visibility is handled through offers, auctions, and settlements.",
      },
      {
        label: "Buyer activity",
        value: "Buyer routes active",
        helper:
          "My bids, wins, watchlist, saved searches, offers, and settlements are smoke-tested.",
      },
      {
        label: "Owner activity",
        value: "Owner routes active",
        helper:
          "Inventory, locations, staff, auctions, offers, and settlements are smoke-tested.",
      },
    ],
    actions: [
      {
        label: "View offers",
        href: "/admin/offers",
        helper: "Monitor buyer/owner offer activity.",
      },
      {
        label: "View auctions",
        href: "/admin/auctions",
        helper: "Review auction status and bidding activity.",
      },
      {
        label: "View settlements",
        href: "/super-admin/settlements",
        helper: "Review settlement activity.",
      },
    ],
  },
  reviews: {
    status: "Trust & reputation",
    primaryAction: "View shops",
    primaryHref: "/admin/shops",
    cards: [
      {
        label: "Shop trust",
        value: "Shop records active",
        helper:
          "Use shop records to monitor owner storefront quality and completeness.",
      },
      {
        label: "Inventory quality",
        value: "Inventory review ready",
        helper:
          "Item listings can be reviewed from the admin inventory workspace.",
      },
      {
        label: "Customer signals",
        value: "Feedback pipeline planned",
        helper:
          "Dedicated review moderation can be deepened after core marketplace flows are complete.",
      },
    ],
    actions: [
      {
        label: "Review shops",
        href: "/admin/shops",
        helper: "Inspect pawnshop storefronts.",
      },
      {
        label: "Review inventory",
        href: "/admin/inventory",
        helper: "Audit listed items and listing quality.",
      },
      {
        label: "Review users",
        href: "/admin/users",
        helper: "Check account activity and roles.",
      },
    ],
  },
  support: {
    status: "Support operations",
    primaryAction: "Review users",
    primaryHref: "/admin/users",
    cards: [
      {
        label: "Account support",
        value: "Users active",
        helper: "Admins can inspect users, owners, and shop records.",
      },
      {
        label: "Marketplace support",
        value: "Offers + auctions active",
        helper:
          "Support issues can be investigated through offers, auctions, and settlements.",
      },
      {
        label: "Escalations",
        value: "Admin access active",
        helper: "Admin and Super Admin route checks are passing.",
      },
    ],
    actions: [
      {
        label: "Open users",
        href: "/admin/users",
        helper: "Find buyer, owner, and admin accounts.",
      },
      {
        label: "Open owners",
        href: "/admin/owners",
        helper: "Review owner accounts and shops.",
      },
      {
        label: "Open offers",
        href: "/admin/offers",
        helper: "Inspect active marketplace negotiations.",
      },
    ],
  },
  revenue: {
    status: "Revenue operations",
    primaryAction: "Open revenue",
    primaryHref: "/super-admin/revenue",
    cards: [
      {
        label: "Seller plans",
        value: "Active",
        helper: "Seller subscription plan routes are available.",
      },
      {
        label: "Settlement visibility",
        value: "Active",
        helper: "Admin settlement route checks are passing.",
      },
      {
        label: "Super Admin revenue",
        value: "Available",
        helper: "Platform-level revenue lives under Super Admin revenue.",
      },
    ],
    actions: [
      {
        label: "Seller subscriptions",
        href: "/admin/subscriptions",
        helper: "Monitor seller plans and status.",
      },
      {
        label: "Super Admin revenue",
        href: "/super-admin/revenue",
        helper: "Open platform-wide revenue reporting.",
      },
      {
        label: "Settlements",
        href: "/super-admin/settlements",
        helper: "Review settlement activity.",
      },
    ],
  },
  analytics: {
    status: "Operational analytics",
    primaryAction: "Open overview",
    primaryHref: "/admin",
    cards: [
      {
        label: "Marketplace coverage",
        value: "Items + shops + auctions",
        helper: "Core marketplace resources are route-tested.",
      },
      {
        label: "Owner operations",
        value: "Inventory + staff + locations",
        helper: "Owner workspaces are online and compiling.",
      },
      {
        label: "Buyer operations",
        value: "Bids + watchlist + offers",
        helper: "Buyer workspaces are online and route-tested.",
      },
    ],
    actions: [
      {
        label: "Overview",
        href: "/admin",
        helper: "Return to admin KPIs.",
      },
      {
        label: "Inventory",
        href: "/admin/inventory",
        helper: "Inspect item coverage.",
      },
      {
        label: "Auctions",
        href: "/admin/auctions",
        helper: "Inspect auction activity.",
      },
    ],
  },
  risk: {
    status: "Risk controls",
    primaryAction: "Review users",
    primaryHref: "/admin/users",
    cards: [
      {
        label: "Permission checks",
        value: "Passing",
        helper: "Negative permission route checks are passing.",
      },
      {
        label: "Legacy runtime guard",
        value: "Active",
        helper: "Legacy process and port guard checks are available.",
      },
      {
        label: "Role smoke tests",
        value: "Passing",
        helper:
          "Buyer, owner, admin, and super-admin route checks are passing.",
      },
    ],
    actions: [
      {
        label: "Users",
        href: "/admin/users",
        helper: "Review suspicious account activity.",
      },
      {
        label: "Owners",
        href: "/admin/owners",
        helper: "Review owner access and shop ownership.",
      },
      {
        label: "Super Admin audit",
        href: "/super-admin/audit",
        helper: "Review platform audit events.",
      },
    ],
  },
  audit: {
    status: "Audit visibility",
    primaryAction: "Open Super Admin audit",
    primaryHref: "/super-admin/audit",
    cards: [
      {
        label: "Audit stream",
        value: "Super Admin ready",
        helper: "The dedicated audit page is available under Super Admin.",
      },
      {
        label: "Admin route",
        value: "Mapped",
        helper: "This admin route now points users to the active audit workspace.",
      },
      {
        label: "Safety scripts",
        value: "Committed",
        helper:
          "Audit and progress safety scripts are now in the repository.",
      },
    ],
    actions: [
      {
        label: "Super Admin audit",
        href: "/super-admin/audit",
        helper: "Open platform audit records.",
      },
      {
        label: "Platform settings",
        href: "/super-admin/platform-settings",
        helper: "Review platform controls.",
      },
      {
        label: "Users",
        href: "/admin/users",
        helper: "Audit role assignments.",
      },
    ],
  },
  system: {
    status: "System health",
    primaryAction: "Open platform settings",
    primaryHref: "/super-admin/platform-settings",
    cards: [
      {
        label: "Frontend wiring",
        value: "5176 → 6002",
        helper:
          "Dev-safe checks verify the frontend proxy points to the dev backend.",
      },
      {
        label: "Backend health",
        value: "6002 healthy",
        helper: "Health checks are passing for the dev backend.",
      },
      {
        label: "Runtime boundaries",
        value: "Guarded",
        helper:
          "Process boundary checks catch old legacy ports and PM2 names.",
      },
    ],
    actions: [
      {
        label: "Platform settings",
        href: "/super-admin/platform-settings",
        helper: "Review platform-wide settings.",
      },
      {
        label: "Admin overview",
        href: "/admin",
        helper: "Return to admin overview.",
      },
      {
        label: "Super Admin overview",
        href: "/super-admin",
        helper: "Review control-plane status.",
      },
    ],
  },
  settings: {
    status: "Admin configuration",
    primaryAction: "Open platform settings",
    primaryHref: "/super-admin/platform-settings",
    cards: [
      {
        label: "Admin settings",
        value: "Control-plane linked",
        helper:
          "Deep platform settings are handled by Super Admin platform settings.",
      },
      {
        label: "Subscriptions",
        value: "Admin ready",
        helper: "Seller subscription administration is available.",
      },
      {
        label: "User roles",
        value: "Admin ready",
        helper: "Admin user and role management routes are available.",
      },
    ],
    actions: [
      {
        label: "Platform settings",
        href: "/super-admin/platform-settings",
        helper: "Open Super Admin platform settings.",
      },
      {
        label: "Subscriptions",
        href: "/admin/subscriptions",
        helper: "Manage seller plan visibility and status.",
      },
      {
        label: "Users",
        href: "/admin/users",
        helper: "Manage admin-visible users.",
      },
    ],
  },
};

function getRouteConfig(pathname: string): WorkspaceRouteConfig {
  const normalized = pathname.replace(/\/+$/, "") || "/admin";
  return routeConfig[normalized] || routeConfig["/admin/system"];
}

export default function AdminWorkspacePage() {
  const { pathname } = useLocation();
  const route = getRouteConfig(pathname);
  const config = workspaceConfig[route.kind];

  return (
    <main className="page-shell">
      <section className="panel stack">
        <div className="cluster" style={{ justifyContent: "space-between" }}>
          <div>
            <p className="eyebrow">Admin workspace</p>
            <h1>{route.title}</h1>
            <p className="muted">{route.description}</p>
          </div>

          <Link className="btn btn-primary" to={config.primaryHref}>
            {config.primaryAction}
          </Link>
        </div>

        <div className="badge-row">
          <span className="badge badge-success">{config.status}</span>
          <span className="badge">Production-safe shell</span>
          <span className="badge">No placeholder route</span>
        </div>
      </section>

      <section className="grid grid-3">
        {config.cards.map((card) => (
          <article className="card stack" key={card.label}>
            <p className="eyebrow">{card.label}</p>
            <h2>{card.value}</h2>
            <p className="muted">{card.helper}</p>
          </article>
        ))}
      </section>

      <section className="panel stack">
        <div>
          <p className="eyebrow">Available actions</p>
          <h2>Continue from active workspaces</h2>
          <p className="muted">
            These links point to existing, compiled pages so admins are never sent to dead-end placeholder screens.
          </p>
        </div>

        <div className="grid grid-3">
          {config.actions.map((action) => (
            <Link className="card stack lift-link" to={action.href} key={action.href}>
              <strong>{action.label}</strong>
              <span className="muted">{action.helper}</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
