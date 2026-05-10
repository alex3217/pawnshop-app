import { useCallback, useEffect, useMemo, useState } from "react";
import AdminPageShell from "../components/AdminPageShell";
import { adminApi, type SuperAdminIntegrationRow } from "../services/adminApi";

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function getStatusClass(status?: string | null) {
  const value = String(status || "").toUpperCase();

  if (["ACTIVE", "SUCCESS", "COMPLETED", "READY"].includes(value)) {
    return "bg-green-100 text-green-700";
  }

  if (["FAILED", "ERROR", "ARCHIVED", "DISABLED"].includes(value)) {
    return "bg-red-100 text-red-700";
  }

  if (["PENDING", "RUNNING", "SYNCING"].includes(value)) {
    return "bg-yellow-100 text-yellow-700";
  }

  return "bg-muted text-muted-foreground";
}

function getIntegrationType(row: SuperAdminIntegrationRow) {
  return row.kind || row.type || "UNKNOWN";
}

export default function SuperAdminIntegrationsPage() {
  const [rows, setRows] = useState<SuperAdminIntegrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await adminApi.getSuperAdminIntegrationsPaged({ limit: 150 });
      setRows(result.rows);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : "Failed to load integrations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((row) =>
      [
        row.id,
        row.name,
        row.status,
        row.kind,
        row.type,
        row.shopId,
        row.shopName,
        row.ownerId,
        row.ownerName,
        row.ownerEmail,
        row.latestJob?.status,
        row.latestJob?.error,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [query, rows]);

  const activeCount = rows.filter(
    (row) => String(row.status || "").toUpperCase() === "ACTIVE",
  ).length;

  const archivedCount = rows.filter(
    (row) => String(row.status || "").toUpperCase() === "ARCHIVED",
  ).length;

  const failedJobCount = rows.filter((row) => {
    const status = String(row.latestJob?.status || "").toUpperCase();
    return ["FAILED", "ERROR"].includes(status) || Boolean(row.latestJob?.error);
  }).length;

  async function archiveIntegration(row: SuperAdminIntegrationRow) {
    if (!row.id || busyId) return;

    const confirmed = window.confirm(`Archive integration "${row.name || row.id}"?`);
    if (!confirmed) return;

    setBusyId(row.id);
    setError("");
    setNotice("");

    try {
      const response = await adminApi.archiveSuperAdminIntegration(row.id);

      setRows((current) =>
        current.map((item) =>
          item.id === row.id
            ? {
                ...item,
                ...response.integration,
                status: response.integration.status || "ARCHIVED",
              }
            : item,
        ),
      );

      setNotice(`Archived integration "${row.name || row.id}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive integration.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <AdminPageShell
      title="Integration Oversight"
      subtitle="Monitor shop inventory feeds, sync health, mapping coverage, and credential safety without exposing secrets."
      actions={
        <button className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      }
    >
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border bg-background p-4 shadow-sm">
          <div className="text-2xl font-semibold">{rows.length}</div>
          <div className="text-sm text-muted-foreground">Total integrations</div>
        </div>
        <div className="rounded-2xl border bg-background p-4 shadow-sm">
          <div className="text-2xl font-semibold">{activeCount}</div>
          <div className="text-sm text-muted-foreground">Active</div>
        </div>
        <div className="rounded-2xl border bg-background p-4 shadow-sm">
          <div className="text-2xl font-semibold">{archivedCount}</div>
          <div className="text-sm text-muted-foreground">Archived</div>
        </div>
        <div className="rounded-2xl border bg-background p-4 shadow-sm">
          <div className="text-2xl font-semibold">{failedJobCount}</div>
          <div className="text-sm text-muted-foreground">Latest sync issues</div>
        </div>
      </div>

      {notice ? (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          {notice}
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl border bg-background p-4 shadow-sm">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search integration, shop, owner, status, sync error..."
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border bg-background shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="p-3 font-medium">Integration</th>
                <th className="p-3 font-medium">Shop / Owner</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Mapping</th>
                <th className="p-3 font-medium">Latest Sync</th>
                <th className="p-3 font-medium">Credential</th>
                <th className="p-3 font-medium">Created</th>
                <th className="p-3 font-medium text-right">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    Loading integrations...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    No integrations found.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const status = row.status || "UNKNOWN";
                  const isArchived = String(status).toUpperCase() === "ARCHIVED";

                  return (
                    <tr key={row.id} className="border-b last:border-b-0">
                      <td className="p-3">
                        <div className="font-medium">{row.name || "Unnamed integration"}</div>
                        <div className="text-muted-foreground">{getIntegrationType(row)}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{row.id}</div>
                      </td>

                      <td className="p-3">
                        <div className="font-medium">{row.shopName || "Unknown shop"}</div>
                        <div className="text-muted-foreground">{row.ownerEmail || "Unknown owner"}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{row.shopId || "—"}</div>
                      </td>

                      <td className="p-3">
                        <span className={`rounded-full px-2 py-1 text-xs ${getStatusClass(status)}`}>
                          {status}
                        </span>
                      </td>

                      <td className="p-3">
                        <div>{Number(row.mappingsCount || 0)} mappings</div>
                        <div className="text-muted-foreground">{Number(row.jobsCount || 0)} jobs loaded</div>
                      </td>

                      <td className="p-3">
                        {row.latestJob ? (
                          <>
                            <span
                              className={`rounded-full px-2 py-1 text-xs ${getStatusClass(
                                row.latestJob.status,
                              )}`}
                            >
                              {row.latestJob.status || "UNKNOWN"}
                            </span>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {formatDate(row.latestJob.updatedAt || row.latestJob.createdAt)}
                            </div>
                            {row.latestJob.error ? (
                              <div className="mt-1 max-w-[260px] text-xs text-red-600">
                                {row.latestJob.error}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-muted-foreground">No sync jobs</span>
                        )}
                      </td>

                      <td className="p-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs ${
                            row.hasCredential
                              ? "bg-green-100 text-green-700"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {row.hasCredential ? "Stored safely" : "None"}
                        </span>
                      </td>

                      <td className="p-3 text-muted-foreground">
                        {formatDate(row.createdAt)}
                      </td>

                      <td className="p-3 text-right">
                        <button
                          type="button"
                          className="button"
                          disabled={busyId === row.id || isArchived}
                          onClick={() => void archiveIntegration(row)}
                        >
                          {busyId === row.id
                            ? "Archiving..."
                            : isArchived
                              ? "Archived"
                              : "Archive"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminPageShell>
  );
}
