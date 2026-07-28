import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import AdminPageShell from "../components/AdminPageShell";
import AdminTableShell from "../components/AdminTableShell";
import {
  adminApi,
  type AdminOwnerApplication,
  type OwnerApplicationStatus,
  type PaginationMeta,
} from "../services/adminApi";

const STATUSES: OwnerApplicationStatus[] = [
  "PENDING",
  "IN_REVIEW",
  "INFORMATION_REQUESTED",
  "APPROVED",
  "REJECTED",
  "SUSPENDED",
];

const TRANSITIONS: Record<OwnerApplicationStatus, OwnerApplicationStatus[]> = {
  PENDING: ["IN_REVIEW", "INFORMATION_REQUESTED", "APPROVED", "REJECTED"],
  IN_REVIEW: ["INFORMATION_REQUESTED", "APPROVED", "REJECTED"],
  INFORMATION_REQUESTED: ["IN_REVIEW", "APPROVED", "REJECTED"],
  APPROVED: ["SUSPENDED"],
  SUSPENDED: ["APPROVED"],
  REJECTED: [],
};

const REASON_REQUIRED = new Set<OwnerApplicationStatus>([
  "INFORMATION_REQUESTED",
  "REJECTED",
  "SUSPENDED",
]);

const PAGE_LIMIT = 25;

function labelStatus(status: OwnerApplicationStatus) {
  return status.replaceAll("_", " ");
}

function formatDate(value: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleString();
}

function displayValue(value: string | null | undefined) {
  return value?.trim() || "Not provided";
}

function safeJson(value: unknown) {
  if (value === null || value === undefined) return "No additional application data.";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "Application data could not be displayed.";
  }
}

function formatAddress(value: unknown) {
  if (!value) return "Not provided";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .filter((part) => typeof part === "string" || typeof part === "number")
      .join(", ") || safeJson(value);
  }
  return String(value);
}

function safeWebsite(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ overflowWrap: "anywhere" }}>{children}</div>
    </div>
  );
}

export default function AdminOwnerApplicationsPage() {
  const [rows, setRows] = useState<AdminOwnerApplication[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<OwnerApplicationStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminOwnerApplication | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [nextStatus, setNextStatus] = useState<OwnerApplicationStatus | "">("");
  const [decisionReason, setDecisionReason] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadQueue(mode: "initial" | "refresh", signal?: AbortSignal) {
    if (mode === "initial") setLoading(true);
    if (mode === "refresh") setRefreshing(true);
    setError(null);
    try {
      const response = await adminApi.getOwnerApplications({
        ...(query ? { q: query } : {}),
        ...(status !== "ALL" ? { status } : {}),
        page,
        limit: PAGE_LIMIT,
      }, signal);
      setRows(response.rows);
      setPagination(response.pagination);
      setSelected((current) =>
        current && response.rows.some((row) => row.id === current.id) ? current : null
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setRows([]);
      setPagination(null);
      setError(err instanceof Error ? err.message : "Failed to load owner applications.");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadQueue("initial", controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, status, page]);

  async function selectApplication(application: AdminOwnerApplication) {
    setSelected(application);
    setDetailLoading(true);
    setUpdateError(null);
    setNotice(null);
    try {
      const response = await adminApi.getOwnerApplication(application.id);
      setSelected(response.application);
      setAdminNotes(response.application.adminNotes || "");
      setDecisionReason("");
      setNextStatus("");
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : "Failed to load application details.");
    } finally {
      setDetailLoading(false);
    }
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setQuery(queryInput.trim());
  }

  async function updateStatus() {
    if (!selected || !nextStatus) return;
    const reason = decisionReason.trim();
    if (REASON_REQUIRED.has(nextStatus) && !reason) {
      setUpdateError(`A reason is required when changing status to ${labelStatus(nextStatus)}.`);
      return;
    }
    if (!window.confirm(`Change this application from ${labelStatus(selected.status)} to ${labelStatus(nextStatus)}?`)) {
      return;
    }

    setUpdating(true);
    setUpdateError(null);
    setNotice(null);
    try {
      const response = await adminApi.updateOwnerApplicationStatus(selected.id, {
        status: nextStatus,
        ...(reason ? { decisionReason: reason } : {}),
        adminNotes: adminNotes.trim(),
      });
      const refreshed = await adminApi.getOwnerApplication(selected.id);
      setSelected(refreshed.application);
      setAdminNotes(refreshed.application.adminNotes || "");
      setDecisionReason("");
      setNextStatus("");
      await loadQueue("refresh");
      setNotice(
        response.requiresOwnerReauthentication
          ? "Status updated. The owner must sign in again because their authentication was invalidated."
          : "Application status updated successfully."
      );
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : "Failed to update owner application.");
    } finally {
      setUpdating(false);
    }
  }

  const counts = useMemo(
    () => Object.fromEntries(STATUSES.map((item) => [
      item,
      rows.filter((row) => row.status === item).length,
    ])) as Record<OwnerApplicationStatus, number>,
    [rows]
  );

  const website = safeWebsite(selected?.websiteUrl ?? null);
  const transitions = selected ? TRANSITIONS[selected.status] : [];

  return (
    <AdminPageShell
      title="Owner Applications"
      subtitle="Review business details and make owner onboarding decisions."
      actions={
        <button className="btn btn-secondary" type="button"
          onClick={() => void loadQueue("refresh")} disabled={loading || refreshing || updating}>
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      }
    >
      <form className="admin-control-bar" onSubmit={submitSearch}>
        <input className="admin-control-input" value={queryInput}
          onChange={(event) => setQueryInput(event.target.value)}
          placeholder="Search business or owner name/email" aria-label="Search applications" />
        <select className="admin-control-select" value={status}
          onChange={(event) => { setStatus(event.target.value as OwnerApplicationStatus | "ALL"); setPage(1); }}
          aria-label="Filter by status">
          <option value="ALL">All statuses</option>
          {STATUSES.map((item) => <option key={item} value={item}>{labelStatus(item)}</option>)}
        </select>
        <button className="btn btn-primary" type="submit" disabled={loading}>Search</button>
      </form>

      {error ? <div className="admin-notice danger">{error}</div> : null}

      {!loading ? (
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", marginBottom: 20 }}>
          <div className="list-card"><div className="muted">Loaded</div><strong style={{ fontSize: 24 }}>{rows.length}</strong></div>
          {STATUSES.map((item) => (
            <div className="list-card" key={item}><div className="muted">{labelStatus(item)}</div>
              <strong style={{ fontSize: 24 }}>{counts[item]}</strong></div>
          ))}
        </div>
      ) : null}

      <AdminTableShell
        rows={rows}
        loading={loading}
        error={null}
        config={{
          key: "owner-applications",
          title: "Application queue",
          emptyMessage: "No owner applications match the current search and status filter.",
          rowKey: (row) => row.id,
          columns: [
            { key: "business", header: "Business", render: (row) => <><strong>{displayValue(row.businessName)}</strong><div className="muted">{displayValue(row.businessEmail)}</div></> },
            { key: "owner", header: "Owner", render: (row) => <>{displayValue(row.owner?.name)}<div className="muted">{displayValue(row.owner?.email)}</div></> },
            { key: "status", header: "Status", render: (row) => <span className="pill">{labelStatus(row.status)}</span> },
            { key: "submitted", header: "Submitted", render: (row) => formatDate(row.submittedAt) },
            { key: "action", header: "Action", render: (row) => <button type="button" className="btn btn-secondary" onClick={() => void selectApplication(row)} disabled={updating}>Review</button> },
          ],
        }}
      />

      {pagination ? (
        <div className="toolbar" style={{ marginTop: 16 }}>
          <span className="muted">Page {pagination.page} of {pagination.totalPages} · {pagination.total} applications</span>
          <div className="admin-action-row">
            <button className="btn btn-secondary" type="button" disabled={!pagination.hasPreviousPage || loading || updating} onClick={() => setPage((value) => value - 1)}>Previous</button>
            <button className="btn btn-secondary" type="button" disabled={!pagination.hasNextPage || loading || updating} onClick={() => setPage((value) => value + 1)}>Next</button>
          </div>
        </div>
      ) : null}

      {selected ? (
        <section className="list-card" style={{ marginTop: 24 }}>
          <div className="toolbar">
            <div><h2 style={{ margin: 0 }}>{displayValue(selected.businessName)}</h2>
              <div className="muted">Application {selected.id}</div></div>
            <span className="pill">{labelStatus(selected.status)}</span>
          </div>

          {detailLoading ? <p className="muted">Loading application details…</p> : (
            <>
              {updateError ? <div className="admin-notice danger" style={{ marginTop: 16 }}>{updateError}</div> : null}
              {notice ? <div className="admin-notice info" style={{ marginTop: 16 }}>{notice}</div> : null}

              <div className="grid-2" style={{ marginTop: 20 }}>
                <div className="list-card"><h3>Business information</h3><div className="stack">
                  <DetailItem label="Business type">{displayValue(selected.businessType)}</DetailItem>
                  <DetailItem label="Email">{displayValue(selected.businessEmail)}</DetailItem>
                  <DetailItem label="Phone">{displayValue(selected.businessPhone)}</DetailItem>
                  <DetailItem label="Address">{formatAddress(selected.businessAddress)}</DetailItem>
                  <DetailItem label="Website">{website ? <a href={website} target="_blank" rel="noreferrer">{selected.websiteUrl}</a> : displayValue(selected.websiteUrl)}</DetailItem>
                  <DetailItem label="License">{displayValue(selected.licenseNumber)} ({displayValue(selected.licenseState)})</DetailItem>
                </div></div>
                <div className="list-card"><h3>Owner and review</h3><div className="stack">
                  <DetailItem label="Owner">{displayValue(selected.owner?.name)} · {displayValue(selected.owner?.email)}</DetailItem>
                  <DetailItem label="Owner account">{selected.owner?.isActive === false ? "Inactive" : "Active"}</DetailItem>
                  <DetailItem label="Submitted">{formatDate(selected.submittedAt)}</DetailItem>
                  <DetailItem label="Last status change">{formatDate(selected.statusChangedAt)}</DetailItem>
                  <DetailItem label="Reviewed">{formatDate(selected.reviewedAt)}</DetailItem>
                  <DetailItem label="Reviewed by">{selected.reviewedBy ? `${displayValue(selected.reviewedBy.name)} · ${selected.reviewedBy.email}` : "Not reviewed"}</DetailItem>
                </div></div>
              </div>

              <div className="grid-2" style={{ marginTop: 16 }}>
                <div className="list-card"><h3>Application data</h3>
                  <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", marginBottom: 0 }}>{safeJson(selected.applicationData)}</pre>
                </div>
                <div className="list-card"><h3>Current decision record</h3><div className="stack">
                  <DetailItem label="Decision reason">{displayValue(selected.decisionReason)}</DetailItem>
                  <DetailItem label="Administrator notes">{displayValue(selected.adminNotes)}</DetailItem>
                  <DetailItem label="Created">{formatDate(selected.createdAt)}</DetailItem>
                  <DetailItem label="Updated">{formatDate(selected.updatedAt)}</DetailItem>
                </div></div>
              </div>

              <div className="list-card" style={{ marginTop: 16 }}>
                <h3>Update status</h3>
                {transitions.length === 0 ? <p className="muted">No status transitions are available.</p> : (
                  <div className="stack">
                    <label>New status<select className="admin-control-select" value={nextStatus} disabled={updating}
                      onChange={(event) => { setNextStatus(event.target.value as OwnerApplicationStatus | ""); setUpdateError(null); }}>
                      <option value="">Select a status</option>
                      {transitions.map((item) => <option key={item} value={item}>{labelStatus(item)}</option>)}
                    </select></label>
                    <label>Decision reason {nextStatus && REASON_REQUIRED.has(nextStatus) ? "(required)" : "(optional)"}
                      <textarea className="admin-control-textarea" value={decisionReason} disabled={updating}
                        onChange={(event) => setDecisionReason(event.target.value)} /></label>
                    <label>Administrator notes (optional)
                      <textarea className="admin-control-textarea" value={adminNotes} disabled={updating}
                        onChange={(event) => setAdminNotes(event.target.value)} /></label>
                    <div><button className="btn btn-primary" type="button" onClick={() => void updateStatus()}
                      disabled={!nextStatus || updating}>{updating ? "Updating..." : "Confirm status change"}</button></div>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      ) : null}
    </AdminPageShell>
  );
}
