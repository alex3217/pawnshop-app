import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { exportCsv } from "../utils/exportCsv";
import { adminApi, type SuperAdminRevenueSummary } from "../services/adminApi";

type RevenueRecord = Record<string, unknown>;

type SettlementStatusFilter =
  | "ALL"
  | "PENDING"
  | "CHARGED"
  | "FAILED"
  | "CANCELED";

type DateRangeFilter =
  | "ALL"
  | "TODAY"
  | "7_DAYS"
  | "30_DAYS"
  | "90_DAYS";

const settlementStatuses: SettlementStatusFilter[] = [
  "ALL",
  "PENDING",
  "CHARGED",
  "FAILED",
  "CANCELED",
];

const dateRanges: { value: DateRangeFilter; label: string }[] = [
  { value: "ALL", label: "All dates" },
  { value: "TODAY", label: "Today" },
  { value: "7_DAYS", label: "Last 7 days" },
  { value: "30_DAYS", label: "Last 30 days" },
  { value: "90_DAYS", label: "Last 90 days" },
];

function formatMoney(cents?: number | null) {
  const value = Number(cents || 0) / 100;

  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
}

function getRecord(value: unknown): RevenueRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RevenueRecord)
    : {};
}

function getNumber(record: RevenueRecord, keys: string[], fallback = 0) {
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value)) return value;
  }

  return fallback;
}

function formatPercent(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "Not configured";
  return `${value.toFixed(2)}%`;
}

function formatStatus(value: string) {
  return value === "ALL" ? "All statuses" : value;
}

function StatCard({
  label,
  value,
  help,
  tone = "default",
}: {
  label: string;
  value: string | number;
  help?: string;
  tone?: "default" | "money" | "warning";
}) {
  const toneClass =
    tone === "money"
      ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/30"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/30"
        : "bg-background";

  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${toneClass}`}>
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {help ? <div className="mt-2 text-xs leading-5 text-muted-foreground">{help}</div> : null}
    </div>
  );
}

function RevenueRow({
  label,
  value,
  help,
}: {
  label: string;
  value: string | number;
  help?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b pb-3 last:border-b-0 last:pb-0">
      <div>
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        {help ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{help}</p> : null}
      </div>
      <span className="text-right font-semibold">{value}</span>
    </div>
  );
}

export default function SuperAdminRevenuePage() {
  const [revenue, setRevenue] = useState<SuperAdminRevenueSummary>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<SettlementStatusFilter>("ALL");
  const [dateRange, setDateRange] = useState<DateRangeFilter>("30_DAYS");
  const [lastRefreshedAt, setLastRefreshedAt] = useState("");

  async function loadRevenue() {
    setLoading(true);
    setError("");

    try {
      const data = await adminApi.getSuperAdminRevenue();
      setRevenue(data);
      setLastRefreshedAt(new Date().toLocaleString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load revenue.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRevenue();
  }, []);

  const revenueRecord = revenue as unknown as RevenueRecord;
  const commissionRecord = getRecord(revenueRecord.commission);
  const platformRecord = getRecord(revenueRecord.platform);
  const payoutRecord = getRecord(revenueRecord.payouts);

  const settlementRevenue = revenue.settlements?.chargedGrossCents ?? 0;
  const sellerMrr = revenue.subscriptions?.projectedSellerMrrCents ?? 0;
  const buyerMrr = revenue.subscriptions?.projectedBuyerMrrCents ?? 0;
  const totalMrr = revenue.subscriptions?.projectedTotalMrrCents ?? 0;

  const commissionBps = getNumber(
    commissionRecord,
    ["commissionBps", "averageCommissionBps", "platformCommissionBps"],
    getNumber(platformRecord, ["commissionBps", "averageCommissionBps"], 0),
  );

  const commissionPercent =
    getNumber(
      commissionRecord,
      ["commissionPercent", "averageCommissionPercent", "platformCommissionPercent"],
      0,
    ) || (commissionBps > 0 ? commissionBps / 100 : 0);

  const explicitCommissionCents = getNumber(
    commissionRecord,
    [
      "platformCommissionCents",
      "estimatedCommissionCents",
      "commissionCents",
      "totalCommissionCents",
    ],
    getNumber(platformRecord, ["commissionCents", "platformRevenueCents"], 0),
  );

  const estimatedCommissionCents =
    explicitCommissionCents > 0
      ? explicitCommissionCents
      : commissionBps > 0
        ? Math.round(settlementRevenue * (commissionBps / 10000))
        : 0;

  const sellerPayoutCents = getNumber(
    payoutRecord,
    ["sellerPayoutCents", "estimatedSellerPayoutCents", "netPayoutCents"],
    estimatedCommissionCents > 0
      ? Math.max(settlementRevenue - estimatedCommissionCents, 0)
      : 0,
  );

  const annualRunRate = useMemo(() => totalMrr * 12, [totalMrr]);

  const commissionConfigured = commissionPercent > 0 || estimatedCommissionCents > 0;

  const revenueCsvRow = {
    statusFilter,
    dateRange,
    settlementRevenue,
    estimatedCommissionCents,
    sellerPayoutCents,
    sellerMrr,
    buyerMrr,
    totalMrr,
    annualRunRate,
    commissionPercent,
    chargedSettlements: revenue.settlements?.chargedCount ?? 0,
    totalSettlements: revenue.settlements?.totalCount ?? 0,
    exportedAt: new Date().toISOString(),
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border bg-background p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Platform Revenue</h1>
            <p className="text-sm leading-6 text-muted-foreground">
              Track settlement revenue, subscription MRR, commission visibility,
              estimated seller payout, settlement status, and platform run rate.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="button min-h-11"
              onClick={() => exportCsv("platform-revenue.csv", [revenueCsvRow])}
            >
              Export CSV
            </button>

            <button className="button min-h-11" onClick={loadRevenue} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <label className="grid gap-1 text-sm font-medium">
            Status
            <select
              className="min-h-11 rounded-xl border bg-background px-3"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as SettlementStatusFilter)
              }
            >
              {settlementStatuses.map((status) => (
                <option key={status} value={status}>
                  {formatStatus(status)}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm font-medium">
            Date range
            <select
              className="min-h-11 rounded-xl border bg-background px-3"
              value={dateRange}
              onChange={(event) => setDateRange(event.target.value as DateRangeFilter)}
            >
              {dateRanges.map((range) => (
                <option key={range.value} value={range.value}>
                  {range.label}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-xl border bg-muted/20 p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Payout Status
            </div>
            <div className="mt-1 font-semibold">
              {commissionConfigured ? "Estimated" : "Needs commission rule"}
            </div>
          </div>

          <div className="rounded-xl border bg-muted/20 p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Last Refresh Date
            </div>
            <div className="mt-1 font-semibold">{lastRefreshedAt || "Not loaded yet"}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-sm">
          <Link className="button min-h-11" to="/super-admin/settlements">
            Settlement Control
          </Link>
          <Link className="button min-h-11" to="/super-admin/plans/seller">
            Seller Plan Control
          </Link>
          <Link className="button min-h-11" to="/super-admin/buyer-subscriptions">
            Buyer Subscriptions
          </Link>
          <Link className="button min-h-11" to="/super-admin/audit">
            Audit Logs
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Settlement Revenue"
          value={formatMoney(settlementRevenue)}
          help="Gross charged settlement value."
          tone="money"
        />
        <StatCard
          label="Platform Commission"
          value={
            commissionConfigured
              ? formatMoney(estimatedCommissionCents)
              : "Not configured"
          }
          help={
            commissionConfigured
              ? `Estimated from ${formatPercent(commissionPercent)} commission visibility.`
              : "Configure commission rules in platform settings or seller plans."
          }
          tone={commissionConfigured ? "money" : "warning"}
        />
        <StatCard
          label="Estimated Seller Payout"
          value={commissionConfigured ? formatMoney(sellerPayoutCents) : "Pending rule"}
          help="Gross settlement revenue minus visible platform commission estimate."
          tone="default"
        />
        <StatCard
          label="Charged Settlements"
          value={revenue.settlements?.chargedCount ?? 0}
          help={`${revenue.settlements?.totalCount ?? 0} total settlements tracked.`}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Projected MRR"
          value={formatMoney(totalMrr)}
          help="Seller + buyer subscription monthly revenue."
        />
        <StatCard
          label="Annual Run Rate"
          value={formatMoney(annualRunRate)}
          help="Projected MRR multiplied by 12."
        />
        <StatCard
          label="Commission Rate"
          value={formatPercent(commissionPercent)}
          help="Current visible platform commission rate."
        />
        <StatCard
          label="Revenue Date Scope"
          value={dateRanges.find((range) => range.value === dateRange)?.label ?? dateRange}
          help={`Status filter: ${formatStatus(statusFilter)}.`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border bg-background p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Subscription Revenue</h2>
          <div className="mt-4 space-y-4">
            <RevenueRow label="Seller MRR" value={formatMoney(sellerMrr)} />
            <RevenueRow label="Buyer MRR" value={formatMoney(buyerMrr)} />
            <RevenueRow label="Total MRR" value={formatMoney(totalMrr)} />
          </div>
        </div>

        <div className="rounded-2xl border bg-background p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Settlement Status Summary</h2>
          <div className="mt-4 space-y-4">
            <RevenueRow
              label="Total Settlements"
              value={revenue.settlements?.totalCount ?? 0}
              help="All tracked settlement records."
            />
            <RevenueRow
              label="Charged"
              value={revenue.settlements?.chargedCount ?? 0}
              help="Settlements that have completed payment."
            />
            <RevenueRow
              label="Charged Gross"
              value={formatMoney(settlementRevenue)}
              help="Gross charged settlement value before commission/payout allocation."
            />
          </div>
        </div>

        <div className="rounded-2xl border bg-background p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Commission & Payout Visibility</h2>
          <div className="mt-4 space-y-4">
            <RevenueRow
              label="Platform Commission"
              value={
                commissionConfigured
                  ? formatMoney(estimatedCommissionCents)
                  : "Not configured"
              }
              help="Platform fee / commission visibility for settlement revenue."
            />
            <RevenueRow
              label="Estimated Payout"
              value={commissionConfigured ? formatMoney(sellerPayoutCents) : "Pending rule"}
              help="Estimated seller payout after platform commission."
            />
            <RevenueRow
              label="Payout Status"
              value={commissionConfigured ? "Estimated" : "Needs rule"}
              help="Use Settlement Control and Platform Settings to reconcile exact payouts."
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-background p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Operational controls</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Use this revenue command center to review status/date filters, export CSV,
          monitor commission visibility, estimate payout exposure, and jump into the
          settlement, seller plan, buyer subscription, and audit workflows.
        </p>
      </div>

      {loading ? (
        <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
          Loading latest revenue data...
        </div>
      ) : null}
    </div>
  );
}
