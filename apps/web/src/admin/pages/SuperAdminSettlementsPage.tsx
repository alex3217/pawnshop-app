import { useEffect, useMemo, useState } from "react";
import { adminApi, type AdminSettlementRow } from "../services/adminApi";

const STATUS_OPTIONS = ["PENDING", "CHARGED", "FAILED", "CANCELED", "REFUNDED"];
const FILTER_OPTIONS = ["ALL", ...STATUS_OPTIONS];

function formatMoney(cents?: number | null, fallbackAmount?: string | number | null) {
  if (typeof cents === "number") {
    return (cents / 100).toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
    });
  }

  const amount = Number(fallbackAmount || 0);
  return amount.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function SuperAdminSettlementsPage() {
  const [settlements, setSettlements] = useState<AdminSettlementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  async function loadSettlements() {
    setLoading(true);
    setError("");

    try {
      const result = await adminApi.getSuperAdminSettlementsPaged({
        limit: 100,
        ...(statusFilter !== "ALL" ? { status: statusFilter } : {}),
      });

      setSettlements(result.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settlements.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettlements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const filteredSettlements = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return settlements;

    return settlements.filter((settlement) =>
      [
        settlement.id,
        settlement.auctionId,
        settlement.winnerUserId,
        settlement.winnerName,
        settlement.winnerEmail,
        settlement.status,
        settlement.stripePaymentIntent,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [query, settlements]);

  async function updateSettlement(
    settlement: AdminSettlementRow,
    input: Partial<AdminSettlementRow>
  ) {
    const confirmed = window.confirm("Apply this settlement update?");
    if (!confirmed) return;

    setSavingId(settlement.id);
    setError("");

    try {
      const response = await adminApi.updateSuperAdminSettlement(
        settlement.id,
        input
      );

      setSettlements((current) =>
        current.map((item) =>
          item.id === settlement.id ? response.settlement : item
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update settlement.");
    } finally {
      setSavingId(null);
    }
  }

  const totals = useMemo(() => {
    const charged = settlements.filter((item) => item.status === "CHARGED");
    const pending = settlements.filter((item) => item.status === "PENDING");

    return {
      total: settlements.length,
      charged: charged.length,
      pending: pending.length,
      chargedGrossCents: charged.reduce(
        (sum, item) => sum + Number(item.finalAmountCents || 0),
        0
      ),
    };
  }, [settlements]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Settlements Control
          </h1>
          <p className="text-sm text-muted-foreground">
            Review auction settlements and manually update payment status.
          </p>
        </div>

        <button className="button" onClick={loadSettlements} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border bg-background p-4 shadow-sm">
          <div className="text-sm text-muted-foreground">Total</div>
          <div className="mt-2 text-2xl font-semibold">{totals.total}</div>
        </div>
        <div className="rounded-2xl border bg-background p-4 shadow-sm">
          <div className="text-sm text-muted-foreground">Pending</div>
          <div className="mt-2 text-2xl font-semibold">{totals.pending}</div>
        </div>
        <div className="rounded-2xl border bg-background p-4 shadow-sm">
          <div className="text-sm text-muted-foreground">Charged</div>
          <div className="mt-2 text-2xl font-semibold">{totals.charged}</div>
        </div>
        <div className="rounded-2xl border bg-background p-4 shadow-sm">
          <div className="text-sm text-muted-foreground">Charged Gross</div>
          <div className="mt-2 text-2xl font-semibold">
            {formatMoney(totals.chargedGrossCents)}
          </div>
        </div>
      </div>

      <div className="grid gap-3 rounded-2xl border bg-background p-4 shadow-sm md:grid-cols-[220px_1fr]">
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          {FILTER_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>

        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by settlement, auction, user, email, or payment intent..."
          className="rounded-lg border px-3 py-2 text-sm"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border bg-background shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="p-3 font-medium">Settlement</th>
                <th className="p-3 font-medium">Winner</th>
                <th className="p-3 font-medium">Amount</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Payment Intent</th>
                <th className="p-3 font-medium">Created</th>
                <th className="p-3 font-medium text-right">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    Loading settlements...
                  </td>
                </tr>
              ) : filteredSettlements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    No settlements found.
                  </td>
                </tr>
              ) : (
                filteredSettlements.map((settlement) => {
                  const isSaving = savingId === settlement.id;

                  return (
                    <tr key={settlement.id} className="border-b last:border-b-0">
                      <td className="p-3">
                        <div className="font-medium">{settlement.id}</div>
                        <div className="text-xs text-muted-foreground">
                          Auction: {settlement.auctionId || "—"}
                        </div>
                      </td>

                      <td className="p-3">
                        <div className="font-medium">
                          {settlement.winnerName || "—"}
                        </div>
                        <div className="text-muted-foreground">
                          {settlement.winnerEmail || "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {settlement.winnerUserId || "—"}
                        </div>
                      </td>

                      <td className="p-3 font-medium">
                        {formatMoney(
                          settlement.finalAmountCents,
                          settlement.finalPrice
                        )}
                      </td>

                      <td className="p-3">
                        <select
                          value={settlement.status || "PENDING"}
                          disabled={isSaving}
                          onChange={(event) =>
                            updateSettlement(settlement, {
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
                        <div className="max-w-[220px] truncate text-xs text-muted-foreground">
                          {settlement.stripePaymentIntent || "—"}
                        </div>
                      </td>

                      <td className="p-3 text-muted-foreground">
                        {formatDate(settlement.createdAt)}
                      </td>

                      <td className="p-3 text-right">
                        <button
                          disabled={isSaving}
                          onClick={() =>
                            updateSettlement(settlement, { status: "CHARGED" })
                          }
                          className="button"
                        >
                          {isSaving ? "Saving..." : "Mark Charged"}
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
