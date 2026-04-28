import type { AdminKpi } from "../types/admin";

type Props = {
  kpis: AdminKpi[];
};

export default function AdminKpiGrid({ kpis }: Props) {
  return (
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
  );
}
