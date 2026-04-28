import { useEffect, useMemo, useState } from "react";
import {
  adminApi,
  type BuyerSubscriptionRow,
} from "../services/adminApi";

const PLAN_OPTIONS = ["FREE", "PLUS", "PREMIUM", "ULTRA"];
const STATUS_OPTIONS = [
  "UNKNOWN",
  "ACTIVE",
  "TRIALING",
  "PAST_DUE",
  "INCOMPLETE",
  "INCOMPLETE_EXPIRED",
  "CANCELED",
  "PAUSED",
];
const INTERVAL_OPTIONS = ["MONTH", "YEAR"];

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function SuperAdminBuyerSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<BuyerSubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  async function loadSubscriptions() {
    setLoading(true);
    setError("");

    try {
      const result = await adminApi.getBuyerSubscriptionsPaged({
        limit: 100,
      });
      setSubscriptions(result.rows);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load buyer subscriptions."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSubscriptions();
  }, []);

  const filteredSubscriptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subscriptions;

    return subscriptions.filter((sub) =>
      [
        sub.id,
        sub.userId,
        sub.userName,
        sub.userEmail,
        sub.planCode,
        sub.status,
        sub.billingInterval,
        sub.stripeCustomerId,
        sub.stripeSubscriptionId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [query, subscriptions]);

  async function updateSubscription(
    subscription: BuyerSubscriptionRow,
    input: Partial<BuyerSubscriptionRow>
  ) {
    const confirmed = window.confirm("Apply this buyer subscription update?");
    if (!confirmed) return;

    setSavingId(subscription.id);
    setError("");

    try {
      const response = await adminApi.updateBuyerSubscription(
        subscription.id,
        input
      );

      setSubscriptions((current) =>
        current.map((item) =>
          item.id === subscription.id ? response.subscription : item
        )
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to update buyer subscription."
      );
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Buyer Subscriptions
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage buyer subscription plans, status, billing interval, and renewal state.
          </p>
        </div>

        <button className="button" onClick={loadSubscriptions} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="rounded-2xl border bg-background p-4 shadow-sm">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by buyer, email, plan, status, Stripe id, or subscription id..."
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border bg-background shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="p-3 font-medium">Buyer</th>
                <th className="p-3 font-medium">Plan</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Interval</th>
                <th className="p-3 font-medium">Period</th>
                <th className="p-3 font-medium">Stripe</th>
                <th className="p-3 font-medium text-right">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    Loading buyer subscriptions...
                  </td>
                </tr>
              ) : filteredSubscriptions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    No buyer subscriptions found.
                  </td>
                </tr>
              ) : (
                filteredSubscriptions.map((subscription) => {
                  const isSaving = savingId === subscription.id;
                  const cancelAtPeriodEnd =
                    subscription.cancelAtPeriodEnd === true;

                  return (
                    <tr key={subscription.id} className="border-b last:border-b-0">
                      <td className="p-3">
                        <div className="font-medium">
                          {subscription.userName || "—"}
                        </div>
                        <div className="text-muted-foreground">
                          {subscription.userEmail || "—"}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {subscription.userId}
                        </div>
                      </td>

                      <td className="p-3">
                        <select
                          value={subscription.planCode || "FREE"}
                          disabled={isSaving}
                          onChange={(event) =>
                            updateSubscription(subscription, {
                              planCode: event.target.value,
                            })
                          }
                          className="rounded-lg border px-2 py-1 text-sm"
                        >
                          {PLAN_OPTIONS.map((plan) => (
                            <option key={plan} value={plan}>
                              {plan}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="p-3">
                        <select
                          value={subscription.status || "UNKNOWN"}
                          disabled={isSaving}
                          onChange={(event) =>
                            updateSubscription(subscription, {
                              status: event.target.value,
                            })
                          }
                          className="rounded-lg border px-2 py-1 text-sm"
                        >
                          {STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="p-3">
                        <select
                          value={subscription.billingInterval || "MONTH"}
                          disabled={isSaving}
                          onChange={(event) =>
                            updateSubscription(subscription, {
                              billingInterval: event.target.value,
                            })
                          }
                          className="rounded-lg border px-2 py-1 text-sm"
                        >
                          {INTERVAL_OPTIONS.map((interval) => (
                            <option key={interval} value={interval}>
                              {interval}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="p-3">
                        <div className="text-xs text-muted-foreground">
                          Start: {formatDate(subscription.currentPeriodStart)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          End: {formatDate(subscription.currentPeriodEnd)}
                        </div>
                        <div className="mt-1 text-xs">
                          Cancel at end: {cancelAtPeriodEnd ? "Yes" : "No"}
                        </div>
                      </td>

                      <td className="p-3">
                        <div className="max-w-[220px] truncate text-xs text-muted-foreground">
                          Customer: {subscription.stripeCustomerId || "—"}
                        </div>
                        <div className="max-w-[220px] truncate text-xs text-muted-foreground">
                          Sub: {subscription.stripeSubscriptionId || "—"}
                        </div>
                      </td>

                      <td className="p-3 text-right">
                        <button
                          disabled={isSaving}
                          onClick={() =>
                            updateSubscription(subscription, {
                              cancelAtPeriodEnd: !cancelAtPeriodEnd,
                            })
                          }
                          className="button"
                        >
                          {isSaving
                            ? "Saving..."
                            : cancelAtPeriodEnd
                              ? "Keep Active"
                              : "Cancel at End"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
