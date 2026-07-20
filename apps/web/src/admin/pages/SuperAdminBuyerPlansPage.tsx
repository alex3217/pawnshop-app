import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AdminPageShell from "../components/AdminPageShell";
import {
  adminApi,
  type BuyerPlanSummary,
  type BuyerSubscriptionRow,
} from "../services/adminApi";
import "../../styles/super-admin-buyer-plans.css";

const PLAN_ORDER = ["FREE", "PLUS", "PREMIUM", "ULTRA"];

function formatMoney(cents: number | null | undefined, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(Number(cents || 0) / 100);
}

function formatLimit(value: number | null | undefined) {
  if (value === null) return "Unlimited";
  if (value === undefined) return "Not configured";
  return value.toLocaleString();
}

function feePercent(bps: number | null | undefined) {
  return `${(Number(bps || 0) / 100).toFixed(2)}%`;
}

function normalized(value: unknown, fallback = "") {
  return String(value ?? fallback).trim().toUpperCase();
}

function isRevenueSubscription(subscription: BuyerSubscriptionRow) {
  return ["ACTIVE", "TRIALING"].includes(normalized(subscription.status));
}

export default function SuperAdminBuyerPlansPage() {
  const [plans, setPlans] = useState<BuyerPlanSummary[]>([]);
  const [subscriptions, setSubscriptions] = useState<BuyerSubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const [planRows, subscriptionResult] = await Promise.all([
        adminApi.getBuyerPlans(),
        adminApi.getBuyerSubscriptionsPaged({ limit: 250 }),
      ]);

      setPlans(
        [...planRows].sort(
          (a, b) =>
            PLAN_ORDER.indexOf(normalized(a.code)) -
            PLAN_ORDER.indexOf(normalized(b.code)),
        ),
      );
      setSubscriptions(subscriptionResult.rows);
    } catch (err) {
      setPlans([]);
      setSubscriptions([]);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load buyer plan control data.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const subscriberCountByPlan = useMemo(() => {
    return subscriptions.reduce<Record<string, number>>((acc, subscription) => {
      const code = normalized(subscription.planCode, "FREE");
      acc[code] = (acc[code] || 0) + 1;
      return acc;
    }, {});
  }, [subscriptions]);

  const summary = useMemo(() => {
    const activeSubscriptions = subscriptions.filter(isRevenueSubscription);

    const projectedMrrCents = activeSubscriptions.reduce((sum, subscription) => {
      const plan = plans.find(
        (candidate) =>
          normalized(candidate.code) === normalized(subscription.planCode, "FREE"),
      );

      if (!plan) return sum;

      const interval = normalized(subscription.billingInterval, "MONTH");

      if (interval === "YEAR") {
        return sum + Math.round(Number(plan.yearlyPriceCents || 0) / 12);
      }

      return sum + Number(plan.monthlyPriceCents || 0);
    }, 0);

    return {
      totalPlans: plans.length,
      paidPlans: plans.filter((plan) => Number(plan.monthlyPriceCents || 0) > 0)
        .length,
      totalSubscribers: subscriptions.length,
      activeSubscribers: activeSubscriptions.length,
      projectedMrrCents,
    };
  }, [plans, subscriptions]);

  return (
    <AdminPageShell
      title="Buyer Plan Control"
      subtitle="Review buyer pricing, plan entitlements, subscriber distribution, and subscription revenue readiness."
      actions={
        <div className="admin-action-row">
          <Link className="btn btn-secondary" to="/super-admin/pricing">
            Pricing Control
          </Link>
          <Link
            className="btn btn-secondary"
            to="/super-admin/buyer-subscriptions"
          >
            Buyer Subscriptions
          </Link>
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
      <section className="super-admin-control-panel buyer-plan-command-panel">
        <div className="super-admin-control-header">
          <div>
            <div className="super-admin-control-kicker">
              Buyer Revenue Controls
            </div>
            <h2 className="super-admin-control-title">
              Buyer Plan Catalog
            </h2>
            <p className="super-admin-control-subtitle">
              Compare plan prices, limits, buyer fees, subscriber counts, and
              premium capabilities. Use Pricing Control to publish price changes.
            </p>
          </div>

          <div className="super-admin-control-actions">
            <Link className="btn btn-primary" to="/super-admin/pricing">
              Manage Pricing Rules
            </Link>
          </div>
        </div>

        <ul className="super-admin-control-list">
          <li>Plan pricing is sourced from the production pricing catalog.</li>
          <li>Subscriber counts come from buyer subscription records.</li>
          <li>Pricing changes remain centralized under Pricing Control.</li>
          <li>Existing subscribers remain separate from plan configuration.</li>
        </ul>
      </section>

      <section className="buyer-plan-summary-grid" aria-label="Buyer plan summary">
        <article className="buyer-plan-summary-card">
          <span>Configured plans</span>
          <strong>{summary.totalPlans}</strong>
        </article>

        <article className="buyer-plan-summary-card">
          <span>Paid plans</span>
          <strong>{summary.paidPlans}</strong>
        </article>

        <article className="buyer-plan-summary-card">
          <span>Total subscribers</span>
          <strong>{summary.totalSubscribers}</strong>
        </article>

        <article className="buyer-plan-summary-card">
          <span>Active / trialing</span>
          <strong>{summary.activeSubscribers}</strong>
        </article>

        <article className="buyer-plan-summary-card">
          <span>Projected buyer MRR</span>
          <strong>{formatMoney(summary.projectedMrrCents)}</strong>
        </article>
      </section>

      {error ? <div className="admin-notice danger">{error}</div> : null}

      {loading ? (
        <div className="buyer-plan-state-card">Loading buyer plans...</div>
      ) : plans.length === 0 ? (
        <div className="buyer-plan-state-card">
          <h3>No buyer plans are configured</h3>
          <p>
            Review the pricing catalog and configure FREE, PLUS, PREMIUM, and
            ULTRA plans before enabling buyer checkout.
          </p>
          <Link className="btn btn-primary" to="/super-admin/pricing">
            Open Pricing Control
          </Link>
        </div>
      ) : (
        <section className="buyer-plan-grid">
          {plans.map((plan) => {
            const code = normalized(plan.code);
            const subscriberCount = subscriberCountByPlan[code] || 0;
            const annualSavings = Math.max(
              Number(plan.monthlyPriceCents || 0) * 12 -
                Number(plan.yearlyPriceCents || 0),
              0,
            );

            return (
              <article className="buyer-plan-card" key={plan.code}>
                <div className="buyer-plan-card__header">
                  <div>
                    <div className="buyer-plan-card__code">{code}</div>
                    <h2>{plan.label || code}</h2>
                  </div>

                  <span
                    className={
                      Number(plan.monthlyPriceCents || 0) > 0
                        ? "buyer-plan-badge paid"
                        : "buyer-plan-badge free"
                    }
                  >
                    {Number(plan.monthlyPriceCents || 0) > 0 ? "Paid" : "Free"}
                  </span>
                </div>

                <div className="buyer-plan-price-grid">
                  <div>
                    <span>Monthly</span>
                    <strong>
                      {formatMoney(plan.monthlyPriceCents, plan.currency || "USD")}
                    </strong>
                  </div>
                  <div>
                    <span>Yearly</span>
                    <strong>
                      {formatMoney(plan.yearlyPriceCents, plan.currency || "USD")}
                    </strong>
                  </div>
                </div>

                <div className="buyer-plan-card__subscriber-row">
                  <span>Subscribers</span>
                  <strong>{subscriberCount}</strong>
                </div>

                <dl className="buyer-plan-entitlements">
                  <div>
                    <dt>Saved searches</dt>
                    <dd>{formatLimit(plan.maxSavedSearches)}</dd>
                  </div>
                  <div>
                    <dt>Watchlist items</dt>
                    <dd>{formatLimit(plan.maxWatchlistItems)}</dd>
                  </div>
                  <div>
                    <dt>Buyer fee</dt>
                    <dd>{feePercent(plan.buyerFeeBps)}</dd>
                  </div>
                  <div>
                    <dt>Support</dt>
                    <dd>{plan.supportLevel || "Standard"}</dd>
                  </div>
                  <div>
                    <dt>Instant alerts</dt>
                    <dd>{plan.instantAlerts ? "Included" : "Not included"}</dd>
                  </div>
                  <div>
                    <dt>Advanced autobid</dt>
                    <dd>{plan.advancedAutoBid ? "Included" : "Not included"}</dd>
                  </div>
                  <div>
                    <dt>Premium access</dt>
                    <dd>
                      {plan.premiumDealAccess ? "Included" : "Not included"}
                    </dd>
                  </div>
                  <div>
                    <dt>Annual savings</dt>
                    <dd>{formatMoney(annualSavings, plan.currency || "USD")}</dd>
                  </div>
                </dl>

                <div className="buyer-plan-feature-list">
                  {(plan.features || []).map((feature) => (
                    <span key={feature}>{feature}</span>
                  ))}
                </div>

                <div className="buyer-plan-card__actions">
                  <Link className="btn btn-primary" to="/super-admin/pricing">
                    Edit Pricing
                  </Link>
                  <Link
                    className="btn btn-secondary"
                    to="/super-admin/buyer-subscriptions"
                  >
                    View Subscribers
                  </Link>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </AdminPageShell>
  );
}
