import { useEffect, useMemo, useState } from "react";
import AdminPageShell from "../components/AdminPageShell";
import { adminApi, type SuperAdminSystemHealth } from "../services/adminApi";

function statusClass(ok?: boolean) {
  if (ok === true) return "bg-green-100 text-green-700";
  if (ok === false) return "bg-red-100 text-red-700";
  return "bg-muted text-muted-foreground";
}

function statusText(ok?: boolean) {
  if (ok === true) return "OK";
  if (ok === false) return "Issue";
  return "Unknown";
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatMemory(bytes?: number) {
  if (!Number.isFinite(Number(bytes))) return "—";
  const mb = Number(bytes) / 1024 / 1024;
  return `${mb.toFixed(1)} MB`;
}

function renderValue(value: unknown) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" || typeof value === "string") return String(value);

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default function SuperAdminSystemHealthPage() {
  const [data, setData] = useState<SuperAdminSystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const next = await adminApi.getSuperAdminSystemHealth();
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load system health.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const checks = useMemo(() => Object.entries(data?.checks || {}), [data]);

  const runtime = data?.env?.runtime;
  const warnings = data?.warnings || [];
  const failedSyncJobs = data?.recent?.failedSyncJobs || [];
  const auditRecords = data?.recent?.auditRecords || [];

  return (
    <AdminPageShell
      title="System Health"
      subtitle="Monitor API readiness, database status, provider configuration, audit failures, and integration sync issues."
      actions={
        <button className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      }
    >
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border bg-background p-4 shadow-sm">
          <span className={`rounded-full px-2 py-1 text-xs ${statusClass(data?.ok)}`}>
            {statusText(data?.ok)}
          </span>
          <div className="mt-3 text-2xl font-semibold">API</div>
          <div className="text-sm text-muted-foreground">
            {formatDate(data?.generatedAt)}
          </div>
        </div>

        <div className="rounded-2xl border bg-background p-4 shadow-sm">
          <span className={`rounded-full px-2 py-1 text-xs ${statusClass(data?.checks?.database?.ok)}`}>
            {statusText(data?.checks?.database?.ok)}
          </span>
          <div className="mt-3 text-2xl font-semibold">Database</div>
          <div className="text-sm text-muted-foreground">
            {data?.checks?.database?.error || "PostgreSQL connection check"}
          </div>
        </div>

        <div className="rounded-2xl border bg-background p-4 shadow-sm">
          <div className="text-2xl font-semibold">{warnings.length}</div>
          <div className="text-sm text-muted-foreground">Warnings</div>
        </div>

        <div className="rounded-2xl border bg-background p-4 shadow-sm">
          <div className="text-2xl font-semibold">{failedSyncJobs.length}</div>
          <div className="text-sm text-muted-foreground">Recent sync issues</div>
        </div>
      </div>

      {warnings.length ? (
        <div className="mt-4 rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          <div className="font-semibold">Warnings</div>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          No system warnings reported.
        </div>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border bg-background p-4 shadow-sm">
          <div className="font-semibold">Runtime</div>
          <dl className="mt-3 grid gap-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Environment</dt>
              <dd>{data?.env?.nodeEnv || "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Port</dt>
              <dd>{data?.env?.port || "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Node</dt>
              <dd>{runtime?.node || "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">PID</dt>
              <dd>{runtime?.pid || "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Uptime</dt>
              <dd>{runtime?.uptimeSeconds ?? "—"}s</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">RSS</dt>
              <dd>{formatMemory(runtime?.memory?.rss)}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border bg-background p-4 shadow-sm">
          <div className="font-semibold">Providers</div>
          <dl className="mt-3 grid gap-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Stripe key</dt>
              <dd>{data?.providers?.stripe?.secretKey?.configured ? "Configured" : "Missing"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Stripe webhook</dt>
              <dd>{data?.providers?.stripe?.webhookSecretConfigured ? "Configured" : "Missing"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">OpenAI key</dt>
              <dd>{data?.providers?.openai?.apiKey?.configured ? "Configured" : "Missing"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">OpenAI model</dt>
              <dd>{data?.providers?.openai?.listingModel || "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Redis URL</dt>
              <dd>{data?.providers?.redis?.urlConfigured ? "Configured" : "Missing"}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border bg-background p-4 shadow-sm">
          <div className="font-semibold">Counts</div>
          <dl className="mt-3 grid gap-2 text-sm">
            {checks
              .filter(([key]) => !["database"].includes(key))
              .slice(0, 8)
              .map(([key, check]) => (
                <div key={key} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{key}</dt>
                  <dd>{renderValue(check.value)}</dd>
                </div>
              ))}
          </dl>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border bg-background shadow-sm">
          <div className="border-b bg-muted/40 p-3 font-semibold">Recent Failed Sync Jobs</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-3">ID</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Error</th>
                  <th className="p-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {failedSyncJobs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-muted-foreground">
                      No recent sync failures.
                    </td>
                  </tr>
                ) : (
                  failedSyncJobs.map((job, index) => (
                    <tr key={String(job.id || index)} className="border-b last:border-b-0">
                      <td className="p-3">{String(job.id || "—")}</td>
                      <td className="p-3">{String(job.status || "—")}</td>
                      <td className="p-3">{String(job.error || job.errorMessage || "—")}</td>
                      <td className="p-3">{formatDate(String(job.updatedAt || job.createdAt || ""))}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border bg-background shadow-sm">
          <div className="border-b bg-muted/40 p-3 font-semibold">Recent Audit Records</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-3">Action</th>
                  <th className="p-3">Actor</th>
                  <th className="p-3">Target</th>
                  <th className="p-3">Result</th>
                </tr>
              </thead>
              <tbody>
                {auditRecords.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-muted-foreground">
                      No audit records available.
                    </td>
                  </tr>
                ) : (
                  auditRecords.map((row, index) => (
                    <tr key={String(row.id || index)} className="border-b last:border-b-0">
                      <td className="p-3">{String(row.action || "—")}</td>
                      <td className="p-3">{String(row.actorEmail || "—")}</td>
                      <td className="p-3">
                        {String(row.targetType || "—")} · {String(row.targetId || "—")}
                      </td>
                      <td className="p-3">
                        <span className={`rounded-full px-2 py-1 text-xs ${statusClass(Boolean(row.success))}`}>
                          {row.success ? "Success" : "Failed"} {String(row.statusCode || "")}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminPageShell>
  );
}
