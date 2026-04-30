import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../services/apiClient";

type AuditLog = {
  id: string;
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  method: string;
  path: string;
  routeKey?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  statusCode?: number | null;
  success: boolean;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: unknown;
  createdAt: string;
};

type AuditResponse = {
  page: number;
  limit: number;
  total: number;
  rows: AuditLog[];
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function csvValue(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function stringify(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function copyText(value: unknown) {
  void navigator.clipboard?.writeText(String(value ?? ""));
}

function getTargetRoute(row: AuditLog) {
  const targetType = String(row.targetType || "").toUpperCase();
  const targetId = row.targetId ? encodeURIComponent(row.targetId) : "";

  if (targetType === "USER") return "/super-admin/users";
  if (targetType === "SHOP") return "/super-admin/shops";
  if (targetType === "SETTLEMENT") return "/super-admin/settlements";
  if (targetType === "BUYER_SUBSCRIPTION") return "/super-admin/buyer-subscriptions";
  if (targetType === "SELLER_PLAN") return "/super-admin/plans/seller";
  if (targetType === "BUYER_PLAN") return "/super-admin/plans/buyer";
  if (targetType === "PLATFORM_SETTING") return "/super-admin/platform-settings";
  if (targetId) return `/super-admin/audit?q=${targetId}`;

  return "/super-admin/audit";
}

function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "success" | "danger" | "info" | "neutral";
}) {
  const toneStyle =
    tone === "success"
      ? styles.successBadge
      : tone === "danger"
        ? styles.failBadge
        : tone === "info"
          ? styles.infoBadge
          : styles.neutralBadge;

  return <span style={{ ...styles.badge, ...toneStyle }}>{children}</span>;
}

export default function SuperAdminAuditPage() {
  const navigate = useNavigate();

  const [rows, setRows] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [success, setSuccess] = useState("");
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadAuditLogs(next?: { q?: string; success?: string }) {
    const search = next?.q ?? q;
    const result = next?.success ?? success;

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      params.set("limit", "100");

      if (search.trim()) params.set("q", search.trim());
      if (result) params.set("success", result);

      const data = await api.get<AuditResponse>(`/super-admin/audit?${params.toString()}`);

      setRows(Array.isArray(data.rows) ? data.rows : []);
      setTotal(Number(data.total || 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load audit logs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAuditLogs();
  }, []);

  const csv = useMemo(() => {
    const headers = [
      "createdAt",
      "actorEmail",
      "actorRole",
      "action",
      "method",
      "path",
      "targetType",
      "targetId",
      "statusCode",
      "success",
      "requestId",
      "ipAddress",
    ];

    const lines = rows.map((row) =>
      headers
        .map((header) => csvValue((row as unknown as Record<string, unknown>)[header]))
        .join(","),
    );

    return [headers.join(","), ...lines].join("\n");
  }, [rows]);

  function exportCsv() {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `super-admin-audit-${Date.now()}.csv`;
    anchor.click();

    URL.revokeObjectURL(url);
  }

  function applySuccessFilter(value: string) {
    setSuccess(value);
    void loadAuditLogs({ success: value });
  }

  function applySearchFilter(value: string) {
    setQ(value);
    void loadAuditLogs({ q: value });
  }

  function clearFilters() {
    setQ("");
    setSuccess("");
    void loadAuditLogs({ q: "", success: "" });
  }

  function openTarget(row: AuditLog) {
    navigate(getTargetRoute(row));
  }

  return (
    <div style={styles.page}>
      <section style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>Governance</div>
          <h1 style={styles.title}>Audit Logs</h1>
          <p style={styles.subtitle}>
            Track sensitive Super Admin actions, route mutations, actors, request IDs,
            target resources, metadata, and success/failure state.
          </p>
        </div>

        <div style={styles.actions}>
          <button type="button" className="btn btn-secondary" onClick={() => loadAuditLogs()}>
            Refresh
          </button>
          <button type="button" className="btn btn-secondary" onClick={exportCsv}>
            Export CSV
          </button>
          <Link to="/super-admin/platform-settings" className="btn btn-secondary" style={styles.linkButton}>
            Platform Settings
          </Link>
          <Link to="/super-admin/roles" className="btn btn-secondary" style={styles.linkButton}>
            Roles & Access
          </Link>
        </div>
      </section>

      <section style={styles.quickActions}>
        <button type="button" style={styles.quickButton} onClick={() => applySuccessFilter("")}>
          All Logs
        </button>
        <button type="button" style={styles.quickButton} onClick={() => applySuccessFilter("true")}>
          Show Successful
        </button>
        <button type="button" style={styles.quickButtonDanger} onClick={() => applySuccessFilter("false")}>
          Show Failed Only
        </button>
        <button type="button" style={styles.quickButton} onClick={() => applySearchFilter("UPDATE")}>
          Filter Updates
        </button>
        <button type="button" style={styles.quickButton} onClick={() => applySearchFilter("PLATFORM_SETTING")}>
          Platform Settings Logs
        </button>
        <button type="button" style={styles.quickButton} onClick={() => applySearchFilter("USER")}>
          User Logs
        </button>
        <button type="button" style={styles.quickButton} onClick={clearFilters}>
          Clear Filters
        </button>
      </section>

      <section style={styles.filters}>
        <label style={styles.label}>
          Search
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Actor, action, path, target, request id..."
            style={styles.input}
          />
        </label>

        <label style={styles.label}>
          Result
          <select
            value={success}
            onChange={(event) => setSuccess(event.target.value)}
            style={styles.input}
          >
            <option value="">All</option>
            <option value="true">Success</option>
            <option value="false">Failed</option>
          </select>
        </label>

        <div style={styles.filterButtons}>
          <button type="button" className="btn btn-secondary" onClick={() => loadAuditLogs()}>
            Apply Filters
          </button>
          <button type="button" className="btn btn-secondary" onClick={clearFilters}>
            Reset
          </button>
        </div>
      </section>

      {error ? <div style={styles.error}>{error}</div> : null}

      <section style={styles.summaryGrid}>
        <div style={styles.summaryCard}>
          <div style={styles.summaryValue}>{total}</div>
          <div style={styles.summaryLabel}>Total audit records</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryValue}>{rows.filter((row) => row.success).length}</div>
          <div style={styles.summaryLabel}>Success records shown</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryValue}>{rows.filter((row) => !row.success).length}</div>
          <div style={styles.summaryLabel}>Failed records shown</div>
        </div>
      </section>

      <section style={styles.tableCard}>
        {loading ? (
          <div style={styles.empty}>Loading audit logs...</div>
        ) : rows.length === 0 ? (
          <div style={styles.empty}>
            No audit logs found for the current filters. Mutations such as platform setting
            updates, role changes, settlement changes, and shop/user controls will appear here.
          </div>
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Time</th>
                  <th style={styles.th}>Actor</th>
                  <th style={styles.th}>Action</th>
                  <th style={styles.th}>Target</th>
                  <th style={styles.th}>Route</th>
                  <th style={styles.th}>Result</th>
                  <th style={styles.th}>Tools</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td style={styles.td}>{formatDate(row.createdAt)}</td>
                    <td style={styles.td}>
                      <strong>{row.actorEmail || "Unknown actor"}</strong>
                      <div style={styles.muted}>{row.actorRole || "Unknown role"}</div>
                      <button
                        type="button"
                        style={styles.textButton}
                        onClick={() => applySearchFilter(row.actorEmail || "")}
                      >
                        Filter Actor
                      </button>
                    </td>
                    <td style={styles.td}>
                      <strong>{row.action}</strong>
                      <div style={styles.muted}>{row.method}</div>
                      <button
                        type="button"
                        style={styles.textButton}
                        onClick={() => applySearchFilter(row.action)}
                      >
                        Filter Action
                      </button>
                    </td>
                    <td style={styles.td}>
                      <strong>{row.targetType || "Resource"}</strong>
                      <div style={styles.muted}>{row.targetId || "—"}</div>
                      <button
                        type="button"
                        style={styles.textButton}
                        onClick={() => openTarget(row)}
                      >
                        Open Target
                      </button>
                    </td>
                    <td style={styles.td}>
                      <div>{row.path}</div>
                      <div style={styles.muted}>{row.routeKey || "—"}</div>
                    </td>
                    <td style={styles.td}>
                      <Badge tone={row.success ? "success" : "danger"}>
                        {row.success ? "Success" : "Failed"} {row.statusCode ?? ""}
                      </Badge>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.toolRow}>
                        <button type="button" className="btn btn-secondary" onClick={() => setSelected(row)}>
                          View Details
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => copyText(row.id)}>
                          Copy ID
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => copyText(row.requestId)}>
                          Copy Request ID
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => copyText(row.actorId)}>
                          Copy Actor
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => copyText(row.targetId)}>
                          Copy Target
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => copyText(row.path)}>
                          Copy Path
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => copyText(stringify(row.metadata))}
                        >
                          Copy Metadata
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected ? (
        <section style={styles.detailsPanel}>
          <div style={styles.detailsHeader}>
            <div>
              <div style={styles.eyebrow}>Audit Details</div>
              <h2 style={styles.detailsTitle}>{selected.action}</h2>
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>

          <div style={styles.detailsGrid}>
            <div style={styles.detailCard}>
              <strong>Actor</strong>
              <span>{selected.actorEmail || "Unknown"}</span>
              <span style={styles.muted}>{selected.actorRole || "Unknown role"}</span>
            </div>
            <div style={styles.detailCard}>
              <strong>Request</strong>
              <span>{selected.requestId || "—"}</span>
              <span style={styles.muted}>{selected.ipAddress || "No IP"}</span>
            </div>
            <div style={styles.detailCard}>
              <strong>Target</strong>
              <span>{selected.targetType || "Resource"}</span>
              <span style={styles.muted}>{selected.targetId || "No target id"}</span>
            </div>
            <div style={styles.detailCard}>
              <strong>Result</strong>
              <span>{selected.success ? "Success" : "Failed"}</span>
              <span style={styles.muted}>Status {selected.statusCode ?? "—"}</span>
            </div>
          </div>

          <pre style={styles.pre}>{stringify(selected.metadata)}</pre>
        </section>
      ) : null}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { display: "grid", gap: 18 },
  hero: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    padding: 22,
    borderRadius: 20,
    border: "1px solid rgba(129, 140, 248, 0.22)",
    background: "linear-gradient(135deg, rgba(79,70,229,0.24), rgba(15,23,42,0.82))",
  },
  eyebrow: {
    color: "#a5b4fc",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  title: { margin: "8px 0 0", color: "#ffffff", fontSize: 30, fontWeight: 900 },
  subtitle: { margin: "8px 0 0", color: "#cbd5e1", maxWidth: 760, lineHeight: 1.55 },
  actions: { display: "flex", flexWrap: "wrap", gap: 10 },
  linkButton: { textDecoration: "none" },
  quickActions: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 10,
    padding: 14,
    borderRadius: 18,
    border: "1px solid rgba(148, 163, 184, 0.16)",
    background: "rgba(2, 6, 23, 0.44)",
  },
  quickButton: {
    minHeight: 42,
    borderRadius: 12,
    border: "1px solid rgba(129, 140, 248, 0.26)",
    background: "rgba(99, 102, 241, 0.14)",
    color: "#dbeafe",
    fontWeight: 900,
    cursor: "pointer",
  },
  quickButtonDanger: {
    minHeight: 42,
    borderRadius: 12,
    border: "1px solid rgba(239, 68, 68, 0.26)",
    background: "rgba(239, 68, 68, 0.14)",
    color: "#fecaca",
    fontWeight: 900,
    cursor: "pointer",
  },
  filters: {
    display: "grid",
    gridTemplateColumns: "minmax(240px, 1fr) 180px auto",
    gap: 12,
    alignItems: "end",
    padding: 16,
    borderRadius: 18,
    border: "1px solid rgba(148, 163, 184, 0.16)",
    background: "rgba(2, 6, 23, 0.44)",
  },
  filterButtons: { display: "flex", gap: 8, flexWrap: "wrap" },
  label: { display: "grid", gap: 6, color: "#cbd5e1", fontWeight: 800 },
  input: {
    minHeight: 40,
    borderRadius: 12,
    border: "1px solid rgba(148, 163, 184, 0.2)",
    background: "rgba(15, 23, 42, 0.8)",
    color: "#ffffff",
    padding: "0 12px",
  },
  error: {
    padding: 14,
    borderRadius: 14,
    color: "#fecaca",
    background: "rgba(239, 68, 68, 0.10)",
    border: "1px solid rgba(239, 68, 68, 0.22)",
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
  },
  summaryCard: {
    padding: 16,
    borderRadius: 16,
    background: "rgba(15,23,42,0.72)",
    border: "1px solid rgba(148,163,184,0.16)",
  },
  summaryValue: { color: "#ffffff", fontSize: 28, fontWeight: 900 },
  summaryLabel: { color: "#94a3b8", fontSize: 12 },
  tableCard: {
    borderRadius: 18,
    border: "1px solid rgba(148, 163, 184, 0.16)",
    background: "rgba(2, 6, 23, 0.44)",
    overflow: "hidden",
  },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 1120 },
  th: {
    textAlign: "left",
    color: "#94a3b8",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    padding: 14,
    borderBottom: "1px solid rgba(148, 163, 184, 0.16)",
  },
  td: {
    verticalAlign: "top",
    color: "#e2e8f0",
    padding: 14,
    borderBottom: "1px solid rgba(148, 163, 184, 0.10)",
    fontSize: 13,
  },
  muted: { color: "#94a3b8", fontSize: 12, marginTop: 4 },
  badge: {
    display: "inline-flex",
    borderRadius: 999,
    padding: "4px 9px",
    fontSize: 12,
    fontWeight: 900,
  },
  successBadge: {
    color: "#bbf7d0",
    background: "rgba(34, 197, 94, 0.13)",
    border: "1px solid rgba(34, 197, 94, 0.24)",
  },
  failBadge: {
    color: "#fecaca",
    background: "rgba(239, 68, 68, 0.13)",
    border: "1px solid rgba(239, 68, 68, 0.24)",
  },
  infoBadge: {
    color: "#bfdbfe",
    background: "rgba(59, 130, 246, 0.13)",
    border: "1px solid rgba(59, 130, 246, 0.24)",
  },
  neutralBadge: {
    color: "#e2e8f0",
    background: "rgba(148, 163, 184, 0.13)",
    border: "1px solid rgba(148, 163, 184, 0.24)",
  },
  toolRow: { display: "flex", flexWrap: "wrap", gap: 8 },
  textButton: {
    marginTop: 6,
    padding: 0,
    color: "#93c5fd",
    background: "transparent",
    border: 0,
    fontWeight: 800,
    cursor: "pointer",
    display: "block",
  },
  empty: { padding: 18, color: "#cbd5e1" },
  detailsPanel: {
    position: "sticky",
    bottom: 16,
    zIndex: 20,
    display: "grid",
    gap: 14,
    padding: 18,
    borderRadius: 20,
    border: "1px solid rgba(129, 140, 248, 0.34)",
    background: "rgba(15, 23, 42, 0.97)",
    boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
  },
  detailsHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  detailsTitle: { margin: "6px 0 0", color: "#ffffff", fontSize: 22 },
  detailsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
  },
  detailCard: {
    display: "grid",
    gap: 5,
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(148, 163, 184, 0.14)",
    background: "rgba(2,6,23,0.42)",
    color: "#e2e8f0",
  },
  pre: {
    maxHeight: 260,
    overflow: "auto",
    borderRadius: 14,
    padding: 14,
    color: "#dbeafe",
    background: "rgba(2, 6, 23, 0.72)",
    border: "1px solid rgba(148, 163, 184, 0.16)",
  },
};
