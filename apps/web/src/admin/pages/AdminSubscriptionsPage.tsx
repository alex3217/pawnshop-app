// File: apps/web/src/admin/pages/AdminSubscriptionsPage.tsx

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { adminApi, type AdminShopRow } from "../services/adminApi";

type AdminSubscriptionRecord = {
  id: string;
  shopName: string;
  ownerName: string;
  plan: string;
  status: string;
  interval: string;
  currentPeriodEnd: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function normalizePlan(value: string | null | undefined) {
  return String(value || "FREE").trim().toUpperCase();
}

function normalizeStatus(value: string | null | undefined) {
  const normalized = String(value || "UNKNOWN").trim().toUpperCase();
  return normalized || "UNKNOWN";
}

function normalizeSubscription(
  shop: AdminShopRow,
  index: number,
): AdminSubscriptionRecord {
  return {
    id: String(shop.id || `subscription-${index}`),
    shopName: String(shop.name || `Shop ${index + 1}`),
    ownerName: String(shop.ownerName || shop.ownerEmail || "Unknown owner"),
    plan: normalizePlan(shop.subscriptionPlan),
    status: normalizeStatus(shop.subscriptionStatus),
    interval: "MONTHLY",
    currentPeriodEnd: shop.subscriptionCurrentPeriodEnd || null,
    stripeCustomerId: shop.stripeCustomerId || null,
    stripeSubscriptionId: shop.stripeSubscriptionId || null,
  };
}

function sortSubscriptions(items: AdminSubscriptionRecord[]) {
  return [...items].sort((a, b) => {
    const aTime = a.currentPeriodEnd ? new Date(a.currentPeriodEnd).getTime() : 0;
    const bTime = b.currentPeriodEnd ? new Date(b.currentPeriodEnd).getTime() : 0;
    return bTime - aTime;
  });
}

async function fetchAdminSubscriptions(
  signal?: AbortSignal,
): Promise<AdminSubscriptionRecord[]> {
  const shops = await adminApi.getShops(signal);
  return sortSubscriptions(shops.map(normalizeSubscription));
}

export default function AdminSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<AdminSubscriptionRecord[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [planFilter, setPlanFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const load = useCallback(
    async (
      mode: "initial" | "refresh" = "initial",
      signal?: AbortSignal,
    ) => {
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);

      setError("");

      try {
        const data = await fetchAdminSubscriptions(signal);
        setSubscriptions(data);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof Error ? err.message : "Failed to load subscriptions.",
        );
      } finally {
        if (mode === "refresh") setRefreshing(false);
        else setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load("initial", controller.signal);
    return () => controller.abort();
  }, [load]);

  const filtered = useMemo(() => {
    return subscriptions.filter((item) => {
      const planOk = planFilter === "ALL" || item.plan === planFilter;
      const statusOk = statusFilter === "ALL" || item.status === statusFilter;
      return planOk && statusOk;
    });
  }, [planFilter, statusFilter, subscriptions]);

  const summary = useMemo(() => {
    const byPlan = subscriptions.reduce<Record<string, number>>((acc, item) => {
      acc[item.plan] = (acc[item.plan] || 0) + 1;
      return acc;
    }, {});

    return {
      total: subscriptions.length,
      active: subscriptions.filter((item) => item.status === "ACTIVE").length,
      free: byPlan.FREE || 0,
      paid: subscriptions.filter((item) => item.plan !== "FREE").length,
      pastDue: subscriptions.filter((item) => item.status === "PAST_DUE").length,
    };
  }, [subscriptions]);

  const availablePlans = useMemo(
    () => ["ALL", ...Array.from(new Set(subscriptions.map((item) => item.plan)))],
    [subscriptions],
  );

  const availableStatuses = useMemo(
    () => [
      "ALL",
      ...Array.from(new Set(subscriptions.map((item) => item.status))),
    ],
    [subscriptions],
  );

  return (
    <div style={styles.page}>
      <div style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>Admin</div>
          <h1 style={styles.title}>Subscriptions</h1>
          <p style={styles.subtitle}>
            Monitor seller plan coverage, billing status, Stripe references, and
            renewal timing.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load("refresh")}
          disabled={loading || refreshing}
          style={{
            ...styles.actionButton,
            ...(loading || refreshing ? styles.actionButtonDisabled : {}),
          }}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Total subscriptions</div>
          <div style={styles.statValue}>{summary.total}</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Active</div>
          <div style={styles.statValue}>{summary.active}</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Free plans</div>
          <div style={styles.statValue}>{summary.free}</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Paid plans</div>
          <div style={styles.statValue}>{summary.paid}</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Past due</div>
          <div style={styles.statValue}>{summary.pastDue}</div>
        </div>
      </div>

      <div style={styles.filterCard}>
        <label style={styles.filterLabel}>
          Plan
          <select
            value={planFilter}
            onChange={(event) => setPlanFilter(event.target.value)}
            style={styles.select}
          >
            {availablePlans.map((plan) => (
              <option key={plan} value={plan}>
                {plan}
              </option>
            ))}
          </select>
        </label>

        <label style={styles.filterLabel}>
          Status
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            style={styles.select}
          >
            {availableStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <div style={styles.stateCard}>Loading subscriptions...</div>
      ) : error ? (
        <div style={styles.errorCard}>
          <div style={styles.emptyTitle}>Unable to load subscriptions</div>
          <p style={styles.emptyText}>{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={styles.stateCard}>
          <div style={styles.emptyTitle}>No subscriptions found</div>
          <p style={styles.emptyText}>
            No subscriptions matched the current filters.
          </p>
        </div>
      ) : (
        <div style={styles.list}>
          {filtered.map((subscription) => (
            <article key={subscription.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <div>
                  <h2 style={styles.cardTitle}>{subscription.shopName}</h2>
                  <div style={styles.metaRow}>
                    <span>{subscription.ownerName}</span>
                    <span>•</span>
                    <span>{subscription.interval}</span>
                  </div>
                </div>

                <div style={styles.statusPill}>{subscription.status}</div>
              </div>

              <div style={styles.detailGrid}>
                <div>
                  <div style={styles.detailLabel}>Plan</div>
                  <div style={styles.detailValue}>{subscription.plan}</div>
                </div>

                <div>
                  <div style={styles.detailLabel}>Current period end</div>
                  <div style={styles.detailValue}>
                    {formatDate(subscription.currentPeriodEnd)}
                  </div>
                </div>

                <div>
                  <div style={styles.detailLabel}>Stripe customer</div>
                  <div style={styles.detailValue}>
                    {subscription.stripeCustomerId || "—"}
                  </div>
                </div>

                <div>
                  <div style={styles.detailLabel}>Stripe subscription</div>
                  <div style={styles.detailValue}>
                    {subscription.stripeSubscriptionId || "—"}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { display: "grid", gap: 20 },
  hero: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    opacity: 0.72,
    marginBottom: 8,
  },
  title: {
    margin: 0,
    fontSize: "clamp(2rem, 4vw, 2.6rem)",
    fontWeight: 900,
  },
  subtitle: {
    margin: "10px 0 0",
    maxWidth: 760,
    color: "rgba(238,242,255,0.78)",
    lineHeight: 1.6,
  },
  actionButton: {
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "#eef2ff",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
  },
  actionButtonDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 16,
  },
  statCard: {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    padding: 18,
  },
  statLabel: {
    fontSize: 13,
    color: "rgba(238,242,255,0.7)",
    marginBottom: 8,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 900,
  },
  filterCard: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    padding: 16,
  },
  filterLabel: {
    display: "grid",
    gap: 8,
    fontSize: 13,
    fontWeight: 800,
    color: "rgba(238,242,255,0.78)",
  },
  select: {
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(15,23,42,0.9)",
    color: "#eef2ff",
    borderRadius: 12,
    padding: "10px 12px",
  },
  stateCard: {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    padding: 22,
  },
  errorCard: {
    border: "1px solid rgba(255,120,120,0.25)",
    background: "rgba(255,120,120,0.09)",
    color: "#ffd4d4",
    borderRadius: 18,
    padding: 22,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 800,
    marginBottom: 8,
  },
  emptyText: {
    margin: 0,
    color: "rgba(238,242,255,0.76)",
  },
  list: {
    display: "grid",
    gap: 16,
  },
  card: {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    padding: 20,
    display: "grid",
    gap: 18,
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  },
  cardTitle: {
    margin: 0,
    fontSize: 22,
    fontWeight: 800,
  },
  metaRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 8,
    color: "rgba(238,242,255,0.72)",
    fontSize: 14,
  },
  statusPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    padding: "10px 14px",
    background: "rgba(34,197,94,0.18)",
    border: "1px solid rgba(74,222,128,0.3)",
    fontWeight: 900,
  },
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
  },
  detailLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "rgba(238,242,255,0.6)",
    marginBottom: 6,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: 700,
    overflowWrap: "anywhere",
  },
};
