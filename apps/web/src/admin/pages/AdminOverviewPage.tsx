// File: apps/web/src/admin/pages/AdminOverviewPage.tsx

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminPageShell from "../components/AdminPageShell";
import { adminApi } from "../services/adminApi";
import type { AdminKpi } from "../types/admin";

type OverviewState = {
  usersCount: number;
  itemsCount: number;
  shopsCount: number;
  liveAuctionsCount: number;
};

const INITIAL_STATE: OverviewState = {
  usersCount: 0,
  itemsCount: 0,
  shopsCount: 0,
  liveAuctionsCount: 0,
};

export default function AdminOverviewPage() {
  const [overview, setOverview] = useState<OverviewState>(INITIAL_STATE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    setError(null);

    const controller = new AbortController();

    try {
      const nextOverview = await adminApi.getOverview(controller.signal);
      setOverview(nextOverview);
    } catch (err: unknown) {
      setOverview(INITIAL_STATE);
      setError(err instanceof Error ? err.message : "Failed to load overview.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const cleanupPromise = load("initial");
    return () => {
      void cleanupPromise.then((cleanup) => cleanup?.());
    };
  }, [load]);

  const kpis = useMemo<AdminKpi[]>(
    () => [
      {
        key: "users",
        label: "Users",
        value: overview.usersCount,
        helpText: "All registered platform users.",
      },
      {
        key: "shops",
        label: "Shops",
        value: overview.shopsCount,
        helpText: "Shops currently visible to admin.",
      },
      {
        key: "inventory",
        label: "Inventory",
        value: overview.itemsCount,
        helpText: "Marketplace listings across all shops.",
      },
      {
        key: "live-auctions",
        label: "Live Auctions",
        value: overview.liveAuctionsCount,
        helpText: "Currently live auctions in the marketplace.",
      },
    ],
    [overview]
  );

  return (
    <AdminPageShell
      title="Overview"
      subtitle="Platform snapshot and launch point for the admin command center."
      actions={
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void load("refresh")}
          disabled={loading || refreshing}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      }
    >
      {error ? <div className="error-text">{error}</div> : null}
      {loading ? <p className="muted">Loading overview…</p> : null}

      {!loading ? (
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}
        >
          {kpis.map((kpi) => (
            <div key={kpi.key} className="list-card">
              <div className="muted" style={{ marginBottom: 8 }}>
                {kpi.label}
              </div>

              <div style={{ fontSize: 32, fontWeight: 800 }}>{kpi.value}</div>

              {kpi.helpText ? (
                <div className="muted" style={{ marginTop: 8 }}>
                  {kpi.helpText}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="list-card" style={{ marginTop: 20 }}>
        <strong>Phase 1 admin scope</strong>
        <p className="muted" style={{ marginBottom: 0 }}>
          Overview, users, shops, and inventory are the current foundation. Next
          admin modules are owners, auctions, offers, orders & settlements,
          reviews, support, revenue, analytics, fraud & risk, audit logs, and
          system health.
        </p>
      </div>
    </AdminPageShell>
  );
}