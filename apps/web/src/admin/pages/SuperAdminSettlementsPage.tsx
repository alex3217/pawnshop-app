import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi, type AdminSettlementRow } from "../services/adminApi";

const STATUS_OPTIONS = ["PENDING", "CHARGED", "FAILED", "CANCELED", "REFUNDED"];
const FILTER_OPTIONS = ["ALL", ...STATUS_OPTIONS];

type SettlementNotice = {
  type: "success" | "warning" | "danger";
  text: string;
};

function normalizeStatus(value?: string | null) {
  return String(value || "PENDING").trim().toUpperCase();
}

function toNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function getSettlementCents(settlement: AdminSettlementRow) {
  if (typeof settlement.finalAmountCents === "number") {
    return settlement.finalAmountCents;
  }

  if (settlement.finalPrice !== undefined && settlement.finalPrice !== null) {
    return Math.round(toNumber(settlement.finalPrice) * 100);
  }

  return 0;
}

function formatMoney(
  cents?: number | null,
  fallbackAmount?: string | number | null,
  currency = "USD",
) {
  if (typeof cents === "number") {
    return (cents / 100).toLocaleString(undefined, {
      style: "currency",
      currency: currency || "USD",
    });
  }

  const amount = Number(fallbackAmount || 0);
  return amount.toLocaleString(undefined, {
    style: "currency",
    currency: currency || "USD",
  });
}

function formatDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString();
}

function shortId(value?: string | null, size = 10) {
  if (!value) return "—";
  return value.length > size ? `${value.slice(0, size)}…` : value;
}

function getAuctionId(settlement: AdminSettlementRow) {
  return settlement.auction?.id || settlement.auctionId || "";
}

function getItemId(settlement: AdminSettlementRow) {
  return settlement.auction?.item?.id || settlement.auction?.itemId || "";
}

function getShopId(settlement: AdminSettlementRow) {
  return settlement.auction?.shop?.id || settlement.auction?.shopId || "";
}

function getItemTitle(settlement: AdminSettlementRow) {
  return settlement.auction?.item?.title || "Auction item";
}

function getShopName(settlement: AdminSettlementRow) {
  return settlement.auction?.shop?.name || "Unknown shop";
}

function statusBadgeClass(status?: string | null) {
  const normalized = normalizeStatus(status);

  if (normalized === "CHARGED") {
    return "border-green-200 bg-green-50 text-green-700";
  }

  if (normalized === "PENDING") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (normalized === "FAILED") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (normalized === "CANCELED" || normalized === "REFUNDED") {
    return "border-slate-200 bg-slate-50 text-slate-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function StatusBadge({ status }: { status?: string | null }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${statusBadgeClass(
        status,
      )}`}
    >
      {normalizeStatus(status)}
    </span>
  );
}

function StatCard({
  label,
  value,
  help,
}: {
  label: string;
  value: string | number;
  help?: string;
}) {
  return (
    <div className="rounded-2xl border bg-background p-4 shadow-sm">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {help ? <div className="mt-1 text-xs text-muted-foreground">{help}</div> : null}
    </div>
  );
}

export default function SuperAdminSettlementsPage() {
  const [settlements, setSettlements] = useState<AdminSettlementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<SettlementNotice | null>(null);

  const loadSettlements = useCallback(async () => {
    setLoading(true);
    setNotice(null);

    try {
      const result = await adminApi.getSuperAdminSettlementsPaged({
        limit: 100,
        ...(statusFilter !== "ALL" ? { status: statusFilter } : {}),
      });

      setSettlements(result.rows);
    } catch (err) {
      setNotice({
        type: "danger",
        text: err instanceof Error ? err.message : "Failed to load settlements.",
      });
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void loadSettlements();
  }, [loadSettlements]);

  const filteredSettlements = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return settlements;

    return settlements.filter((settlement) =>
      [
        settlement.id,
        settlement.auctionId,
        settlement.auction?.id,
        settlement.auction?.itemId,
        settlement.auction?.shopId,
        settlement.auction?.item?.title,
        settlement.auction?.shop?.name,
        settlement.winnerUserId,
        settlement.winnerName,
        settlement.winnerEmail,
        settlement.status,
        settlement.stripePaymentIntent,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [query, settlements]);

  const totals = useMemo(() => {
    const byStatus = STATUS_OPTIONS.reduce<Record<string, number>>((acc, status) => {
      acc[status] = settlements.filter(
        (item) => normalizeStatus(item.status) === status,
      ).length;
      return acc;
    }, {});

    const charged = settlements.filter(
      (item) => normalizeStatus(item.status) === "CHARGED",
    );
    const pending = settlements.filter(
      (item) => normalizeStatus(item.status) === "PENDING",
    );
    const failed = settlements.filter(
      (item) => normalizeStatus(item.status) === "FAILED",
    );

    const chargedGrossCents = charged.reduce(
      (sum, item) => sum + getSettlementCents(item),
      0,
    );

    const pendingGrossCents = pending.reduce(
      (sum, item) => sum + getSettlementCents(item),
      0,
    );

    return {
      total: settlements.length,
      byStatus,
      chargedGrossCents,
      pendingGrossCents,
      failedCount: failed.length,
    };
  }, [settlements]);

  async function updateSettlement(
    settlement: AdminSettlementRow,
    input: Partial<AdminSettlementRow>,
  ) {
    const nextStatus = normalizeStatus(input.status || settlement.status);

    const confirmed = window.confirm(
      `Apply settlement update?\n\nSettlement: ${settlement.id}\nNew status: ${nextStatus}`,
    );

    if (!confirmed) return;

    setSavingId(settlement.id);
    setNotice(null);

    try {
      const response = await adminApi.updateSuperAdminSettlement(
        settlement.id,
        input,
      );

      setSettlements((current) =>
        current.map((item) =>
          item.id === settlement.id ? response.settlement : item,
        ),
      );

      setNotice({
        type: "success",
        text: `Settlement ${shortId(settlement.id)} updated to ${nextStatus}.`,
      });
    } catch (err) {
      setNotice({
        type: "danger",
        text: err instanceof Error ? err.message : "Failed to update settlement.",
      });
    } finally {
      setSavingId(null);
    }
  }

  async function copyPaymentIntent(value?: string | null) {
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      setNotice({
        type: "success",
        text: "Stripe PaymentIntent copied.",
      });
    } catch {
      setNotice({
        type: "warning",
        text: "Unable to copy PaymentIntent in this browser.",
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Settlements Control
          </h1>
          <p className="text-sm text-muted-foreground">
            Review settlement status, auction context, winner details, Stripe
            payment state, and manual admin actions.
          </p>
        </div>

        <button
          className="button"
          onClick={() => void loadSettlements()}
          disabled={loading || Boolean(savingId)}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {notice ? (
        <div
          className={`rounded-xl border p-4 text-sm ${
            notice.type === "success"
              ? "border-green-200 bg-green-50 text-green-700"
              : notice.type === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {notice.text}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-5">
        <StatCard label="Total" value={totals.total} />
        <StatCard label="Pending" value={totals.byStatus.PENDING || 0} />
        <StatCard label="Charged" value={totals.byStatus.CHARGED || 0} />
        <StatCard label="Failed" value={totals.failedCount} />
        <StatCard
          label="Charged Gross"
          value={formatMoney(totals.chargedGrossCents)}
          help={`Pending ${formatMoney(totals.pendingGrossCents)}`}
        />
      </div>

      <div className="grid gap-3 rounded-2xl border bg-background p-4 shadow-sm md:grid-cols-[220px_1fr]">
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
          disabled={loading || Boolean(savingId)}
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
          placeholder="Search settlement, auction, item, shop, winner, email, or payment intent..."
          className="rounded-lg border px-3 py-2 text-sm"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border bg-background shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1250px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="p-3 font-medium">Settlement</th>
                <th className="p-3 font-medium">Auction</th>
                <th className="p-3 font-medium">Winner</th>
                <th className="p-3 font-medium">Amount</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Payment Intent</th>
                <th className="p-3 font-medium">Dates</th>
                <th className="p-3 font-medium text-right">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    Loading settlements...
                  </td>
                </tr>
              ) : filteredSettlements.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    No settlements found.
                  </td>
                </tr>
              ) : (
                filteredSettlements.map((settlement) => {
                  const isSaving = savingId === settlement.id;
                  const auctionId = getAuctionId(settlement);
                  const itemId = getItemId(settlement);
                  const shopId = getShopId(settlement);
                  const status = normalizeStatus(settlement.status);
                  const paymentIntent = settlement.stripePaymentIntent || "";

                  return (
                    <tr key={settlement.id} className="border-b last:border-b-0">
                      <td className="p-3 align-top">
                        <div className="font-medium">{shortId(settlement.id, 14)}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {settlement.id}
                        </div>
                      </td>

                      <td className="p-3 align-top">
                        <div className="font-medium">{getItemTitle(settlement)}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Shop: {getShopName(settlement)}
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          {auctionId ? (
                            <Link
                              to={`/auctions/${auctionId}`}
                              className="font-medium text-blue-600 hover:underline"
                            >
                              Auction
                            </Link>
                          ) : null}

                          {itemId ? (
                            <Link
                              to={`/items/${itemId}`}
                              className="font-medium text-blue-600 hover:underline"
                            >
                              Item
                            </Link>
                          ) : null}

                          {shopId ? (
                            <Link
                              to={`/shops/${shopId}`}
                              className="font-medium text-blue-600 hover:underline"
                            >
                              Shop
                            </Link>
                          ) : null}
                        </div>

                        <div className="mt-1 text-xs text-muted-foreground">
                          Auction ID: {auctionId || "—"}
                        </div>
                      </td>

                      <td className="p-3 align-top">
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

                      <td className="p-3 align-top font-medium">
                        {formatMoney(
                          settlement.finalAmountCents,
                          settlement.finalPrice,
                          settlement.currency || "USD",
                        )}
                        <div className="text-xs text-muted-foreground">
                          {(settlement.currency || "USD").toUpperCase()}
                        </div>
                      </td>

                      <td className="p-3 align-top">
                        <div className="grid gap-2">
                          <StatusBadge status={status} />

                          <select
                            value={status}
                            disabled={isSaving}
                            onChange={(event) =>
                              void updateSettlement(settlement, {
                                status: event.target.value,
                              })
                            }
                            className="rounded-lg border px-2 py-1 text-sm"
                          >
                            {STATUS_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>

                      <td className="p-3 align-top">
                        <div className="max-w-[240px] truncate text-xs text-muted-foreground">
                          {paymentIntent || "—"}
                        </div>

                        {paymentIntent ? (
                          <button
                            type="button"
                            className="mt-2 text-xs font-medium text-blue-600 hover:underline"
                            onClick={() => void copyPaymentIntent(paymentIntent)}
                          >
                            Copy
                          </button>
                        ) : (
                          <div className="mt-2 text-xs text-muted-foreground">
                            No PaymentIntent yet
                          </div>
                        )}
                      </td>

                      <td className="p-3 align-top text-muted-foreground">
                        <div>
                          <span className="font-medium text-foreground">Created:</span>{" "}
                          {formatDate(settlement.createdAt)}
                        </div>
                        <div className="mt-1">
                          <span className="font-medium text-foreground">Updated:</span>{" "}
                          {formatDate(settlement.updatedAt)}
                        </div>
                        {settlement.auction?.endsAt ? (
                          <div className="mt-1">
                            <span className="font-medium text-foreground">
                              Auction ended:
                            </span>{" "}
                            {formatDate(settlement.auction.endsAt)}
                          </div>
                        ) : null}
                      </td>

                      <td className="p-3 align-top text-right">
                        <div className="flex flex-col items-end gap-2">
                          <button
                            disabled={isSaving || status === "CHARGED"}
                            onClick={() =>
                              void updateSettlement(settlement, {
                                status: "CHARGED",
                              })
                            }
                            className="button"
                          >
                            {isSaving ? "Saving..." : "Mark Charged"}
                          </button>

                          <button
                            disabled={isSaving || status === "PENDING"}
                            onClick={() =>
                              void updateSettlement(settlement, {
                                status: "PENDING",
                              })
                            }
                            className="rounded-lg border px-3 py-2 text-sm font-medium"
                          >
                            Mark Pending
                          </button>

                          <button
                            disabled={isSaving || status === "FAILED"}
                            onClick={() =>
                              void updateSettlement(settlement, {
                                status: "FAILED",
                              })
                            }
                            className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700"
                          >
                            Mark Failed
                          </button>
                        </div>
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
