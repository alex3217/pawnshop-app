import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import AdminPageShell from "../components/AdminPageShell";
import { adminApi } from "../services/adminApi";
import "../../styles/admin-overview-readability.css";

type AnyRow = Record<string, unknown>;

type DashboardState = {
  users: AnyRow[];
  items: AnyRow[];
  shops: AnyRow[];
  auctions: AnyRow[];
  settlements: AnyRow[];
  coreErrors: string[];
  optionalNotes: string[];
};

const EMPTY_STATE: DashboardState = {
  users: [],
  items: [],
  shops: [],
  auctions: [],
  settlements: [],
  coreErrors: [],
  optionalNotes: [],
};

function asRows<T>(value: T[] | unknown): AnyRow[] {
  return Array.isArray(value) ? (value as AnyRow[]) : [];
}

function getString(row: AnyRow, key: string, fallback = "—") {
  const value = row[key];
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function getNestedString(row: AnyRow, key: string, nestedKey: string, fallback = "—") {
  const nested = row[key];
  if (!nested || typeof nested !== "object") return fallback;

  const value = (nested as AnyRow)[nestedKey];
  if (value === null || value === undefined || value === "") return fallback;

  return String(value);
}

function getStatus(row: AnyRow) {
  return getString(row, "status", getString(row, "subscriptionStatus", "UNKNOWN"));
}

function isDeleted(row: AnyRow) {
  return Boolean(row.isDeleted);
}

function isInactiveUser(row: AnyRow) {
  return row.isActive === false || row.isBlocked === true;
}

function formatDate(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function formatMoney(value: unknown, currency = "USD") {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(number);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load";
}

function statusTone(value?: string | null): "green" | "red" | "yellow" | "blue" | "muted" {
  const normalized = String(value || "").toUpperCase();

  if (["ACTIVE", "AVAILABLE", "LIVE", "ACCEPTED", "COMPLETED", "CHARGED"].includes(normalized)) {
    return "green";
  }

  if (["FAILED", "CANCELED", "DELETED", "BLOCKED", "INACTIVE", "PAST_DUE"].includes(normalized)) {
    return "red";
  }

  if (["PENDING", "COUNTERED", "TRIALING", "PAUSED"].includes(normalized)) {
    return "yellow";
  }

  if (["OPEN", "REVIEW"].includes(normalized)) {
    return "blue";
  }

  return "muted";
}

function ResultBadge({ value }: { value: string }) {
  return <span style={{ ...styles.badge, ...badgeToneStyles[statusTone(value)] }}>{value}</span>;
}

function MetricCard({
  label,
  value,
  helper,
  to,
  tone = "blue",
}: {
  label: string;
  value: string | number;
  helper: string;
  to?: string;
  tone?: "blue" | "green" | "yellow" | "red" | "purple";
}) {
  const content = (
    <div style={styles.metricCard}>
      <div style={{ ...styles.metricIcon, ...metricToneStyles[tone] }} />
      <div style={styles.metricValue}>{value}</div>
      <div style={styles.metricLabel}>{label}</div>
      <div style={styles.metricHelper}>{helper}</div>
    </div>
  );

  if (!to) return content;

  return (
    <Link to={to} style={styles.cardLink}>
      {content}
    </Link>
  );
}

function QueueCard({
  title,
  value,
  description,
  to,
  tone = "neutral",
}: {
  title: string;
  value: string | number;
  description: string;
  to: string;
  tone?: "neutral" | "warning" | "danger" | "success";
}) {
  return (
    <Link to={to} style={{ ...styles.queueCard, ...queueToneStyles[tone] }}>
      <div style={styles.queueHeader}>
        <div>
          <div style={styles.queueTitle}>{title}</div>
          <div style={styles.queueDescription}>{description}</div>
        </div>
        <div style={styles.queueValue}>{value}</div>
      </div>
    </Link>
  );
}

function MiniTable({
  title,
  rows,
  empty,
  to,
  columns,
}: {
  title: string;
  rows: AnyRow[];
  empty: string;
  to: string;
  columns: Array<{
    key: string;
    label: string;
    render: (row: AnyRow) => ReactNode;
  }>;
}) {
  return (
    <section style={styles.tableCard}>
      <div style={styles.tableHeader}>
        <h3 style={styles.tableTitle}>{title}</h3>
        <Link to={to} style={styles.viewAllLink}>
          View all
        </Link>
      </div>

      <div style={styles.tableScroller}>
        <table style={styles.table}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} style={styles.th}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={styles.emptyCell}>
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={String(row.id || index)}>
                  {columns.map((column) => (
                    <td key={column.key} style={styles.td}>
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function AdminOverviewPage() {
  const [state, setState] = useState<DashboardState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);

    const coreErrors: string[] = [];
    const optionalNotes: string[] = [];

    const [
      usersResult,
      itemsResult,
      shopsResult,
      auctionsResult,
      settlementsResult,
    ] = await Promise.allSettled([
      adminApi.getUsers(),
      adminApi.getItems(),
      adminApi.getShops(),
      adminApi.getAuctions("ALL"),
      adminApi.getSettlements(),
    ]);

    function readCore<T>(result: PromiseSettledResult<T>, fallback: T, label: string): T {
      if (result.status === "fulfilled") return result.value;
      coreErrors.push(`${label}: ${getErrorMessage(result.reason)}`);
      return fallback;
    }

    function readOptional<T>(result: PromiseSettledResult<T>, fallback: T, label: string): T {
      if (result.status === "fulfilled") return result.value;

      const message = getErrorMessage(result.reason);

      if (message.toLowerCase().includes("forbidden")) {
        optionalNotes.push(`${label} data requires elevated access. Showing available admin-safe panels.`);
      } else {
        optionalNotes.push(`${label}: ${message}`);
      }

      return fallback;
    }

    setState({
      users: asRows(readCore(usersResult, [], "Users")),
      items: asRows(readCore(itemsResult, [], "Inventory")),
      shops: asRows(readCore(shopsResult, [], "Shops")),
      auctions: asRows(readCore(auctionsResult, [], "Auctions")),
      settlements: asRows(readOptional(settlementsResult, [], "Settlements")),
      coreErrors,
      optionalNotes,
    });

    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const derived = useMemo(() => {
    const owners = state.users.filter((row) => getString(row, "role", "").toUpperCase() === "OWNER");
    const consumers = state.users.filter((row) => getString(row, "role", "").toUpperCase() === "CONSUMER");
    const admins = state.users.filter((row) =>
      ["ADMIN", "SUPER_ADMIN"].includes(getString(row, "role", "").toUpperCase()),
    );
    const deletedItems = state.items.filter(isDeleted);
    const inactiveUsers = state.users.filter(isInactiveUser);
    const deletedShops = state.shops.filter(isDeleted);
    const liveAuctions = state.auctions.filter((row) => getStatus(row).toUpperCase() === "LIVE");
    const failedSettlements = state.settlements.filter((row) =>
      ["FAILED", "PAST_DUE", "CANCELED"].includes(getStatus(row).toUpperCase()),
    );

    return {
      owners,
      consumers,
      admins,
      deletedItems,
      inactiveUsers,
      deletedShops,
      liveAuctions,
      failedSettlements,
      recentUsers: state.users.slice(0, 6),
      recentShops: state.shops.slice(0, 6),
      recentItems: state.items.slice(0, 6),
      recentAuctions: state.auctions.slice(0, 6),
      recentSettlements: state.settlements.slice(0, 6),
    };
  }, [state]);

  return (
    <AdminPageShell
      title="Admin Command Center"
      subtitle="Daily marketplace operations for users, shops, items, inventory, auctions, settlements, and support workflows."
      actions={
        <button className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      }
    >
      <div className="admin-overview-readability" style={styles.stack}>
        {state.coreErrors.length ? (
          <div style={{ ...styles.notice, ...styles.errorNotice }}>
            <div style={styles.noticeTitle}>Core admin panels could not load.</div>
            <ul style={styles.noticeList}>
              {state.coreErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {state.optionalNotes.length ? (
          <div style={{ ...styles.notice, ...styles.infoNotice }}>
            <div style={styles.noticeTitle}>Admin data availability</div>
            <ul style={styles.noticeList}>
              {[...new Set(state.optionalNotes)].map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <div>
              <h2 style={styles.sectionTitle}>Operations Overview</h2>
              <p style={styles.sectionSubtitle}>Fast view of marketplace users, owners, shops, items, inventory listings, and auctions.</p>
            </div>
          </div>

          <div style={styles.metricGrid}>
            <MetricCard label="Users" value={state.users.length} helper="All platform accounts" to="/admin/users" tone="blue" />
            <MetricCard label="Owners" value={derived.owners.length} helper="Shop owner accounts" to="/admin/owners" tone="purple" />
            <MetricCard label="Consumers" value={derived.consumers.length} helper="Buyer accounts" to="/admin/users" tone="green" />
            <MetricCard label="Admins" value={derived.admins.length} helper="Admin-level accounts" to="/admin/users" tone="yellow" />
            <MetricCard label="Shops" value={state.shops.length} helper="Marketplace shops" to="/admin/shops" tone="blue" />
            <MetricCard label="Items / Inventory" value={state.items.length} helper="Marketplace item listings" to="/admin/inventory" tone="green" />
            <MetricCard label="Live Auctions" value={derived.liveAuctions.length} helper="Currently active auctions" to="/admin/auctions" tone="purple" />
            <MetricCard label="Settlements" value={state.settlements.length} helper="Payment records visible to admin" to="/admin/orders" tone="yellow" />
          </div>
        </section>

        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <div>
              <h2 style={styles.sectionTitle}>Operational Queues</h2>
              <p style={styles.sectionSubtitle}>Prioritized areas that may need marketplace operator attention.</p>
            </div>
          </div>

          <div style={styles.queueGrid}>
            <QueueCard
              title="Items / Inventory Moderation"
              value={derived.deletedItems.length}
              description="Deleted or moderated marketplace item listings."
              to="/admin/inventory"
              tone={derived.deletedItems.length ? "warning" : "success"}
            />
            <QueueCard
              title="User Review"
              value={derived.inactiveUsers.length}
              description="Inactive or blocked user accounts."
              to="/admin/users"
              tone={derived.inactiveUsers.length ? "warning" : "success"}
            />
            <QueueCard
              title="Shop Review"
              value={derived.deletedShops.length}
              description="Disabled or archived shop records."
              to="/admin/shops"
              tone={derived.deletedShops.length ? "warning" : "success"}
            />
            <QueueCard
              title="Auction Queue"
              value={derived.liveAuctions.length}
              description="Live auctions needing operational awareness."
              to="/admin/auctions"
            />
            <QueueCard
              title="Payment Issues"
              value={derived.failedSettlements.length}
              description="Failed or canceled settlement records."
              to="/admin/orders"
              tone={derived.failedSettlements.length ? "danger" : "success"}
            />
            <QueueCard
              title="Risk & Support"
              value="Open"
              description="Disputes, risk review, and support workflows."
              to="/admin/risk"
            />
          </div>
        </section>

        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <div>
              <h2 style={styles.sectionTitle}>Quick Actions</h2>
              <p style={styles.sectionSubtitle}>Jump into the most common admin workflows.</p>
            </div>
          </div>

          <div style={styles.actionGrid}>
            <Link style={styles.actionButton} to="/admin/users">Manage Users</Link>
            <Link style={styles.actionButton} to="/admin/owners">Review Owners</Link>
            <Link style={styles.actionButton} to="/admin/shops">Manage Shops</Link>
            <Link style={styles.actionButton} to="/admin/inventory">Moderate Items / Inventory</Link>
            <Link style={styles.actionButton} to="/admin/auctions">Review Auctions</Link>
            <Link style={styles.actionButton} to="/admin/offers">Manage Offers</Link>
            <Link style={styles.actionButton} to="/admin/orders">Settlement Queue</Link>
            <Link style={styles.actionButton} to="/admin/subscriptions">Subscriptions</Link>
            <Link style={styles.actionButton} to="/admin/support">Support Center</Link>
            <Link style={styles.actionButton} to="/admin/risk">Risk Center</Link>
            <Link style={styles.actionButton} to="/admin/audit">Audit Review</Link>
            <Link style={styles.actionButton} to="/admin/system">System Status</Link>
          </div>
        </section>

        <div style={styles.tableGrid}>
          <MiniTable
            title="Recent Users"
            rows={derived.recentUsers}
            empty="No users found."
            to="/admin/users"
            columns={[
              {
                key: "user",
                label: "User",
                render: (row) => (
                  <div>
                    <div style={styles.primaryText}>{getString(row, "email")}</div>
                    <div style={styles.secondaryText}>{getString(row, "name", "Unnamed user")}</div>
                  </div>
                ),
              },
              { key: "role", label: "Role", render: (row) => <ResultBadge value={getString(row, "role", "UNKNOWN")} /> },
              { key: "status", label: "Status", render: (row) => <ResultBadge value={isInactiveUser(row) ? "INACTIVE" : "ACTIVE"} /> },
              { key: "created", label: "Created", render: (row) => formatDate(row.createdAt) },
            ]}
          />

          <MiniTable
            title="Recent Shops"
            rows={derived.recentShops}
            empty="No shops found."
            to="/admin/shops"
            columns={[
              {
                key: "shop",
                label: "Shop",
                render: (row) => (
                  <div>
                    <div style={styles.primaryText}>{getString(row, "name")}</div>
                    <div style={styles.secondaryText}>{getString(row, "ownerEmail")}</div>
                  </div>
                ),
              },
              { key: "phone", label: "Phone", render: (row) => getString(row, "phone") },
              { key: "status", label: "Status", render: (row) => <ResultBadge value={isDeleted(row) ? "DELETED" : "ACTIVE"} /> },
              { key: "created", label: "Created", render: (row) => formatDate(row.createdAt) },
            ]}
          />

          <MiniTable
            title="Recent Items / Inventory"
            rows={derived.recentItems}
            empty="No items or inventory found."
            to="/admin/inventory"
            columns={[
              {
                key: "item",
                label: "Item",
                render: (row) => (
                  <div>
                    <div style={styles.primaryText}>{getString(row, "title")}</div>
                    <div style={styles.secondaryText}>{getNestedString(row, "shop", "name", "Unknown shop")}</div>
                  </div>
                ),
              },
              { key: "price", label: "Price", render: (row) => formatMoney(row.price, getString(row, "currency", "USD")) },
              { key: "status", label: "Status", render: (row) => <ResultBadge value={isDeleted(row) ? "DELETED" : getStatus(row)} /> },
              { key: "created", label: "Created", render: (row) => formatDate(row.createdAt) },
            ]}
          />

          <MiniTable
            title="Recent Auctions"
            rows={derived.recentAuctions}
            empty="No auctions found."
            to="/admin/auctions"
            columns={[
              { key: "auction", label: "Auction", render: (row) => getString(row, "title", getString(row, "id")) },
              { key: "status", label: "Status", render: (row) => <ResultBadge value={getStatus(row)} /> },
              { key: "currentBid", label: "Current", render: (row) => formatMoney(row.currentBidCents ? Number(row.currentBidCents) / 100 : row.currentBid) },
              { key: "created", label: "Created", render: (row) => formatDate(row.createdAt) },
            ]}
          />

          <MiniTable
            title="Recent Settlements"
            rows={derived.recentSettlements}
            empty="Settlement data is not available for this admin role yet."
            to="/admin/orders"
            columns={[
              { key: "id", label: "Settlement", render: (row) => getString(row, "id") },
              { key: "status", label: "Status", render: (row) => <ResultBadge value={getStatus(row)} /> },
              { key: "amount", label: "Amount", render: (row) => formatMoney(row.amountCents ? Number(row.amountCents) / 100 : row.amount) },
              { key: "created", label: "Created", render: (row) => formatDate(row.createdAt) },
            ]}
          />

          <section style={styles.notesCard}>
            <h3 style={styles.tableTitle}>Operational Notes</h3>
            <div style={styles.notesBody}>
              <p>
                Admin handles day-to-day marketplace operations. Super Admin handles platform governance,
                settings, system health, and sensitive ownership controls.
              </p>
              <p>
                Next recommended admin additions: real support tickets, risk review records, limited audit review,
                and settlement issue triage.
              </p>
            </div>
          </section>
        </div>
      </div>
    </AdminPageShell>
  );
}

const colors = {
  panel: "#111827",
  panelSoft: "#172033",
  panelBorder: "rgba(148, 163, 184, 0.22)",
  text: "#f8fafc",
  muted: "#aab6d3",
  faint: "#7f8ca8",
  blue: "#60a5fa",
  green: "#34d399",
  yellow: "#fbbf24",
  red: "#fb7185",
  purple: "#a78bfa",
};

const styles: Record<string, CSSProperties> = {
  stack: {
    display: "grid",
    gap: 20,
  },
  section: {
    border: `1px solid ${colors.panelBorder}`,
    borderRadius: 22,
    background: "linear-gradient(180deg, rgba(17,24,39,0.98), rgba(15,23,42,0.98))",
    padding: 20,
    boxShadow: "0 18px 45px rgba(0,0,0,0.20)",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    marginBottom: 16,
  },
  sectionTitle: {
    margin: 0,
    color: colors.text,
    fontSize: 18,
    fontWeight: 900,
  },
  sectionSubtitle: {
    margin: "4px 0 0",
    color: colors.muted,
    fontSize: 13,
    lineHeight: 1.5,
  },
  metricGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 14,
  },
  metricCard: {
    minHeight: 132,
    border: `1px solid ${colors.panelBorder}`,
    borderRadius: 18,
    background: "rgba(15,23,42,0.88)",
    padding: 16,
    display: "grid",
    alignContent: "start",
    gap: 6,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
  },
  metricIcon: {
    width: 34,
    height: 4,
    borderRadius: 999,
    marginBottom: 8,
  },
  metricValue: {
    color: colors.text,
    fontSize: 30,
    lineHeight: 1,
    fontWeight: 950,
    letterSpacing: "-0.04em",
  },
  metricLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: 850,
  },
  metricHelper: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 1.35,
  },
  cardLink: {
    color: "inherit",
    textDecoration: "none",
  },
  queueGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 14,
  },
  queueCard: {
    borderRadius: 18,
    border: `1px solid ${colors.panelBorder}`,
    padding: 16,
    textDecoration: "none",
    color: colors.text,
    display: "block",
    minHeight: 112,
    background: "rgba(15,23,42,0.88)",
  },
  queueHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
  },
  queueTitle: {
    fontWeight: 900,
    color: colors.text,
    marginBottom: 6,
  },
  queueDescription: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 1.45,
  },
  queueValue: {
    color: colors.text,
    fontSize: 24,
    fontWeight: 950,
  },
  actionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
  },
  actionButton: {
    border: `1px solid ${colors.panelBorder}`,
    borderRadius: 14,
    background: "rgba(30,41,59,0.82)",
    color: colors.text,
    padding: "12px 14px",
    fontWeight: 850,
    textDecoration: "none",
    textAlign: "center",
  },
  tableGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
    gap: 16,
  },
  tableCard: {
    overflow: "hidden",
    border: `1px solid ${colors.panelBorder}`,
    borderRadius: 20,
    background: "rgba(15,23,42,0.92)",
    boxShadow: "0 16px 40px rgba(0,0,0,0.18)",
  },
  tableHeader: {
    borderBottom: `1px solid ${colors.panelBorder}`,
    background: "rgba(30,41,59,0.68)",
    padding: "14px 16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  tableTitle: {
    margin: 0,
    color: colors.text,
    fontSize: 15,
    fontWeight: 900,
  },
  viewAllLink: {
    color: "#bfdbfe",
    fontSize: 13,
    fontWeight: 850,
    textDecoration: "none",
  },
  tableScroller: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    minWidth: 620,
    borderCollapse: "collapse",
    fontSize: 13,
  },
  th: {
    color: colors.muted,
    fontWeight: 850,
    padding: "12px 14px",
    borderBottom: `1px solid ${colors.panelBorder}`,
    textAlign: "left",
    whiteSpace: "nowrap",
  },
  td: {
    color: "#e5e7eb",
    padding: "12px 14px",
    borderBottom: "1px solid rgba(148,163,184,0.12)",
    verticalAlign: "top",
  },
  emptyCell: {
    color: colors.muted,
    padding: 18,
    textAlign: "center",
  },
  primaryText: {
    color: colors.text,
    fontWeight: 800,
  },
  secondaryText: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "4px 9px",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: "0.02em",
  },
  notice: {
    borderRadius: 18,
    border: `1px solid ${colors.panelBorder}`,
    padding: 16,
  },
  noticeTitle: {
    fontWeight: 900,
    marginBottom: 8,
  },
  noticeList: {
    margin: 0,
    paddingLeft: 18,
    lineHeight: 1.6,
  },
  errorNotice: {
    background: "rgba(127,29,29,0.22)",
    color: "#fecaca",
    borderColor: "rgba(248,113,113,0.32)",
  },
  infoNotice: {
    background: "rgba(30,64,175,0.18)",
    color: "#bfdbfe",
    borderColor: "rgba(96,165,250,0.30)",
  },
  notesCard: {
    border: `1px solid ${colors.panelBorder}`,
    borderRadius: 20,
    background: "rgba(15,23,42,0.92)",
    padding: 18,
    boxShadow: "0 16px 40px rgba(0,0,0,0.18)",
  },
  notesBody: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 1.6,
    display: "grid",
    gap: 8,
    marginTop: 12,
  },
};

const metricToneStyles: Record<string, CSSProperties> = {
  blue: { background: colors.blue },
  green: { background: colors.green },
  yellow: { background: colors.yellow },
  red: { background: colors.red },
  purple: { background: colors.purple },
};

const queueToneStyles: Record<string, CSSProperties> = {
  neutral: {
    background: "rgba(15,23,42,0.88)",
    borderColor: colors.panelBorder,
  },
  success: {
    background: "rgba(6,78,59,0.20)",
    borderColor: "rgba(52,211,153,0.30)",
  },
  warning: {
    background: "rgba(113,63,18,0.22)",
    borderColor: "rgba(251,191,36,0.32)",
  },
  danger: {
    background: "rgba(127,29,29,0.22)",
    borderColor: "rgba(251,113,133,0.34)",
  },
};

const badgeToneStyles: Record<string, CSSProperties> = {
  green: {
    background: "rgba(6,78,59,0.32)",
    color: "#86efac",
  },
  red: {
    background: "rgba(127,29,29,0.32)",
    color: "#fecaca",
  },
  yellow: {
    background: "rgba(113,63,18,0.32)",
    color: "#fde68a",
  },
  blue: {
    background: "rgba(30,64,175,0.32)",
    color: "#bfdbfe",
  },
  muted: {
    background: "rgba(100,116,139,0.24)",
    color: "#cbd5e1",
  },
};
