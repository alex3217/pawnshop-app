import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AdminPageShell from "../components/AdminPageShell";
import { adminApi, type SuperAdminIntegrationRow } from "../services/adminApi";
import {
  compareValues,
  downloadCsv,
  formatDate,
  includesSearch,
  type SortDirection,
} from "../utils/adminControlUtils";

type StatusFilter = "ALL" | "ACTIVE" | "ARCHIVED" | "FAILED" | "ERROR";
type DetailMode = "details" | "sync" | "mappings";

function getText(row: Record<string, unknown>, keys: string[], fallback = "—") {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && value !== "") return String(value);
  }
  return fallback;
}

function getIntegrationStatus(row: SuperAdminIntegrationRow) {
  return getText(row as Record<string, unknown>, ["status"], "UNKNOWN").toUpperCase();
}

function badgeClass(status: string) {
  if (["ACTIVE", "CONNECTED", "READY", "SUCCESS"].includes(status)) return "badge badge-success";
  if (["ARCHIVED", "DISABLED"].includes(status)) return "badge badge-danger";
  if (["FAILED", "ERROR"].includes(status)) return "badge badge-warning";
  return "badge";
}

export default function SuperAdminIntegrationsPage() {
  const [rows, setRows] = useState<SuperAdminIntegrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortKey, setSortKey] = useState<keyof SuperAdminIntegrationRow>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<SuperAdminIntegrationRow | null>(null);
  const [detailMode, setDetailMode] = useState<DetailMode>("details");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const result = await adminApi.getSuperAdminIntegrationsPaged({ limit: 200 });
      setRows(result.rows);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : "Failed to load integrations.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredRows = useMemo(() => {
    return rows
      .filter((row) =>
        includesSearch(row as Record<string, unknown>, query, [
          "id",
          "name",
          "provider",
          "providerType",
          "type",
          "status",
          "shopName",
          "ownerEmail",
          "ownerName",
        ]),
      )
      .filter((row) => statusFilter === "ALL" || getIntegrationStatus(row) === statusFilter)
      .sort((a, b) => compareValues(a[sortKey], b[sortKey], sortDirection));
  }, [query, rows, sortDirection, sortKey, statusFilter]);

  function openDetails(row: SuperAdminIntegrationRow, mode: DetailMode = "details") {
    setSelected(row);
    setDetailMode(mode);
  }

  async function archiveOrRestore(row: SuperAdminIntegrationRow) {
    const status = getIntegrationStatus(row);
    const isArchived = status === "ARCHIVED";
    const action = isArchived ? "restore" : "archive";

    const confirmed = window.confirm(`${isArchived ? "Restore" : "Archive"} this integration?`);
    if (!confirmed) return;

    setBusyId(row.id);
    setNotice("");
    setError("");

    try {
      const response = isArchived
        ? await adminApi.restoreSuperAdminIntegration(row.id)
        : await adminApi.archiveSuperAdminIntegration(row.id);

      setRows((current) =>
        current.map((entry) =>
          entry.id === response.integration.id ? response.integration : entry,
        ),
      );

      setNotice(`Integration ${action}d.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} integration.`);
    } finally {
      setBusyId("");
    }
  }

  function exportRows() {
    downloadCsv(
      "super-admin-integrations.csv",
      filteredRows.map((row) => {
        const record = row as Record<string, unknown>;
        return {
          id: row.id,
          name: getText(record, ["name"]),
          status: getText(record, ["status"]),
          provider: getText(record, ["provider", "providerType", "type"]),
          shopName: getText(record, ["shopName"]),
          ownerEmail: getText(record, ["ownerEmail"]),
          mappingCount: getText(record, ["mappingCount", "mappingsCount"], "0"),
          lastSyncStatus: getText(record, ["lastSyncStatus", "syncStatus"]),
          createdAt: getText(record, ["createdAt"]),
        };
      }),
    );
  }

  return (
    <AdminPageShell
      title="Integration Control"
      subtitle="Search, inspect, archive, restore, and govern owner inventory integrations."
      actions={
        <div className="admin-action-row">
          <button className="btn btn-secondary" onClick={exportRows}>
            Export CSV
          </button>
          <button className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      }
    >
      <section className="super-admin-control-panel">
        <div className="super-admin-control-header">
          <div>
            <div className="super-admin-control-kicker">Super Admin Controls</div>
            <h2 className="super-admin-control-title">Integration Control Center</h2>
            <p className="super-admin-control-subtitle">
              Search integrations, inspect sync health, review mappings, archive/restore integrations,
              and jump into shop or audit context.
            </p>
          </div>
          <div className="super-admin-control-actions">
            <button className="btn btn-secondary" onClick={exportRows}>Export CSV</button>
            <button className="btn btn-secondary" onClick={() => void load()} disabled={loading}>Refresh</button>
            <Link className="btn btn-secondary" to="/super-admin/shops">Shop Governance</Link>
            <Link className="btn btn-secondary" to="/super-admin/system">System Health</Link>
          </div>
        </div>

        <ul className="super-admin-control-list">
          <li>Use View Details to inspect integration identity, shop, owner, and status.</li>
          <li>Use Sync Jobs to review sync status summaries already returned by the oversight endpoint.</li>
          <li>Use Mappings to inspect field mapping counts and mapping readiness.</li>
          <li>Use Archive / Restore for safe non-destructive integration moderation.</li>
        </ul>
      </section>

      <div className="admin-control-bar">
        <input
          className="admin-control-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search integrations by name, provider, shop, owner, status, or id..."
        />

        <select
          className="admin-control-select"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
        >
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
          <option value="FAILED">Failed</option>
          <option value="ERROR">Error</option>
        </select>

        <select
          className="admin-control-select"
          value={String(sortKey)}
          onChange={(event) => setSortKey(event.target.value as keyof SuperAdminIntegrationRow)}
        >
          <option value="createdAt">Sort by created</option>
          <option value="updatedAt">Sort by updated</option>
          <option value="status">Sort by status</option>
          <option value="name">Sort by name</option>
        </select>

        <select
          className="admin-control-select"
          value={sortDirection}
          onChange={(event) => setSortDirection(event.target.value as SortDirection)}
        >
          <option value="desc">Descending</option>
          <option value="asc">Ascending</option>
        </select>
      </div>

      {notice ? <div className="admin-notice success">{notice}</div> : null}
      {error ? <div className="admin-notice danger">{error}</div> : null}

      <div className="admin-table-card">
        <div className="admin-table-meta">
          Showing {filteredRows.length} of {rows.length} integrations
        </div>

        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Integration</th>
                <th>Shop / Owner</th>
                <th>Status</th>
                <th>Mappings</th>
                <th>Last Sync</th>
                <th>Created</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr><td colSpan={7}>Loading integrations...</td></tr>
              ) : filteredRows.length === 0 ? (
                <tr><td colSpan={7}>No integrations match your filters.</td></tr>
              ) : (
                filteredRows.map((row) => {
                  const record = row as Record<string, unknown>;
                  const status = getIntegrationStatus(row);
                  const isArchived = status === "ARCHIVED";
                  const shopId = getText(record, ["shopId", "pawnShopId"], "");

                  return (
                    <tr key={row.id}>
                      <td>
                        <strong>{getText(record, ["name"], "Unnamed integration")}</strong>
                        <div className="admin-muted">{getText(record, ["provider", "providerType", "type"], "Unknown provider")}</div>
                        <div className="admin-muted small">{row.id}</div>
                      </td>
                      <td>
                        <strong>{getText(record, ["shopName"], "Unknown shop")}</strong>
                        <div className="admin-muted">{getText(record, ["ownerEmail", "ownerName"], "Unknown owner")}</div>
                      </td>
                      <td><span className={badgeClass(status)}>{status}</span></td>
                      <td>{getText(record, ["mappingCount", "mappingsCount"], "0")}</td>
                      <td>{getText(record, ["lastSyncStatus", "syncStatus"], "—")}</td>
                      <td>{formatDate(getText(record, ["createdAt"], ""))}</td>
                      <td style={{ textAlign: "right" }}>
                        <div className="super-admin-row-actions">
                          <button className="btn btn-secondary" onClick={() => openDetails(row, "details")}>View Details</button>
                          <button className="btn btn-secondary" onClick={() => openDetails(row, "sync")}>Sync Jobs</button>
                          <button className="btn btn-secondary" onClick={() => openDetails(row, "mappings")}>Mappings</button>
                          {shopId ? (
                            <Link className="btn btn-secondary" to={`/super-admin/shops?q=${encodeURIComponent(shopId)}`}>Shop</Link>
                          ) : null}
                          <Link className="btn btn-secondary" to={`/super-admin/audit?targetType=INTEGRATION&targetId=${row.id}`}>Audit</Link>
                          <button
                            className="btn btn-secondary"
                            disabled={busyId === row.id}
                            onClick={() => void archiveOrRestore(row)}
                          >
                            {busyId === row.id ? "Saving..." : isArchived ? "Restore" : "Archive"}
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

      {selected ? (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <section className="admin-modal-card">
            <div className="admin-modal-header">
              <div>
                <h2 className="admin-modal-title">
                  {detailMode === "details" ? "Integration Details" : detailMode === "sync" ? "Sync Jobs" : "Field Mappings"}
                </h2>
                <p className="admin-modal-subtitle">
                  {getText(selected as Record<string, unknown>, ["name"], selected.id)}
                </p>
              </div>
              <button className="btn btn-secondary" onClick={() => setSelected(null)}>Close</button>
            </div>

            <div className="stack">
              {Object.entries(selected as Record<string, unknown>).map(([key, value]) => (
                <div key={key} className="panel" style={{ padding: 12 }}>
                  <strong>{key}</strong>
                  <div className="admin-muted" style={{ wordBreak: "break-word" }}>
                    {typeof value === "object" ? JSON.stringify(value, null, 2) : String(value ?? "—")}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </AdminPageShell>
  );
}
