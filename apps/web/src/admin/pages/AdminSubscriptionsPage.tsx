// File: apps/web/src/admin/pages/AdminSubscriptionsPage.tsx

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { getAuthHeaders, getAuthToken } from "../../services/auth";

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

type ApiAdminSubscriptionRecord = Partial<{
  id: string;
  shopId: string;
  shopName: string;
  ownerName: string;
  owner: { name?: string };
  plan: string;
  subscriptionPlan: string;
  status: string;
  subscriptionStatus: string;
  interval: string;
  billingInterval: string;
  currentPeriodEnd: string;
  subscriptionCurrentPeriodEnd: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
}>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function normalizePlan(value: string | undefined) {
  return String(value || "FREE").trim().toUpperCase();
}

function normalizeStatus(value: string | undefined) {
  const normalized = String(value || "UNKNOWN").trim().toUpperCase();
  return normalized || "UNKNOWN";
}

function normalizeInterval(value: string | undefined) {
  const normalized = String(value || "MONTHLY").trim().toUpperCase();
  return normalized || "MONTHLY";
}

function normalizeSubscription(
  row: ApiAdminSubscriptionRecord,
  index: number,
): AdminSubscriptionRecord {
  return {
    id: String(row.id || row.shopId || `subscription-${index}`),
    shopName: String(row.shopName || `Shop ${index + 1}`),
    ownerName: String(row.ownerName || row.owner?.name || "Unknown owner"),
    plan: normalizePlan(row.plan || row.subscriptionPlan),
    status: normalizeStatus(row.status || row.subscriptionStatus),
    interval: normalizeInterval(row.interval || row.billingInterval),
    currentPeriodEnd:
      row.currentPeriodEnd || row.subscriptionCurrentPeriodEnd || null,
    stripeCustomerId: row.stripeCustomerId || null,
    stripeSubscriptionId: row.stripeSubscriptionId || null,
  };
}

function extractSubscriptionRows(
  payload: unknown,
): ApiAdminSubscriptionRecord[] {
  if (Array.isArray(payload)) return payload as ApiAdminSubscriptionRecord[];

  if (isObject(payload)) {
    if (Array.isArray(payload.data)) {
      return payload.data as ApiAdminSubscriptionRecord[];
    }
    if (Array.isArray(payload.subscriptions)) {
      return payload.subscriptions as ApiAdminSubscriptionRecord[];
    }
    if (Array.isArray(payload.items)) {
      return payload.items as ApiAdminSubscriptionRecord[];
    }
  }

  return [];
}

function extractMessage(payload: unknown) {
  if (isObject(payload) && typeof payload.message === "string") {
    return payload.message;
  }
  return null;
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
  const token = getAuthToken();
  if (!token) {
    throw new Error("Missing admin token. Please log in again.");
  }

  const candidates = [
    "/api/admin/subscriptions",
    "/api/subscriptions/admin",
    "/api/admin/shops/subscriptions",
    "/api/admin/owners/subscriptions",
  ];

  let lastError: unknown = null;

  for (const endpoint of candidates) {
    try {
      const response = await fetch(endpoint, {
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        credentials: "include",
        signal,
      });

      if (response.status === 404) {
        lastError = new Error(`Endpoint not found: ${endpoint}`);
        continue;
      }

      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          extractMessage(payload) || `Request failed (${response.status})`;
        throw new Error(message);
      }

      const rawList = extractSubscriptionRows(payload);

      return sortSubscriptions(
        rawList.map((row: ApiAdminSubscriptionRecord, index: number) =>
          normalizeSubscription(row, index),
        ),
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Unable to load admin subscriptions.");
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
            Track plan distribution, renewal state, and subscription health across
            shops.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void load("refresh")}
          disabled={loading || refreshing}
          style={{
            ...styles.secondaryButton,
            ...(loading || refreshing ? styles.buttonDisabled : {}),
          }}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Total shops tracked</div>
          <div style={styles.statValue}>{summary.total}</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Active subscriptions</div>
          <div style={styles.statValue}>{summary.active}</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Free plan</div>
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

      <div style={styles.filterBar}>
        <label style={styles.filterGroup}>
          <span style={styles.filterLabel}>Plan</span>
          <select
            value={planFilter}
            onChange={(event) => setPlanFilter(event.target.value)}
            style={styles.select}
          >
            {availablePlans.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label style={styles.filterGroup}>
          <span style={styles.filterLabel}>Status</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            style={styles.select}
          >
            {availableStatuses.map((value) => (
              <option key={value} value={value}>
                {value}
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
          No subscriptions matched the current filters.
        </div>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Shop</th>
                <th style={styles.th}>Owner</th>
                <th style={styles.th}>Plan</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Interval</th>
                <th style={styles.th}>Current period end</th>
                <th style={styles.th}>Stripe refs</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td style={styles.td}>{row.shopName}</td>
                  <td style={styles.td}>{row.ownerName}</td>
                  <td style={styles.td}>{row.plan}</td>
                  <td style={styles.td}>{row.status}</td>
                  <td style={styles.td}>{row.interval}</td>
                  <td style={styles.td}>{formatDate(row.currentPeriodEnd)}</td>
                  <td style={styles.td}>
                    <div style={styles.refStack}>
                      <span>{row.stripeCustomerId || "—"}</span>
                      <span>{row.stripeSubscriptionId || "—"}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
  secondaryButton: {
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "#eef2ff",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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
  filterBar: {
    display: "flex",
    gap: 14,
    flexWrap: "wrap",
    alignItems: "end",
  },
  filterGroup: {
    display: "grid",
    gap: 8,
    minWidth: 180,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "rgba(238,242,255,0.72)",
  },
  select: {
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "#eef2ff",
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
    color: "#ffd4d4",
  },
  tableWrap: {
    overflowX: "auto",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 18,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 980,
  },
  th: {
    textAlign: "left",
    padding: "14px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "rgba(238,242,255,0.68)",
  },
  td: {
    padding: "14px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    verticalAlign: "top",
  },
  refStack: {
    display: "grid",
    gap: 4,
    fontSize: 12,
    color: "rgba(238,242,255,0.74)",
  },
};