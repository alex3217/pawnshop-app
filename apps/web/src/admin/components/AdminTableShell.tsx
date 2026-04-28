import type { ReactNode } from "react";
import type { AdminTableConfig } from "../types/admin";

type Props<T> = {
  config: AdminTableConfig<T>;
  rows: T[];
  loading?: boolean;
  error?: string | null;
  emptyState?: ReactNode;
};

export default function AdminTableShell<T>({
  config,
  rows,
  loading = false,
  error = null,
  emptyState,
}: Props<T>) {
  if (loading) {
    return <p className="muted">Loading…</p>;
  }

  if (error) {
    return <div className="error-text">{error}</div>;
  }

  if (rows.length === 0) {
    return (
      <>
        {emptyState ?? (
          <div className="list-card">
            <strong>{config.title}</strong>
            <p className="muted" style={{ marginBottom: 0 }}>
              {config.emptyMessage}
            </p>
          </div>
        )}
      </>
    );
  }

  return (
    <div
      style={{
        overflowX: "auto",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          minWidth: 840,
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <thead>
          <tr>
            {config.columns.map((column) => (
              <th
                key={column.key}
                style={{
                  textAlign: "left",
                  fontSize: 12,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#a5b4fc",
                  padding: "14px 16px",
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                  whiteSpace: "nowrap",
                }}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr key={config.rowKey(row)}>
              {config.columns.map((column) => (
                <td
                  key={column.key}
                  style={{
                    padding: "14px 16px",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    verticalAlign: "top",
                  }}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
