import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ErrorState, LoadingState, MetricCard, OperationsHeader } from "../components/SuperAdminOperations";
import { growthCenterApi } from "../services/growthCenterApi";
import type { GrowthSummary } from "../types/growthCenter";

const CARDS: [keyof GrowthSummary, string][] = [
  ["totalLeads", "Total Leads"], ["verified", "Verified"], ["notContacted", "Not Contacted"],
  ["interested", "Interested"], ["demoScheduled", "Demo Scheduled"],
  ["applicationStarted", "Applications Started"], ["onboarding", "Onboarding"],
  ["live", "Live Shops"], ["followUpsDue", "Follow-ups Due"],
];

export default function GrowthCenterDashboardPage() {
  const [summary, setSummary] = useState<GrowthSummary | null>(null);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    growthCenterApi.summary(controller.signal)
      .then((response) => { setSummary(response.summary); setUpdatedAt(new Date()); })
      .catch((reason) => {
        if (reason?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "Unable to load Growth Center.");
      });
    return () => controller.abort();
  }, [refreshKey]);
  const conversion = summary?.totalLeads ? `${((summary.live / summary.totalLeads) * 100).toFixed(1)}%` : "0%";
  return (
    <div>
      <OperationsHeader title="Growth Center" description="Discover, qualify, and track prospective pawn shops without bypassing contact permission." updatedAt={updatedAt} actions={<><button className="btn btn-secondary" onClick={() => setRefreshKey((value) => value + 1)}>Refresh</button><Link className="btn btn-primary" to="/super-admin/growth/leads">Open directory</Link></>} />
      {error ? <ErrorState message={error} onRetry={() => setRefreshKey((value) => value + 1)} /> : null}
      {!summary && !error ? <LoadingState label="Loading Growth Center…" rows={4} /> : null}
      {summary ? (
        <div className="ops-metrics">
          {CARDS.map(([key, label]) => (
            <MetricCard key={key} label={label} value={summary[key]} description={key === "followUpsDue" ? "Due now or overdue" : undefined} />
          ))}
          <MetricCard label="Conversion rate" value={conversion} description="Live shops divided by total leads" />
        </div>
      ) : null}
      {summary ? <section className="ops-panel"><h2>Qualification funnel</h2><div className="ops-metrics"><MetricCard label="Discovered" value={summary.totalLeads} /><MetricCard label="Interested" value={summary.interested} /><MetricCard label="Application started" value={summary.applicationStarted} /><MetricCard label="Onboarding" value={summary.onboarding} /><MetricCard label="Live" value={summary.live} /></div><p className="muted">A zero means the API returned no matching records; unavailable data is shown as an error instead.</p></section> : null}
    </div>
  );
}
