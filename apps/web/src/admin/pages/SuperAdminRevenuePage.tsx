import { useEffect, useMemo, useState } from "react";
import { exportCsv } from "../utils/exportCsv";
import { adminApi, type SuperAdminRevenueSummary } from "../services/adminApi";

function formatMoney(cents?: number) {
  const value = Number(cents || 0) / 100;
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
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
    <div className="rounded-2xl border bg-background p-5 shadow-sm">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {help ? <div className="mt-2 text-xs text-muted-foreground">{help}</div> : null}
    </div>
  );
}

export default function SuperAdminRevenuePage() {
  const [revenue, setRevenue] = useState<SuperAdminRevenueSummary>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadRevenue() {
    setLoading(true);
    setError("");

    try {
      const data = await adminApi.getSuperAdminRevenue();
      setRevenue(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load revenue.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRevenue();
  }, []);

  const settlementRevenue = revenue.settlements?.chargedGrossCents ?? 0;
  const sellerMrr = revenue.subscriptions?.projectedSellerMrrCents ?? 0;
  const buyerMrr = revenue.subscriptions?.projectedBuyerMrrCents ?? 0;
  const totalMrr = revenue.subscriptions?.projectedTotalMrrCents ?? 0;

  const annualRunRate = useMemo(() => totalMrr * 12, [totalMrr]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Platform Revenue</h1>
          <p className="text-sm text-muted-foreground">
            Track settlement revenue, subscription MRR, and platform run rate.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            className="button"
            onClick={() =>
              exportCsv("platform-revenue.csv", [
                {
                  settlementRevenue,
                  sellerMrr,
                  buyerMrr,
                  totalMrr,
                  annualRunRate,
                  chargedSettlements: revenue.settlements?.chargedCount ?? 0,
                  totalSettlements: revenue.settlements?.totalCount ?? 0,
                },
              ])
            }
          >
            Export CSV
          </button>

          <button className="button" onClick={loadRevenue} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
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
        />
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
          label="Charged Settlements"
          value={revenue.settlements?.chargedCount ?? 0}
          help={`${revenue.settlements?.totalCount ?? 0} total settlements tracked.`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-background p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Subscription Revenue</h2>
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <span className="text-sm text-muted-foreground">Seller MRR</span>
              <span className="font-medium">{formatMoney(sellerMrr)}</span>
            </div>
            <div className="flex items-center justify-between border-b pb-3">
              <span className="text-sm text-muted-foreground">Buyer MRR</span>
              <span className="font-medium">{formatMoney(buyerMrr)}</span>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="font-medium">Total MRR</span>
              <span className="text-lg font-semibold">{formatMoney(totalMrr)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-background p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Settlement Summary</h2>
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <span className="text-sm text-muted-foreground">Total Settlements</span>
              <span className="font-medium">{revenue.settlements?.totalCount ?? 0}</span>
            </div>
            <div className="flex items-center justify-between border-b pb-3">
              <span className="text-sm text-muted-foreground">Charged</span>
              <span className="font-medium">{revenue.settlements?.chargedCount ?? 0}</span>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="font-medium">Charged Gross</span>
              <span className="text-lg font-semibold">
                {formatMoney(settlementRevenue)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
          Loading latest revenue data...
        </div>
      ) : null}
    </div>
  );
}
