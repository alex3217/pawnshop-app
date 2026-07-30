import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminPageShell from "../components/AdminPageShell";
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
  useEffect(() => {
    const controller = new AbortController();
    growthCenterApi.summary(controller.signal)
      .then((response) => setSummary(response.summary))
      .catch((reason) => {
        if (reason?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "Unable to load Growth Center.");
      });
    return () => controller.abort();
  }, []);
  return (
    <AdminPageShell
      title="Growth Center"
      subtitle="Discover, qualify, and track prospective pawn shops."
      actions={<Link className="button" to="/super-admin/growth/leads">Open directory</Link>}
    >
      {error ? <div className="error-text" role="alert">{error}</div> : null}
      {!summary && !error ? <p className="muted" aria-live="polite">Loading Growth Center…</p> : null}
      {summary ? (
        <div className="admin-kpi-grid" style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
          {CARDS.map(([key, label]) => (
            <div className="list-card" key={key}>
              <div className="muted">{label}</div>
              <div style={{ fontSize: 30, fontWeight: 900 }}>{summary[key]}</div>
            </div>
          ))}
        </div>
      ) : null}
    </AdminPageShell>
  );
}
