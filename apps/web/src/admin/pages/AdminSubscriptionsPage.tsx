import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  adminApi,
  type AdminShopRow,
  type PaginationMeta,
  type SellerPlanSummary,
} from "../services/adminApi";
import "../../styles/admin-subscriptions-readability.css";

const SELLER_PLANS = ["FREE", "PRO", "PREMIUM", "ULTRA"] as const;
const SELLER_STATUSES = ["UNKNOWN", "ACTIVE", "TRIALING", "PAST_DUE", "INCOMPLETE", "INCOMPLETE_EXPIRED", "CANCELED", "PAUSED"] as const;
const SHOP_PAGE_LIMIT = 25;
const MONTHLY_INTERVALS = new Set(["MONTHLY", "MONTH"]);
const YEARLY_INTERVALS = new Set(["YEARLY", "YEAR"]);
const ACTIVE_RENEWAL_STATUSES = new Set(["ACTIVE", "TRIALING"]);
const INACTIVE_RENEWAL_STATUSES = new Set(["CANCELED", "UNPAID", "INCOMPLETE_EXPIRED"]);

type SellerSubscription = {
  id: string;
  shopName: string;
  ownerName: string;
  ownerEmail: string;
  plan: string;
  status: string;
  interval: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

type Criteria = { q: string; plan: string; status: string };

type AdminSubscriptionApiRow = {
  id?: string;
  shopId?: string;
  shopName?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  plan?: string | null;
  subscriptionPlan?: string | null;
  status?: string | null;
  subscriptionStatus?: string | null;
  interval?: string | null;
  billingInterval?: string | null;
  currentPeriodEnd?: string | null;
  subscriptionCurrentPeriodEnd?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
};

function normalized(value: unknown, fallback: string) {
  return String(value || fallback).trim().toUpperCase() || fallback;
}

function mapSubscription(shop: AdminShopRow, index: number): SellerSubscription {
  return {
    id: String(shop.id || `seller-subscription-${index}`),
    shopName: String(shop.name || `Shop ${index + 1}`),
    ownerName: String(shop.ownerName || "Unknown owner"),
    ownerEmail: String(shop.ownerEmail || ""),
    plan: normalized(shop.subscriptionPlan, "FREE"),
    status: normalized(shop.subscriptionStatus, "UNKNOWN"),
    interval: normalized(shop.subscriptionBillingInterval, "UNKNOWN"),
    currentPeriodEnd: shop.subscriptionCurrentPeriodEnd || null,
    cancelAtPeriodEnd: typeof shop.cancelAtPeriodEnd === "boolean" ? shop.cancelAtPeriodEnd : null,
    stripeCustomerId: shop.stripeCustomerId || null,
    stripeSubscriptionId: shop.stripeSubscriptionId || null,
  };
}

function formatDate(value: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleDateString();
}

function formatPrice(cents: number, interval: string) {
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  return `${amount}/${YEARLY_INTERVALS.has(interval) ? "year" : "month"}`;
}

function getPlanPrice(plan: SellerPlanSummary | undefined, interval: string) {
  if (!plan) return null;
  const value = MONTHLY_INTERVALS.has(interval)
    ? plan.monthlyPriceCents
    : YEARLY_INTERVALS.has(interval)
      ? plan.yearlyPriceCents
      : null;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function renewalLabel(subscription: SellerSubscription) {
  if (INACTIVE_RENEWAL_STATUSES.has(subscription.status)) return "Inactive";
  if (subscription.plan === "FREE" && !subscription.stripeSubscriptionId) return "Not applicable";
  if (!SELLER_PLANS.includes(subscription.plan as (typeof SELLER_PLANS)[number]) || subscription.plan === "FREE") return "Unavailable";
  if (!subscription.stripeSubscriptionId || !ACTIVE_RENEWAL_STATUSES.has(subscription.status) || subscription.cancelAtPeriodEnd === null) return "Unavailable";
  return subscription.cancelAtPeriodEnd ? "Cancels at period end" : "Renews";
}

function validatePagination(pagination: PaginationMeta | null, requestedPage: number) {
  if (!pagination) throw new Error("Seller subscription pagination metadata is invalid.");
  const { page, limit, total, totalPages, hasNextPage, hasPreviousPage } = pagination;
  const expectedTotalPages = Number.isSafeInteger(total) && total >= 0
    ? Math.max(Math.ceil(total / SHOP_PAGE_LIMIT), 1)
    : -1;
  if (
    page !== requestedPage ||
    limit !== SHOP_PAGE_LIMIT ||
    !Number.isSafeInteger(total) || total < 0 ||
    !Number.isSafeInteger(totalPages) || totalPages !== expectedTotalPages ||
    page > totalPages ||
    hasNextPage !== (page < totalPages) ||
    hasPreviousPage !== (page > 1)
  ) throw new Error("Seller subscription pagination metadata is invalid.");
  return pagination;
}

export default function AdminSubscriptionsPage() {
  const superAdmin = useLocation().pathname.startsWith("/super-admin");
  const [subscriptions, setSubscriptions] = useState<SellerSubscription[]>([]);
  const [plans, setPlans] = useState<SellerPlanSummary[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [draftQuery, setDraftQuery] = useState("");
  const [criteria, setCriteria] = useState<Criteria>({ q: "", plan: "ALL", status: "ALL" });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [refreshWarning, setRefreshWarning] = useState("");
  const requestRef = useRef<{ generation: number; controller: AbortController } | null>(null);
  const recoveryRefreshRef = useRef(false);

  const load = useCallback(async (refresh = false) => {
    requestRef.current?.controller.abort();
    const generation = (requestRef.current?.generation || 0) + 1;
    const controller = new AbortController();
    requestRef.current = { generation, controller };
    if (refresh) {
      setRefreshing(true);
      setRefreshWarning("");
    } else {
      setRefreshing(false);
      setLoading(true);
      setError("");
    }
    let recoveryScheduled = false;
    try {
      const query = {
        page,
        limit: SHOP_PAGE_LIMIT,
        isDeleted: false,
        ...(criteria.q ? { q: criteria.q } : {}),
        ...(criteria.plan !== "ALL" ? { subscriptionPlan: criteria.plan } : {}),
        ...(criteria.status !== "ALL" ? { subscriptionStatus: criteria.status } : {}),
      };
      const [result, planRows] = await Promise.all([
        superAdmin
          ? adminApi.getSuperAdminShopsPaged(query, controller.signal)
          : adminApi.request<{ success: boolean; subscriptions?: AdminSubscriptionApiRow[] }>("/admin/subscriptions", { signal: controller.signal }).then((payload) => ({
              rows: (payload.subscriptions || []).map((subscription, index): AdminShopRow => ({
                id: String(subscription.id || subscription.shopId || `admin-subscription-${index}`),
                name: String(subscription.shopName || `Shop ${index + 1}`),
                ownerName: subscription.ownerName,
                ownerEmail: subscription.ownerEmail,
                subscriptionPlan: subscription.subscriptionPlan ?? subscription.plan,
                subscriptionStatus: subscription.subscriptionStatus ?? subscription.status,
                subscriptionBillingInterval: subscription.billingInterval ?? subscription.interval,
                subscriptionCurrentPeriodEnd: subscription.subscriptionCurrentPeriodEnd ?? subscription.currentPeriodEnd,
                stripeCustomerId: subscription.stripeCustomerId,
                stripeSubscriptionId: subscription.stripeSubscriptionId,
                isDeleted: false,
              })),
              pagination: null,
            })),
        superAdmin ? adminApi.getSellerPlans(controller.signal) : Promise.resolve([]),
      ]);
      if (requestRef.current?.generation !== generation) return;
      const metadata = result.pagination;
      const rows = result.rows;
      const canRecoverInvalidPage = metadata &&
        metadata.page === page &&
        metadata.limit === SHOP_PAGE_LIMIT &&
        Number.isSafeInteger(metadata.total) && metadata.total >= 0 &&
        Number.isSafeInteger(metadata.totalPages) &&
        metadata.totalPages === Math.max(Math.ceil(metadata.total / SHOP_PAGE_LIMIT), 1) &&
        metadata.hasNextPage === false &&
        metadata.hasPreviousPage === (page > 1) &&
        page > metadata.totalPages;
      if (superAdmin && metadata && canRecoverInvalidPage) {
        const fallbackPage = metadata.totalPages;
        recoveryRefreshRef.current = refresh;
        recoveryScheduled = true;
        setPage(fallbackPage);
        return;
      } else if (superAdmin) {
        validatePagination(metadata, page);
      }
      if (requestRef.current?.generation !== generation) return;
      setSubscriptions(rows.filter((shop) => shop.isDeleted !== true).map(mapSubscription));
      setPagination(metadata);
      setPlans(planRows);
      setRefreshWarning("");
    } catch (cause) {
      if (controller.signal.aborted || requestRef.current?.generation !== generation) return;
      const message = cause instanceof Error ? cause.message : "Failed to load seller subscriptions.";
      if (refresh) setRefreshWarning(message);
      else setError(message);
    } finally {
      if (requestRef.current?.generation === generation && !recoveryScheduled) {
        if (refresh) setRefreshing(false);
        else setLoading(false);
      }
    }
  }, [criteria, page, superAdmin]);

  useEffect(() => {
    const refresh = recoveryRefreshRef.current;
    recoveryRefreshRef.current = false;
    void load(refresh);
    return () => requestRef.current?.controller.abort();
  }, [load]);

  const visibleSubscriptions = useMemo(() => {
    if (superAdmin) return subscriptions;
    const search = criteria.q.toLowerCase();
    return subscriptions.filter((item) =>
      (criteria.plan === "ALL" || item.plan === criteria.plan) &&
      (criteria.status === "ALL" || item.status === criteria.status) &&
      (!search || [item.id, item.shopName, item.ownerName, item.ownerEmail, item.stripeCustomerId, item.stripeSubscriptionId]
        .filter(Boolean).join(" ").toLowerCase().includes(search))
    );
  }, [criteria, subscriptions, superAdmin]);
  const planByCode = useMemo(() => new Map(plans.map((plan) => [plan.code, plan])), [plans]);
  const pageSummary = useMemo(() => ({
    nonFree: visibleSubscriptions.filter((item) => item.plan !== "FREE").length,
    attention: visibleSubscriptions.filter((item) => ["PAST_DUE", "INCOMPLETE", "INCOMPLETE_EXPIRED", "UNPAID"].includes(item.status)).length,
    canceling: visibleSubscriptions.filter((item) => renewalLabel(item) === "Cancels at period end").length,
  }), [visibleSubscriptions]);

  function applyCriteria(next: Criteria) {
    setPage(1);
    setCriteria(next);
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    applyCriteria({ ...criteria, q: draftQuery.trim() });
  }

  function clearFilters() {
    setDraftQuery("");
    applyCriteria({ q: "", plan: "ALL", status: "ALL" });
  }

  return <div className="seller-subscriptions-page">
    <header className="seller-subscriptions-hero">
      <div><p className="seller-subscriptions-eyebrow">{superAdmin ? "Plans & Billing · Seller" : "Admin · Seller"}</p><h1>{superAdmin ? "Seller Subscriptions" : "Seller Subscriptions & Plans"}</h1><p>Shop billing records are separate from buyer memberships. Review the seller plan, lifecycle status, renewal timing, and administrative Stripe references.</p></div>
      <div className="seller-subscriptions-actions">{superAdmin && <Link className="btn btn-secondary" to="/super-admin/plans/seller">Seller Plan Control</Link>}{superAdmin && <Link className="btn btn-secondary" to="/super-admin/buyer-subscriptions">Buyer Subscriptions</Link>}<button className="btn btn-secondary" type="button" disabled={loading || refreshing} onClick={() => void load(true)}>{refreshing ? "Refreshing…" : "Refresh"}</button></div>
    </header>

    <section className="seller-subscriptions-summary" aria-label="Seller subscription summary">
      <div><span>Total matching sellers</span><strong>{superAdmin ? pagination?.total ?? 0 : visibleSubscriptions.length}</strong></div>
      <div><span>This page · Non-free</span><strong>{pageSummary.nonFree}</strong></div>
      <div><span>This page · Needs attention</span><strong>{pageSummary.attention}</strong></div>
      {superAdmin
        ? <div><span>This page · Canceling</span><strong>{pageSummary.canceling}</strong></div>
        : <div><span>Cancellation state</span><strong>Not available</strong></div>}
    </section>

    <form className="seller-subscriptions-filters" aria-label="Seller subscription filters" onSubmit={submitSearch}>
      <label>Search<input value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} placeholder={superAdmin ? "Shop, owner, email, address, or Stripe ID" : "Shop, owner, email, or Stripe ID"} /></label>
      <button className="btn btn-secondary" type="submit">Search</button>
      <label>Seller plan<select value={criteria.plan} onChange={(event) => applyCriteria({ ...criteria, plan: event.target.value })}><option value="ALL">All plans</option>{SELLER_PLANS.map((plan) => <option key={plan}>{plan}</option>)}</select></label>
      <label>Status<select value={criteria.status} onChange={(event) => applyCriteria({ ...criteria, status: event.target.value })}><option value="ALL">All statuses</option>{SELLER_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
      <button className="btn btn-secondary" type="button" onClick={clearFilters} disabled={!draftQuery && !criteria.q && criteria.plan === "ALL" && criteria.status === "ALL"}>Clear filters</button>
    </form>

    {refreshWarning && <div className="seller-subscriptions-warning" role="alert"><strong>Refresh failed.</strong><span>{refreshWarning} Existing subscription data is still shown.</span><button className="btn btn-secondary" type="button" onClick={() => void load(true)}>Retry refresh</button></div>}
    {error && <div className="seller-subscriptions-error" role="alert"><strong>Unable to load seller subscriptions.</strong><span>{error}</span><button className="btn btn-secondary" type="button" onClick={() => void load(false)}>Try again</button></div>}
    {loading ? <div className="seller-subscriptions-state" role="status">Loading seller subscriptions…</div> : !error && visibleSubscriptions.length === 0 ? <div className="seller-subscriptions-state"><strong>No matching seller subscriptions</strong><span>Clear or change the current filters, or try again later.</span>{(criteria.q || criteria.plan !== "ALL" || criteria.status !== "ALL") && <button className="btn btn-secondary" type="button" onClick={clearFilters}>Clear filters</button>}</div> : null}

    {!loading && !error && visibleSubscriptions.length > 0 && <section className="seller-subscriptions-list" aria-label={`${visibleSubscriptions.length} seller subscriptions on this page`}>
      {visibleSubscriptions.map((subscription) => {
        const cents = getPlanPrice(planByCode.get(subscription.plan), subscription.interval);
        return <article className="seller-subscription-card" key={subscription.id}>
          <div className="seller-subscription-heading"><div><h2>{subscription.shopName}</h2><p>{subscription.ownerName}{subscription.ownerEmail ? ` · ${subscription.ownerEmail}` : ""}</p></div><span className="seller-subscription-status">{subscription.status}</span></div>
          <dl><div><dt>Seller plan</dt><dd>{subscription.plan}</dd></div><div><dt>Price</dt><dd>{cents === null ? "Not available" : formatPrice(cents, subscription.interval)}</dd></div><div><dt>Billing interval</dt><dd>{subscription.interval}</dd></div><div><dt>Current period ends</dt><dd>{formatDate(subscription.currentPeriodEnd)}</dd></div><div><dt>Renewal</dt><dd>{renewalLabel(subscription)}</dd></div><div><dt>Trial</dt><dd>{subscription.status === "TRIALING" ? "Trialing · end date unavailable" : "Not trialing"}</dd></div></dl>
          {superAdmin && <details><summary>Administrative identifiers</summary><dl><div><dt>Stripe customer</dt><dd>{subscription.stripeCustomerId || "Not linked"}</dd></div><div><dt>Stripe subscription</dt><dd>{subscription.stripeSubscriptionId || "Not linked"}</dd></div></dl></details>}
          {superAdmin && <p className="seller-subscription-lifecycle-note">Cancellation and renewal changes require a separate Stripe-backed seller lifecycle endpoint and are read-only here.</p>}
          <div className="seller-subscriptions-actions">{superAdmin && <Link className="btn btn-secondary" to={`/super-admin/shops?q=${encodeURIComponent(subscription.shopName)}`}>Open shop</Link>}{superAdmin && <Link className="btn btn-secondary" to={`/super-admin/audit?q=${encodeURIComponent(subscription.id)}`}>Audit history</Link>}</div>
        </article>;
      })}
    </section>}

    {!loading && !error && pagination && <nav className="seller-subscriptions-pagination" aria-label="Seller subscription pages"><button className="btn btn-secondary" type="button" disabled={!pagination.hasPreviousPage} onClick={() => setPage((value) => Math.max(value - 1, 1))}>Previous</button><span aria-live="polite">Page {pagination.page} of {pagination.totalPages}</span><button className="btn btn-secondary" type="button" disabled={!pagination.hasNextPage} onClick={() => setPage((value) => value + 1)}>Next</button></nav>}
  </div>;
}
