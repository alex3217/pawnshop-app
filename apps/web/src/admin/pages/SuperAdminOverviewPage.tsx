import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { api } from "../../services/apiClient";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function readNumber(source: unknown, paths: string[], fallback = 0) {
  const root = asRecord(source);

  for (const path of paths) {
    const value = path.split(".").reduce<unknown>((current, key) => {
      if (!current || typeof current !== "object") return undefined;
      return (current as UnknownRecord)[key];
    }, root);

    if (typeof value === "number" && Number.isFinite(value)) return value;

    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return fallback;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function KpiCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string | number;
  helper: string;
}) {
  return (
    <div style={styles.kpiCard}>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={styles.kpiValue}>{value}</div>
      <div style={styles.kpiHelper}>{helper}</div>
    </div>
  );
}

function QuickLink({
  to,
  title,
  body,
}: {
  to: string;
  title: string;
  body: string;
}) {
  return (
    <Link to={to} style={styles.quickLink}>
      <span style={styles.quickTitle}>{title}</span>
      <span style={styles.quickBody}>{body}</span>
    </Link>
  );
}

export default function SuperAdminOverviewPage() {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadOverview() {
    setLoading(true);
    setError("");

    try {
      const response = await api.get<unknown>("/super-admin/overview");
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Super Admin overview.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOverview();
  }, []);

  const stats = useMemo(() => {
    const users = readNumber(data, [
      "users.total",
      "totals.users",
      "counts.users",
      "users",
      "totalUsers",
    ]);

    const shops = readNumber(data, [
      "shops.total",
      "totals.shops",
      "counts.shops",
      "shops",
      "totalShops",
    ]);

    const inventory = readNumber(data, [
      "inventory.total",
      "items.total",
      "totals.inventory",
      "counts.inventory",
      "totalItems",
    ]);

    const liveAuctions = readNumber(data, [
      "auctions.live",
      "liveAuctions",
      "totals.liveAuctions",
      "counts.liveAuctions",
    ]);

    const pendingSettlements = readNumber(data, [
      "settlements.pending",
      "pendingSettlements",
      "totals.pendingSettlements",
      "counts.pendingSettlements",
    ]);

    const revenue = readNumber(data, [
      "revenue.total",
      "revenue.gross",
      "totals.revenue",
      "grossRevenue",
      "totalRevenue",
    ]);

    return {
      users,
      shops,
      inventory,
      liveAuctions,
      pendingSettlements,
      revenue,
    };
  }, [data]);

  return (
    <div style={styles.page}>
      <section style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>Super Admin Command Center</div>
          <h1 style={styles.title}>Platform Control</h1>
          <p style={styles.subtitle}>
            Monitor users, shops, plans, subscriptions, revenue, settlements, and
            platform settings from one clean workspace.
          </p>
        </div>

        <button type="button" className="btn btn-secondary" onClick={loadOverview}>
          Refresh
        </button>
      </section>

      {error ? (
        <div style={styles.error}>
          <strong>Unable to load overview.</strong>
          <span>{error}</span>
        </div>
      ) : null}

      {loading ? (
        <div style={styles.card}>Loading Super Admin overview...</div>
      ) : (
        <>
          <section style={styles.kpiGrid}>
            <KpiCard label="Users" value={stats.users} helper="Registered platform accounts" />
            <KpiCard label="Shops" value={stats.shops} helper="Marketplace shop records" />
            <KpiCard label="Inventory" value={stats.inventory} helper="Listings across shops" />
            <KpiCard label="Live Auctions" value={stats.liveAuctions} helper="Currently active auctions" />
            <KpiCard label="Pending Settlements" value={stats.pendingSettlements} helper="Settlement actions pending" />
            <KpiCard label="Revenue" value={formatCurrency(stats.revenue)} helper="Platform revenue snapshot" />
          </section>

          <section style={styles.section}>
            <div>
              <h2 style={styles.sectionTitle}>Quick Actions</h2>
              <p style={styles.sectionSubtitle}>
                Jump directly into the most important platform controls.
              </p>
            </div>

            <div style={styles.quickGrid}>
              <QuickLink
                to="/super-admin/users"
                title="Users & Roles"
                body="Review users, roles, access, and account status."
              />
              <QuickLink
                to="/super-admin/shops"
                title="Shop Management"
                body="Review shops, owners, status, and plan assignments."
              />
              <QuickLink
                to="/super-admin/inventory"
                title="Inventory Control"
                body="Inspect marketplace listings and item visibility."
              />
              <QuickLink
                to="/super-admin/buyer-subscriptions"
                title="Buyer Subscriptions"
                body="Manage buyer plans, intervals, and renewal state."
              />
              <QuickLink
                to="/super-admin/settlements"
                title="Settlement Control"
                body="Review settlement status and payment state."
              />
              <QuickLink
                to="/super-admin/platform-settings"
                title="Platform Settings"
                body="Manage feature flags and marketplace configuration."
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    display: "grid",
    gap: 18,
  },
  hero: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    padding: 22,
    borderRadius: 20,
    border: "1px solid rgba(129, 140, 248, 0.22)",
    background:
      "linear-gradient(135deg, rgba(79,70,229,0.24), rgba(15,23,42,0.82))",
  },
  eyebrow: {
    color: "#a5b4fc",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  title: {
    margin: "8px 0 0",
    color: "#ffffff",
    fontSize: 32,
    fontWeight: 900,
    letterSpacing: "-0.04em",
  },
  subtitle: {
    margin: "8px 0 0",
    maxWidth: 760,
    color: "#cbd5e1",
    lineHeight: 1.55,
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 14,
  },
  kpiCard: {
    padding: 18,
    borderRadius: 18,
    border: "1px solid rgba(148, 163, 184, 0.18)",
    background: "rgba(15, 23, 42, 0.78)",
  },
  kpiLabel: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  kpiValue: {
    marginTop: 8,
    color: "#ffffff",
    fontSize: 30,
    fontWeight: 900,
  },
  kpiHelper: {
    marginTop: 5,
    color: "#94a3b8",
    fontSize: 12,
  },
  section: {
    display: "grid",
    gap: 14,
    padding: 20,
    borderRadius: 20,
    border: "1px solid rgba(148, 163, 184, 0.16)",
    background: "rgba(2, 6, 23, 0.48)",
  },
  sectionTitle: {
    margin: 0,
    color: "#ffffff",
    fontSize: 20,
    fontWeight: 900,
  },
  sectionSubtitle: {
    margin: "4px 0 0",
    color: "#94a3b8",
  },
  quickGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  quickLink: {
    display: "grid",
    gap: 6,
    padding: 16,
    borderRadius: 16,
    border: "1px solid rgba(129, 140, 248, 0.22)",
    background: "rgba(30, 41, 59, 0.58)",
    color: "#dbeafe",
    textDecoration: "none",
  },
  quickTitle: {
    color: "#ffffff",
    fontWeight: 900,
  },
  quickBody: {
    color: "#94a3b8",
    fontSize: 13,
    lineHeight: 1.45,
  },
  card: {
    padding: 18,
    borderRadius: 16,
    background: "rgba(15,23,42,0.72)",
    border: "1px solid rgba(148,163,184,0.18)",
    color: "#e2e8f0",
  },
  error: {
    display: "grid",
    gap: 4,
    padding: 16,
    borderRadius: 16,
    color: "#fecaca",
    background: "rgba(239, 68, 68, 0.1)",
    border: "1px solid rgba(239, 68, 68, 0.22)",
  },
};
