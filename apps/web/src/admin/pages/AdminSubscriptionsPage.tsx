// File: apps/web/src/admin/pages/AdminSubscriptionsPage.tsx

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { Link, useLocation } from "react-router-dom";
import { adminApi, type AdminShopRow, type SellerPlanSummary } from "../services/adminApi";
import "../../styles/admin-subscriptions-readability.css";

type AdminSubscriptionRecord = {
  id: string;
  shopId: string;
  shopName: string;
  ownerName: string;
  plan: string;
  status: string;
  interval: string;
  currentPeriodEnd: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  ownerEmail: string;
  updatedAt: string | null;
  cancelAtPeriodEnd: boolean;
  billingMethodPresent: boolean;
  billingMethodStatus: string;
  billingMethodLabel: string;
  connectState: string;
  connectPayoutsEnabled: boolean;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function maskStripeReference(value: string | null) {
  if (!value) return "Not linked";
  if (value.length <= 12) return value;
  return `${value.slice(0, 4)}••••••${value.slice(-4)}`;
}

function statusTone(status: string) {
  if (["ACTIVE", "TRIALING"].includes(status)) return "healthy";
  if (["PAST_DUE", "INCOMPLETE", "INCOMPLETE_EXPIRED"].includes(status)) {
    return "attention";
  }
  return "neutral";
}

function billingMethodSummary(subscription: AdminSubscriptionRecord) {
  if (subscription.billingMethodPresent) {
    return `${subscription.billingMethodLabel} · ${subscription.billingMethodStatus}`;
  }

  if (subscription.stripeSubscriptionId) {
    return subscription.status === "ACTIVE"
      ? "Subscription payment managed by Stripe · Active"
      : "Subscription payment managed by Stripe · Linked";
  }

  return "Not configured";
}

function connectPayoutSummary(subscription: AdminSubscriptionRecord) {
  if (subscription.connectPayoutsEnabled) return "Payouts enabled";

  const labels: Record<string, string> = {
    NOT_STARTED: "Payout onboarding not started",
    SETUP_INCOMPLETE: "Payout onboarding incomplete",
    RESTRICTED: "Payout account restricted",
  };

  return labels[subscription.connectState] || "Payouts disabled";
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
  const shopId = String(shop.id || `subscription-${index}`);
  return {
    id: shopId,
    shopId,
    shopName: String(shop.name || `Shop ${index + 1}`),
    ownerName: String(shop.ownerName || shop.ownerEmail || "Unknown owner"),
    ownerEmail: String(shop.ownerEmail || ""),
    plan: normalizePlan(shop.subscriptionPlan),
    status: normalizeStatus(shop.subscriptionStatus),
    interval: String(shop.subscriptionBillingInterval || "MONTHLY").toUpperCase(),
    currentPeriodEnd: shop.subscriptionCurrentPeriodEnd || null,
    stripeCustomerId: shop.stripeCustomerId || null,
    stripeSubscriptionId: shop.stripeSubscriptionId || null,
    updatedAt: shop.updatedAt || null,
    cancelAtPeriodEnd: Boolean(shop.cancelAtPeriodEnd),
    billingMethodPresent: Boolean(shop.billingMethodPresent),
    billingMethodStatus: String(shop.billingMethodStatus || "NOT_CONFIGURED"),
    billingMethodLabel: shop.billingMethodPresent ? `${shop.billingMethodBrand || "METHOD"} •••• ${shop.billingMethodLast4 || "----"}` : "Missing",
    connectState: String(shop.connectState || "NOT_STARTED"),
    connectPayoutsEnabled: Boolean(shop.connectPayoutsEnabled),
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
  superAdmin: boolean,
  signal?: AbortSignal,
): Promise<AdminSubscriptionRecord[]> {
  const shops = superAdmin
    ? (await adminApi.getSuperAdminShopsPaged({ limit: 250 }, signal)).rows
    : await adminApi.getShops(signal);
  return sortSubscriptions(shops.map(normalizeSubscription));
}

export default function AdminSubscriptionsPage() {
  const superAdmin = useLocation().pathname.startsWith("/super-admin");
  const [subscriptions, setSubscriptions] = useState<AdminSubscriptionRecord[]>(
    [],
  );
  const [sellerPlans, setSellerPlans] = useState<SellerPlanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [planFilter, setPlanFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [intervalFilter, setIntervalFilter] = useState("ALL");
  const [stripeFilter, setStripeFilter] = useState("ALL");
  const [connectFilter, setConnectFilter] = useState("ALL");

  const load = useCallback(
    async (
      mode: "initial" | "refresh" = "initial",
      signal?: AbortSignal,
    ) => {
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);

      setError("");

      try {
        const [data, planRows] = await Promise.all([fetchAdminSubscriptions(superAdmin, signal), superAdmin ? adminApi.getSellerPlans(signal) : Promise.resolve([])]);
        setSubscriptions(data);
        setSellerPlans(planRows);
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
    [superAdmin],
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
      const intervalOk = intervalFilter === "ALL" || item.interval === intervalFilter;
      const stripeOk = stripeFilter === "ALL" || (stripeFilter === "READY" && item.billingMethodPresent && item.billingMethodStatus === "READY") || (stripeFilter === "MISSING" && !item.billingMethodPresent) || (stripeFilter === "EXPIRED" && item.billingMethodStatus === "EXPIRED") || (stripeFilter === "SYNC_FAILED" && item.billingMethodStatus === "SYNC_FAILED");
      const connectOk = connectFilter === "ALL" || (connectFilter === "INCOMPLETE" && ["NOT_STARTED", "SETUP_INCOMPLETE", "RESTRICTED"].includes(item.connectState)) || (connectFilter === "PAYOUTS_DISABLED" && !item.connectPayoutsEnabled) || item.connectState === connectFilter;
      const q = query.trim().toLowerCase();
      const searchOk = !q || [item.id, item.shopName, item.ownerName, item.ownerEmail, item.stripeCustomerId, item.stripeSubscriptionId].join(" ").toLowerCase().includes(q);
      return planOk && statusOk && intervalOk && stripeOk && connectOk && searchOk;
    });
  }, [connectFilter, intervalFilter, planFilter, query, statusFilter, stripeFilter, subscriptions]);

  const summary = useMemo(() => {
    const byPlan = subscriptions.reduce<Record<string, number>>((acc, item) => {
      acc[item.plan] = (acc[item.plan] || 0) + 1;
      return acc;
    }, {});

    const planByCode = new Map(sellerPlans.map((plan) => [plan.code, plan]));
    const mrrCents = subscriptions.filter((item) => ["ACTIVE", "TRIALING"].includes(item.status)).reduce((sum, item) => { const plan = planByCode.get(item.plan); return sum + (item.interval === "YEARLY" || item.interval === "YEAR" ? Math.round(Number(plan?.yearlyPriceCents || 0) / 12) : Number(plan?.monthlyPriceCents || 0)); }, 0);
    return {
      total: subscriptions.length,
      active: subscriptions.filter((item) => item.status === "ACTIVE").length,
      free: byPlan.FREE || 0,
      paid: subscriptions.filter((item) => item.plan !== "FREE").length,
      pastDue: subscriptions.filter((item) => item.status === "PAST_DUE").length,
      trialing: subscriptions.filter((item) => item.status === "TRIALING").length,
      paused: subscriptions.filter((item) => item.status === "PAUSED").length,
      canceling: subscriptions.filter((item) => item.cancelAtPeriodEnd).length,
      canceled: subscriptions.filter((item) => item.status === "CANCELED").length,
      incomplete: subscriptions.filter((item) => item.status.startsWith("INCOMPLETE")).length,
      stripeFailures: subscriptions.filter((item) => item.plan !== "FREE" && !item.stripeSubscriptionId).length,
      mrrCents,
    };
  }, [sellerPlans, subscriptions]);

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
    <div className="admin-subscriptions-readability" style={styles.page}>
      <div style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>{superAdmin ? "Plans & Billing · Seller" : "Admin"}</div>
          <h1 style={styles.title}>{superAdmin ? "Seller Subscriptions" : "Subscriptions"}</h1>
          <p style={styles.subtitle}>
            Monitor seller plan coverage, billing status, Stripe references, and
            renewal timing.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {superAdmin ? <><Link className="btn btn-secondary" to="/super-admin/plans/seller">Seller Plan Control</Link><Link className="btn btn-secondary" to="/super-admin/revenue">Revenue</Link><Link className="btn btn-secondary" to="/super-admin/audit?q=SELLER_PLAN">Billing audit</Link></> : null}
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
        </button></div>
      </div>

      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Total subscriptions</div>
          <div style={styles.statValue}>{summary.total}</div>
        </div>
        {superAdmin ? <><div style={styles.statCard}><div style={styles.statLabel}>Trialing / canceling</div><div style={styles.statValue}>{summary.trialing} / {summary.canceling}</div></div><div style={styles.statCard}><div style={styles.statLabel}>Paused / canceled</div><div style={styles.statValue}>{summary.paused} / {summary.canceled}</div></div><div style={styles.statCard}><div style={styles.statLabel}>Incomplete / sync failures</div><div style={styles.statValue}>{summary.incomplete} / {summary.stripeFailures}</div></div><div style={styles.statCard}><div style={styles.statLabel}>Seller MRR / ARR</div><div style={styles.statValue}>{money(summary.mrrCents)} / {money(summary.mrrCents * 12)}</div></div></> : null}

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
        <label style={styles.filterLabel}>Search<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Shop, owner, email, subscription, or Stripe customer" style={styles.select} /></label>
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
        {superAdmin ? <><label style={styles.filterLabel}>Interval<select value={intervalFilter} onChange={(event) => setIntervalFilter(event.target.value)} style={styles.select}><option>ALL</option><option>MONTHLY</option><option>YEARLY</option></select></label><label style={styles.filterLabel}>Saved billing method<select value={stripeFilter} onChange={(event) => setStripeFilter(event.target.value)} style={styles.select}><option>ALL</option><option>READY</option><option>MISSING</option><option>EXPIRED</option><option>SYNC_FAILED</option></select></label><label style={styles.filterLabel}>Payout onboarding<select value={connectFilter} onChange={(event) => setConnectFilter(event.target.value)} style={styles.select}><option>ALL</option><option>INCOMPLETE</option><option>PAYOUTS_DISABLED</option><option>PAYOUTS_ENABLED</option></select></label></> : null}

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

                <div
                  className={`seller-subscription-status seller-subscription-status--${statusTone(subscription.status)}`}
                >
                  {subscription.status}
                </div>
              </div>
              {superAdmin ? (
                <div className="seller-subscription-controls">
                  <details className="seller-subscription-disclosure">
                    <summary className="btn btn-secondary seller-subscription-action">
                      Open details
                    </summary>
                    <div className="seller-subscription-expanded-panel">
                      <dl className="seller-subscription-expanded-grid">
                        <div>
                          <dt>Owner</dt>
                          <dd>{subscription.ownerName}</dd>
                        </div>
                        <div>
                          <dt>Owner email</dt>
                          <dd>{subscription.ownerEmail || "Not available"}</dd>
                        </div>
                        <div>
                          <dt>Renewal behavior</dt>
                          <dd>{subscription.cancelAtPeriodEnd ? "Cancels at period end" : "Renews automatically"}</dd>
                        </div>
                        <div>
                          <dt>Last synced</dt>
                          <dd>{formatDate(subscription.updatedAt)}</dd>
                        </div>
                      </dl>
                      <p className="seller-subscription-reference-note">
                        Stripe references are masked on this page. Use the Stripe
                        dashboard when the complete identifier is required.
                      </p>
                    </div>
                  </details>
                  <nav
                    className="seller-subscription-actions"
                    aria-label={`Actions for ${subscription.shopName}`}
                  >
                    <Link
                      className="btn btn-secondary seller-subscription-action"
                      to={`/super-admin/shops?q=${encodeURIComponent(subscription.shopName)}`}
                    >
                      Manage shop billing
                    </Link>
                    <Link
                      className="btn btn-secondary seller-subscription-action"
                      to={`/super-admin/audit?targetType=SHOP&targetId=${encodeURIComponent(subscription.shopId)}`}
                    >
                      Audit history
                    </Link>
                  </nav>
                </div>
              ) : null}

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
                    {maskStripeReference(subscription.stripeCustomerId)}
                  </div>
                </div>

                <div>
                  <div style={styles.detailLabel}>Stripe subscription</div>
                  <div style={styles.detailValue}>
                    {maskStripeReference(subscription.stripeSubscriptionId)}
                  </div>
                </div>
                {superAdmin ? <><div><div style={styles.detailLabel}>Seller billing profile</div><div style={styles.detailValue}>{billingMethodSummary(subscription)}</div></div><div><div style={styles.detailLabel}>Stripe Connect payouts</div><div style={styles.detailValue}>{connectPayoutSummary(subscription)}</div></div></> : null}
              </div>
              {superAdmin ? (
                <p className="seller-subscription-separation-note">
                  Subscription billing and Stripe Connect payouts are separate.
                  A shop can have an active paid plan before payout onboarding is complete.
                </p>
              ) : null}
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
