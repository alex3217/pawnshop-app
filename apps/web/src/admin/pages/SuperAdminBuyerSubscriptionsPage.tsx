import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AdminPageShell from "../components/AdminPageShell";
import {
  adminApi,
  type BuyerPlanSummary,
  type BuyerSubscriptionRow,
} from "../services/adminApi";
import "../../styles/super-admin-buyer-subscriptions.css";

const PLAN_OPTIONS = ["ALL", "FREE", "PLUS", "PREMIUM", "ULTRA"];

const STATUS_OPTIONS = [
  "ALL",
  "UNKNOWN",
  "ACTIVE",
  "TRIALING",
  "PAST_DUE",
  "INCOMPLETE",
  "INCOMPLETE_EXPIRED",
  "CANCELED",
  "PAUSED",
];

const INTERVAL_OPTIONS = ["ALL", "MONTH", "YEAR"];

const PAGE_SIZE = 25;

type SortKey =
  | "updatedAt"
  | "buyer"
  | "plan"
  | "status"
  | "renewal";

type SortDirection = "asc" | "desc";

function normalize(value: unknown, fallback = "") {
  return String(value ?? fallback).trim().toUpperCase();
}

function formatDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString();
}

function formatMoney(cents: number | null | undefined, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(Number(cents || 0) / 100);
}

function maskReference(value?: string | null) {
  const text = String(value || "").trim();
  if (!text) return "—";
  if (text.length <= 12) return text;

  return `${text.slice(0, 7)}…${text.slice(-4)}`;
}

function csvCell(value: unknown) {
  const text = String(value ?? "");

  if (
    text.includes(",") ||
    text.includes('"') ||
    text.includes("\n")
  ) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function downloadCsv(
  filename: string,
  headers: string[],
  rows: unknown[][],
) {
  const csv = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(",")),
  ].join("\n");

  const blob = new Blob([`\uFEFF${csv}`], {
    type: "text/csv;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}

function isRevenueStatus(status?: string | null) {
  return ["ACTIVE", "TRIALING"].includes(normalize(status));
}

function statusClass(status?: string | null) {
  return normalize(status, "UNKNOWN")
    .toLowerCase()
    .replaceAll("_", "-");
}

async function loadAllBuyerSubscriptions() {
  const rows: BuyerSubscriptionRow[] = [];
  let page = 1;

  for (;;) {
    const result = await adminApi.getBuyerSubscriptionsPaged({
      page,
      limit: 250,
    });

    rows.push(...result.rows);

    if (!result.pagination?.hasNextPage) {
      break;
    }

    page += 1;

    if (page > 100) {
      throw new Error(
        "Subscription pagination safety limit exceeded.",
      );
    }
  }

  return rows;
}

export default function SuperAdminBuyerSubscriptionsPage() {
  const [plans, setPlans] = useState<BuyerPlanSummary[]>([]);
  const [subscriptions, setSubscriptions] = useState<
    BuyerSubscriptionRow[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [query, setQuery] = useState("");
  const [planFilter, setPlanFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [intervalFilter, setIntervalFilter] = useState("ALL");
  const [cancellationFilter, setCancellationFilter] =
    useState("ALL");

  const [sortKey, setSortKey] =
    useState<SortKey>("updatedAt");
  const [sortDirection, setSortDirection] =
    useState<SortDirection>("desc");

  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] =
    useState<string | null>(null);

  const [draftPlan, setDraftPlan] = useState("FREE");
  const [draftStatus, setDraftStatus] = useState("ACTIVE");

  async function load() {
    setLoading(true);
    setError("");
    setNotice("");

    try {
      const [planRows, subscriptionRows] = await Promise.all([
        adminApi.getBuyerPlans(),
        loadAllBuyerSubscriptions(),
      ]);

      setPlans(planRows);
      setSubscriptions(subscriptionRows);
    } catch (err) {
      setPlans([]);
      setSubscriptions([]);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to load buyer subscriptions.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [
    query,
    planFilter,
    statusFilter,
    intervalFilter,
    cancellationFilter,
    sortKey,
    sortDirection,
  ]);

  const planByCode = useMemo(() => {
    return new Map(
      plans.map((plan) => [normalize(plan.code), plan]),
    );
  }, [plans]);

  const selectedSubscription = useMemo(() => {
    return (
      subscriptions.find(
        (subscription) => subscription.id === selectedId,
      ) || null
    );
  }, [selectedId, subscriptions]);

  const summary = useMemo(() => {
    const active = subscriptions.filter(
      (subscription) =>
        normalize(subscription.status) === "ACTIVE",
    ).length;

    const trialing = subscriptions.filter(
      (subscription) =>
        normalize(subscription.status) === "TRIALING",
    ).length;

    const pastDue = subscriptions.filter(
      (subscription) =>
        normalize(subscription.status) === "PAST_DUE",
    ).length;

    const paused = subscriptions.filter(
      (subscription) =>
        normalize(subscription.status) === "PAUSED",
    ).length;

    const canceled = subscriptions.filter(
      (subscription) =>
        normalize(subscription.status) === "CANCELED",
    ).length;

    const canceling = subscriptions.filter(
      (subscription) =>
        subscription.cancelAtPeriodEnd === true,
    ).length;

    const projectedMrrCents = subscriptions.reduce(
      (sum, subscription) => {
        if (!isRevenueStatus(subscription.status)) {
          return sum;
        }

        const plan = planByCode.get(
          normalize(subscription.planCode, "FREE"),
        );

        if (!plan) return sum;

        if (
          normalize(
            subscription.billingInterval,
            "MONTH",
          ) === "YEAR"
        ) {
          return (
            sum +
            Math.round(
              Number(plan.yearlyPriceCents || 0) / 12,
            )
          );
        }

        return sum + Number(plan.monthlyPriceCents || 0);
      },
      0,
    );

    return {
      total: subscriptions.length,
      active,
      trialing,
      pastDue,
      paused,
      canceled,
      canceling,
      projectedMrrCents,
    };
  }, [planByCode, subscriptions]);

  const filteredSubscriptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const filtered = subscriptions.filter((subscription) => {
      const queryMatches =
        !normalizedQuery ||
        [
          subscription.id,
          subscription.userId,
          subscription.userName,
          subscription.userEmail,
          subscription.planCode,
          subscription.status,
          subscription.billingInterval,
          subscription.stripeCustomerId,
          subscription.stripeSubscriptionId,
          subscription.stripePriceId,
          subscription.stripeLatestInvoiceId,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      const planMatches =
        planFilter === "ALL" ||
        normalize(subscription.planCode, "FREE") ===
          planFilter;

      const statusMatches =
        statusFilter === "ALL" ||
        normalize(subscription.status, "UNKNOWN") ===
          statusFilter;

      const intervalMatches =
        intervalFilter === "ALL" ||
        normalize(
          subscription.billingInterval,
          "UNKNOWN",
        ) === intervalFilter;

      const cancellationMatches =
        cancellationFilter === "ALL" ||
        (cancellationFilter === "CANCELING" &&
          subscription.cancelAtPeriodEnd === true) ||
        (cancellationFilter === "CONTINUING" &&
          subscription.cancelAtPeriodEnd !== true);

      return (
        queryMatches &&
        planMatches &&
        statusMatches &&
        intervalMatches &&
        cancellationMatches
      );
    });

    const direction = sortDirection === "asc" ? 1 : -1;

    return [...filtered].sort((a, b) => {
      if (sortKey === "renewal") {
        const aTime = a.currentPeriodEnd
          ? new Date(a.currentPeriodEnd).getTime()
          : 0;

        const bTime = b.currentPeriodEnd
          ? new Date(b.currentPeriodEnd).getTime()
          : 0;

        return (aTime - bTime) * direction;
      }

      if (sortKey === "updatedAt") {
        const aTime = a.updatedAt
          ? new Date(a.updatedAt).getTime()
          : 0;

        const bTime = b.updatedAt
          ? new Date(b.updatedAt).getTime()
          : 0;

        return (aTime - bTime) * direction;
      }

      const values: Record<
        Exclude<SortKey, "renewal" | "updatedAt">,
        [string, string]
      > = {
        buyer: [
          `${a.userName || ""} ${a.userEmail || ""}`,
          `${b.userName || ""} ${b.userEmail || ""}`,
        ],
        plan: [
          normalize(a.planCode, "FREE"),
          normalize(b.planCode, "FREE"),
        ],
        status: [
          normalize(a.status, "UNKNOWN"),
          normalize(b.status, "UNKNOWN"),
        ],
      };

      const [aValue, bValue] = values[sortKey];

      return (
        aValue.localeCompare(bValue, undefined, {
          sensitivity: "base",
        }) * direction
      );
    });
  }, [
    cancellationFilter,
    intervalFilter,
    planFilter,
    query,
    sortDirection,
    sortKey,
    statusFilter,
    subscriptions,
  ]);

  const totalPages = Math.max(
    Math.ceil(filteredSubscriptions.length / PAGE_SIZE),
    1,
  );

  const currentPage = Math.min(page, totalPages);

  const visibleSubscriptions = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;

    return filteredSubscriptions.slice(
      start,
      start + PAGE_SIZE,
    );
  }, [currentPage, filteredSubscriptions]);

  function openDetails(subscription: BuyerSubscriptionRow) {
    setSelectedId(subscription.id);
    setDraftPlan(
      normalize(subscription.planCode, "FREE"),
    );
    setDraftStatus(
      normalize(subscription.status, "ACTIVE"),
    );
    setError("");
    setNotice("");
  }

  async function updateSelectedSubscription(
    input: Partial<BuyerSubscriptionRow>,
    actionLabel: string,
  ) {
    const subscription = selectedSubscription;
    if (!subscription) return;

    const buyerLabel =
      subscription.userEmail ||
      subscription.userName ||
      subscription.userId ||
      subscription.id;

    const confirmed = window.confirm(
      `${actionLabel} for ${buyerLabel}?`,
    );

    if (!confirmed) return;

    setSavingId(subscription.id);
    setError("");
    setNotice("");

    try {
      const response = await adminApi.updateBuyerSubscription(
        subscription.id,
        input,
      );

      setSubscriptions((current) =>
        current.map((item) =>
          item.id === subscription.id
            ? response.subscription
            : item,
        ),
      );

      setDraftPlan(
        normalize(
          response.subscription.planCode,
          "FREE",
        ),
      );

      setDraftStatus(
        normalize(
          response.subscription.status,
          "ACTIVE",
        ),
      );

      setNotice(`${actionLabel} completed successfully.`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `${actionLabel} failed.`,
      );
    } finally {
      setSavingId(null);
    }
  }

  function clearFilters() {
    setQuery("");
    setPlanFilter("ALL");
    setStatusFilter("ALL");
    setIntervalFilter("ALL");
    setCancellationFilter("ALL");
    setSortKey("updatedAt");
    setSortDirection("desc");
    setPage(1);
  }

  function exportFilteredSubscriptions() {
    if (filteredSubscriptions.length === 0) {
      setNotice("There are no matching subscriptions to export.");
      return;
    }

    downloadCsv(
      `pawnloop-buyer-subscriptions-${
        new Date().toISOString().slice(0, 10)
      }.csv`,
      [
        "Buyer",
        "Email",
        "User ID",
        "Plan",
        "Status",
        "Billing Interval",
        "Current Period Start",
        "Current Period End",
        "Cancel At Period End",
        "Stripe Customer",
        "Stripe Subscription",
        "Created",
        "Updated",
      ],
      filteredSubscriptions.map((subscription) => [
        subscription.userName || "",
        subscription.userEmail || "",
        subscription.userId || "",
        subscription.planCode || "FREE",
        subscription.status || "UNKNOWN",
        subscription.billingInterval || "",
        subscription.currentPeriodStart || "",
        subscription.currentPeriodEnd || "",
        subscription.cancelAtPeriodEnd ? "Yes" : "No",
        maskReference(subscription.stripeCustomerId),
        maskReference(subscription.stripeSubscriptionId),
        subscription.createdAt || "",
        subscription.updatedAt || "",
      ]),
    );

    setNotice(
      `Exported ${filteredSubscriptions.length} buyer subscriptions.`,
    );
  }

  const isSaving =
    selectedSubscription !== null &&
    savingId === selectedSubscription.id;

  return (
    <AdminPageShell
      title="Buyer Subscriptions"
      subtitle="Monitor buyer plans, billing status, renewal timing, cancellation state, and Stripe references."
      actions={
        <div className="admin-action-row">
          <Link
            className="btn btn-secondary"
            to="/super-admin/plans/buyer"
          >
            Buyer Plan Control
          </Link>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={exportFilteredSubscriptions}
            disabled={loading}
          >
            Export CSV
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      }
    >
      <section className="super-admin-control-panel buyer-subscription-command-panel">
        <div className="super-admin-control-header">
          <div>
            <div className="super-admin-control-kicker">
              Subscription Operations
            </div>

            <h2 className="super-admin-control-title">
              Buyer Billing Oversight
            </h2>

            <p className="super-admin-control-subtitle">
              Search buyer subscriptions, review renewal and
              cancellation state, and perform controlled plan or
              status updates.
            </p>
          </div>

          <div className="super-admin-control-actions">
            <Link
              className="btn btn-primary"
              to="/super-admin/plans/buyer"
            >
              Open Buyer Plans
            </Link>
          </div>
        </div>

        <ul className="super-admin-control-list">
          <li>Stripe references are masked in CSV exports.</li>
          <li>Administrative changes require confirmation.</li>
          <li>Billing interval is displayed as read-only.</li>
          <li>
            Paid billing should continue to synchronize through
            Stripe webhooks.
          </li>
        </ul>
      </section>

      <section
        className="buyer-subscription-summary-grid"
        aria-label="Buyer subscription summary"
      >
        <article className="buyer-subscription-summary-card">
          <span>Total</span>
          <strong>{summary.total}</strong>
        </article>

        <article className="buyer-subscription-summary-card">
          <span>Active</span>
          <strong>{summary.active}</strong>
        </article>

        <article className="buyer-subscription-summary-card">
          <span>Trialing</span>
          <strong>{summary.trialing}</strong>
        </article>

        <article className="buyer-subscription-summary-card">
          <span>Past due</span>
          <strong>{summary.pastDue}</strong>
        </article>

        <article className="buyer-subscription-summary-card">
          <span>Paused</span>
          <strong>{summary.paused}</strong>
        </article>

        <article className="buyer-subscription-summary-card">
          <span>Canceling</span>
          <strong>{summary.canceling}</strong>
        </article>

        <article className="buyer-subscription-summary-card">
          <span>Canceled</span>
          <strong>{summary.canceled}</strong>
        </article>

        <article className="buyer-subscription-summary-card">
          <span>Projected MRR</span>
          <strong>
            {formatMoney(summary.projectedMrrCents)}
          </strong>
        </article>
      </section>

      {error ? (
        <div className="admin-notice danger">{error}</div>
      ) : null}

      {notice ? (
        <div className="admin-notice success">{notice}</div>
      ) : null}

      <section className="buyer-subscription-filter-card">
        <div className="buyer-subscription-search-row">
          <label>
            Search subscriptions
            <input
              type="search"
              value={query}
              onChange={(event) =>
                setQuery(event.target.value)
              }
              placeholder="Buyer, email, plan, status, user ID, or Stripe reference..."
              className="admin-control-input"
            />
          </label>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={clearFilters}
          >
            Clear Filters
          </button>
        </div>

        <div className="buyer-subscription-filter-grid">
          <label>
            Plan
            <select
              className="admin-control-select"
              value={planFilter}
              onChange={(event) =>
                setPlanFilter(event.target.value)
              }
            >
              {PLAN_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label>
            Status
            <select
              className="admin-control-select"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value)
              }
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label>
            Billing interval
            <select
              className="admin-control-select"
              value={intervalFilter}
              onChange={(event) =>
                setIntervalFilter(event.target.value)
              }
            >
              {INTERVAL_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label>
            Cancellation
            <select
              className="admin-control-select"
              value={cancellationFilter}
              onChange={(event) =>
                setCancellationFilter(event.target.value)
              }
            >
              <option value="ALL">ALL</option>
              <option value="CANCELING">
                CANCELING AT PERIOD END
              </option>
              <option value="CONTINUING">CONTINUING</option>
            </select>
          </label>

          <label>
            Sort by
            <select
              className="admin-control-select"
              value={sortKey}
              onChange={(event) =>
                setSortKey(event.target.value as SortKey)
              }
            >
              <option value="updatedAt">Last updated</option>
              <option value="buyer">Buyer</option>
              <option value="plan">Plan</option>
              <option value="status">Status</option>
              <option value="renewal">Renewal date</option>
            </select>
          </label>

          <label>
            Direction
            <select
              className="admin-control-select"
              value={sortDirection}
              onChange={(event) =>
                setSortDirection(
                  event.target.value as SortDirection,
                )
              }
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </label>
        </div>
      </section>

      <section className="admin-table-card">
        <div className="admin-table-meta">
          Showing {visibleSubscriptions.length} of{" "}
          {filteredSubscriptions.length} matching subscriptions
        </div>

        <div className="admin-table-scroll">
          <table className="admin-table buyer-subscription-table">
            <thead>
              <tr>
                <th>Buyer</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Billing</th>
                <th>Period</th>
                <th>Cancellation</th>
                <th>Stripe</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8}>
                    Loading buyer subscriptions...
                  </td>
                </tr>
              ) : visibleSubscriptions.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    No buyer subscriptions match the current
                    filters.
                  </td>
                </tr>
              ) : (
                visibleSubscriptions.map((subscription) => (
                  <tr key={subscription.id}>
                    <td>
                      <strong>
                        {subscription.userName || "Unknown buyer"}
                      </strong>
                      <div className="admin-muted">
                        {subscription.userEmail || "No email"}
                      </div>
                      <div className="admin-muted small">
                        {subscription.userId || "No user ID"}
                      </div>
                    </td>

                    <td>
                      <span className="badge badge-info">
                        {normalize(
                          subscription.planCode,
                          "FREE",
                        )}
                      </span>
                    </td>

                    <td>
                      <span
                        className={`buyer-subscription-status ${statusClass(
                          subscription.status,
                        )}`}
                      >
                        {normalize(
                          subscription.status,
                          "UNKNOWN",
                        )}
                      </span>
                    </td>

                    <td>
                      {normalize(
                        subscription.billingInterval,
                        "—",
                      )}
                    </td>

                    <td>
                      <div className="admin-muted small">
                        Start:{" "}
                        {formatDate(
                          subscription.currentPeriodStart,
                        )}
                      </div>
                      <div className="admin-muted small">
                        End:{" "}
                        {formatDate(
                          subscription.currentPeriodEnd,
                        )}
                      </div>
                    </td>

                    <td>
                      {subscription.cancelAtPeriodEnd
                        ? "Canceling at end"
                        : "Continuing"}
                    </td>

                    <td>
                      <div className="admin-muted small">
                        Customer:{" "}
                        {maskReference(
                          subscription.stripeCustomerId,
                        )}
                      </div>
                      <div className="admin-muted small">
                        Subscription:{" "}
                        {maskReference(
                          subscription.stripeSubscriptionId,
                        )}
                      </div>
                    </td>

                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => openDetails(subscription)}
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <nav
        className="buyer-subscription-pagination"
        aria-label="Buyer subscription pages"
      >
        <button
          type="button"
          className="btn btn-secondary"
          disabled={currentPage <= 1}
          onClick={() =>
            setPage((value) => Math.max(value - 1, 1))
          }
        >
          Previous
        </button>

        <span>
          Page {currentPage} of {totalPages}
        </span>

        <button
          type="button"
          className="btn btn-secondary"
          disabled={currentPage >= totalPages}
          onClick={() =>
            setPage((value) =>
              Math.min(value + 1, totalPages),
            )
          }
        >
          Next
        </button>
      </nav>

      {selectedSubscription ? (
        <div
          className="buyer-subscription-modal-backdrop"
          role="presentation"
          onMouseDown={() => setSelectedId(null)}
        >
          <section
            className="buyer-subscription-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="buyer-subscription-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="buyer-subscription-modal__header">
              <div>
                <div className="super-admin-control-kicker">
                  Buyer Subscription
                </div>
                <h2 id="buyer-subscription-modal-title">
                  {selectedSubscription.userName ||
                    selectedSubscription.userEmail ||
                    "Subscription details"}
                </h2>
                <p>
                  {selectedSubscription.userEmail || "No email"}
                </p>
              </div>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSelectedId(null)}
              >
                Close
              </button>
            </header>

            <div className="buyer-subscription-detail-grid">
              <div>
                <span>User ID</span>
                <strong>
                  {selectedSubscription.userId || "—"}
                </strong>
              </div>

              <div>
                <span>Subscription ID</span>
                <strong>{selectedSubscription.id}</strong>
              </div>

              <div>
                <span>Plan</span>
                <strong>
                  {normalize(
                    selectedSubscription.planCode,
                    "FREE",
                  )}
                </strong>
              </div>

              <div>
                <span>Status</span>
                <strong>
                  {normalize(
                    selectedSubscription.status,
                    "UNKNOWN",
                  )}
                </strong>
              </div>

              <div>
                <span>Billing interval</span>
                <strong>
                  {normalize(
                    selectedSubscription.billingInterval,
                    "—",
                  )}
                </strong>
              </div>

              <div>
                <span>Trial ends</span>
                <strong>
                  {formatDate(
                    selectedSubscription.trialEndsAt,
                  )}
                </strong>
              </div>

              <div>
                <span>Current period start</span>
                <strong>
                  {formatDate(
                    selectedSubscription.currentPeriodStart,
                  )}
                </strong>
              </div>

              <div>
                <span>Current period end</span>
                <strong>
                  {formatDate(
                    selectedSubscription.currentPeriodEnd,
                  )}
                </strong>
              </div>

              <div>
                <span>Stripe customer</span>
                <strong>
                  {selectedSubscription.stripeCustomerId ||
                    "—"}
                </strong>
              </div>

              <div>
                <span>Stripe subscription</span>
                <strong>
                  {selectedSubscription.stripeSubscriptionId ||
                    "—"}
                </strong>
              </div>

              <div>
                <span>Stripe price</span>
                <strong>
                  {selectedSubscription.stripePriceId || "—"}
                </strong>
              </div>

              <div>
                <span>Latest invoice</span>
                <strong>
                  {selectedSubscription.stripeLatestInvoiceId ||
                    "—"}
                </strong>
              </div>

              <div>
                <span>Created</span>
                <strong>
                  {formatDate(selectedSubscription.createdAt)}
                </strong>
              </div>

              <div>
                <span>Updated</span>
                <strong>
                  {formatDate(selectedSubscription.updatedAt)}
                </strong>
              </div>
            </div>

            <section className="buyer-subscription-action-card">
              <h3>Change buyer plan</h3>
              <p>
                Apply an administrative plan assignment. Paid
                billing should still be reconciled with Stripe.
              </p>

              <div className="buyer-subscription-action-row">
                <select
                  className="admin-control-select"
                  value={draftPlan}
                  disabled={isSaving}
                  onChange={(event) =>
                    setDraftPlan(event.target.value)
                  }
                >
                  {PLAN_OPTIONS.filter(
                    (option) => option !== "ALL",
                  ).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={isSaving}
                  onClick={() =>
                    void updateSelectedSubscription(
                      { planCode: draftPlan },
                      `Change plan to ${draftPlan}`,
                    )
                  }
                >
                  {isSaving ? "Saving..." : "Apply Plan"}
                </button>
              </div>
            </section>

            <section className="buyer-subscription-action-card">
              <h3>Change subscription status</h3>
              <p>
                Use this only for approved administrative
                corrections or Stripe reconciliation.
              </p>

              <div className="buyer-subscription-action-row">
                <select
                  className="admin-control-select"
                  value={draftStatus}
                  disabled={isSaving}
                  onChange={(event) =>
                    setDraftStatus(event.target.value)
                  }
                >
                  {STATUS_OPTIONS.filter(
                    (option) => option !== "ALL",
                  ).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={isSaving}
                  onClick={() =>
                    void updateSelectedSubscription(
                      { status: draftStatus },
                      `Change status to ${draftStatus}`,
                    )
                  }
                >
                  {isSaving ? "Saving..." : "Apply Status"}
                </button>
              </div>
            </section>

            <section className="buyer-subscription-action-card">
              <h3>Cancellation control</h3>
              <p>
                Choose whether this subscription should cancel
                at the end of its current billing period.
              </p>

              <button
                type="button"
                className="btn btn-secondary"
                disabled={isSaving}
                onClick={() =>
                  void updateSelectedSubscription(
                    {
                      cancelAtPeriodEnd:
                        !selectedSubscription.cancelAtPeriodEnd,
                    },
                    selectedSubscription.cancelAtPeriodEnd
                      ? "Keep subscription active"
                      : "Cancel subscription at period end",
                  )
                }
              >
                {isSaving
                  ? "Saving..."
                  : selectedSubscription.cancelAtPeriodEnd
                    ? "Keep Active"
                    : "Cancel at Period End"}
              </button>
            </section>
          </section>
        </div>
      ) : null}
    </AdminPageShell>
  );
}
