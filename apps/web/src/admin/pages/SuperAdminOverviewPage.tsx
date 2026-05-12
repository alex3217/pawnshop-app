import { Link } from "react-router-dom";
import AdminPageShell from "../components/AdminPageShell";

type CommandCard = {
  title: string;
  description: string;
  to: string;
  primaryAction: string;
  controls: string[];
  tone?: "primary" | "standard" | "warning";
};

const PRIMARY_CONTROLS: CommandCard[] = [
  {
    title: "Users & Roles",
    description: "Create users, edit profiles, change roles, and manage active status.",
    to: "/super-admin/users",
    primaryAction: "Search / Add / Edit Users",
    tone: "primary",
    controls: [
      "Search users",
      "Add user",
      "Edit user",
      "Change role",
      "Activate / Deactivate",
      "Export CSV",
    ],
  },
  {
    title: "Shop Management",
    description: "Create shops, reassign owners, update shop profiles, and manage status.",
    to: "/super-admin/shops",
    primaryAction: "Search / Add / Edit Shops",
    tone: "primary",
    controls: [
      "Search shops",
      "Add shop",
      "Edit shop",
      "Reassign owner",
      "Update plan/status",
      "Disable / Restore",
      "Export CSV",
    ],
  },
  {
    title: "Inventory Control",
    description: "Edit listings, update status, change price/category, and moderate records.",
    to: "/super-admin/inventory",
    primaryAction: "Search / Edit / Moderate Inventory",
    tone: "primary",
    controls: [
      "Search listings",
      "Edit item",
      "Change price/category/status",
      "Delete / Restore",
      "Export CSV",
    ],
  },
];

const OPERATIONS_CONTROLS: CommandCard[] = [
  {
    title: "Integration Oversight",
    description: "Monitor owner integrations, credential safety, mappings, and sync state.",
    to: "/super-admin/integrations",
    primaryAction: "Open Integrations",
    controls: [
      "Search integrations",
      "View details",
      "Archive integration",
      "Review mappings",
      "Review sync health",
    ],
  },
  {
    title: "Settlement Control",
    description: "Review payment settlement records and operational payment issues.",
    to: "/super-admin/settlements",
    primaryAction: "Open Settlements",
    controls: [
      "Search settlements",
      "Review records",
      "Reconcile",
      "Escalate payment issues",
      "Export data",
    ],
  },
  {
    title: "Platform Settings",
    description: "Manage platform-level settings and operational feature controls.",
    to: "/super-admin/platform-settings",
    primaryAction: "Open Settings",
    controls: [
      "Search settings",
      "Edit settings",
      "Add setting later",
      "Disable/archive setting later",
    ],
  },
  {
    title: "Seller Plan Control",
    description: "Review seller/shop-owner plan catalog and plan governance.",
    to: "/super-admin/plans/seller",
    primaryAction: "Open Seller Plans",
    controls: [
      "Search plans",
      "Review plan features",
      "Prepare add/edit controls",
      "Archive/reactivate later",
    ],
  },
  {
    title: "Buyer Plan Control",
    description: "Review buyer plan catalog and buyer subscription readiness.",
    to: "/super-admin/plans/buyer",
    primaryAction: "Open Buyer Plans",
    controls: [
      "Search plans",
      "Review plan features",
      "Prepare add/edit controls",
      "Archive/reactivate later",
    ],
  },
  {
    title: "Buyer Subscriptions",
    description: "Monitor buyer subscriptions and subscription statuses.",
    to: "/super-admin/buyer-subscriptions",
    primaryAction: "Open Buyer Subscriptions",
    controls: [
      "Search subscriptions",
      "Edit status later",
      "Cancel/reactivate later",
      "Export data",
    ],
  },
];

const REVIEW_ONLY_CONTROLS: CommandCard[] = [
  {
    title: "Audit Logs",
    description: "Review sensitive platform activity. No delete controls belong here.",
    to: "/super-admin/audit",
    primaryAction: "View Audit Logs",
    tone: "warning",
    controls: [
      "Search audit logs",
      "Filter actions",
      "View details",
      "Export logs",
      "No delete",
    ],
  },
  {
    title: "Revenue Dashboard",
    description: "Review platform revenue and financial metrics.",
    to: "/super-admin/revenue",
    primaryAction: "View Revenue",
    tone: "warning",
    controls: [
      "Filter by period",
      "Refresh",
      "Export report later",
      "No edit/delete",
    ],
  },
  {
    title: "System Health",
    description: "Review API, database, provider, and runtime health.",
    to: "/super-admin/system",
    primaryAction: "View System Health",
    tone: "warning",
    controls: [
      "Refresh",
      "Review warnings",
      "Export diagnostics later",
      "No add/edit/delete",
    ],
  },
];

function CommandCardView({ card }: { card: CommandCard }) {
  return (
    <article className={`super-admin-command-card ${card.tone || "standard"}`}>
      <div>
        <div className="super-admin-control-kicker">Super Admin Control</div>
        <h3 className="super-admin-command-title">{card.title}</h3>
        <p className="super-admin-command-description">{card.description}</p>
      </div>

      <ul className="super-admin-command-list">
        {card.controls.map((control) => (
          <li key={control}>{control}</li>
        ))}
      </ul>

      <Link className={card.tone === "primary" ? "btn btn-primary" : "btn btn-secondary"} to={card.to}>
        {card.primaryAction}
      </Link>
    </article>
  );
}

export default function SuperAdminOverviewPage() {
  return (
    <AdminPageShell
      title="Platform Control"
      subtitle="Control users, shops, plans, billing, settings, and platform oversight from one place."
      actions={
        <div className="admin-action-row">
          <Link className="btn btn-secondary" to="/super-admin/system">
            System Health
          </Link>
          <Link className="btn btn-secondary" to="/super-admin/audit">
            Audit Logs
          </Link>
          <Link className="btn btn-secondary" to="/super-admin/revenue">
            Revenue
          </Link>
        </div>
      }
    >
      <section className="super-admin-control-panel">
        <div className="super-admin-control-header">
          <div>
            <div className="super-admin-control-kicker">Super Admin Command Center</div>
            <h2 className="super-admin-control-title">Platform Control Command Center</h2>
            <p className="super-admin-control-subtitle">
              This is your control hub. Jump directly into the pages where you can search,
              add, edit, disable, delete/restore, review, export, and govern marketplace records.
            </p>
          </div>

          <div className="super-admin-control-actions">
            <Link className="btn btn-primary" to="/super-admin/users">
              Search / Add / Edit Users
            </Link>
            <Link className="btn btn-primary" to="/super-admin/shops">
              Search / Add / Edit Shops
            </Link>
            <Link className="btn btn-primary" to="/super-admin/inventory">
              Search / Edit / Moderate Inventory
            </Link>
          </div>
        </div>

        <ul className="super-admin-control-list">
          <li>Users: add users, edit roles, activate/deactivate accounts, and export users.</li>
          <li>Shops: add shops, edit shop details, reassign owners, update plan/status, disable/restore shops.</li>
          <li>Inventory: search listings, edit price/category/status, and delete/restore marketplace listings.</li>
          <li>Audit, revenue, and system health are review-only areas with search, refresh, view, and export controls.</li>
        </ul>
      </section>

      <section className="page-card">
        <div className="toolbar">
          <div>
            <h2 className="section-title">Primary Control Surfaces</h2>
            <p className="section-subtitle">
              These are the pages where Super Admin has direct add/edit/moderation controls.
            </p>
          </div>
        </div>

        <div className="super-admin-command-grid">
          {PRIMARY_CONTROLS.map((card) => (
            <CommandCardView key={card.title} card={card} />
          ))}
        </div>
      </section>

      <section className="page-card">
        <div className="toolbar">
          <div>
            <h2 className="section-title">Operations & Governance</h2>
            <p className="section-subtitle">
              These areas need search, review, export, and controlled operational actions.
            </p>
          </div>
        </div>

        <div className="super-admin-command-grid">
          {OPERATIONS_CONTROLS.map((card) => (
            <CommandCardView key={card.title} card={card} />
          ))}
        </div>
      </section>

      <section className="page-card">
        <div className="toolbar">
          <div>
            <h2 className="section-title">Review-Only Surfaces</h2>
            <p className="section-subtitle">
              These pages should not have destructive add/edit/delete controls.
            </p>
          </div>
        </div>

        <div className="super-admin-command-grid">
          {REVIEW_ONLY_CONTROLS.map((card) => (
            <CommandCardView key={card.title} card={card} />
          ))}
        </div>
      </section>
    </AdminPageShell>
  );
}
