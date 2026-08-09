import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import AdminPageShell from "../components/AdminPageShell";
import AdminTableShell from "../components/AdminTableShell";
import {
  adminApi,
  type AdminOwnerApplication,
  type OwnerApplicationReviewHistoryEntry,
  type OwnerApplicationStatus,
  type PaginationMeta,
} from "../services/adminApi";

const STATUSES: OwnerApplicationStatus[] = ["PENDING", "IN_REVIEW", "INFORMATION_REQUESTED", "APPROVED", "REJECTED", "SUSPENDED"];
const ACTIONS: Partial<Record<OwnerApplicationStatus, Array<{ status: OwnerApplicationStatus; label: string; progress: string; consequence: string; destructive?: boolean }>>> = {
  PENDING: [
    { status: "IN_REVIEW", label: "Start Review", progress: "Starting review…", consequence: "The application will be assigned for active review." },
    { status: "INFORMATION_REQUESTED", label: "Request Information", progress: "Requesting information…", consequence: "The owner will be notified and must update and resubmit the application." },
    { status: "APPROVED", label: "Approve", progress: "Approving…", consequence: "The owner will receive approved-owner access and must sign in again." },
    { status: "REJECTED", label: "Reject", progress: "Rejecting…", consequence: "The application will be terminal and the owner will be notified.", destructive: true },
  ],
  IN_REVIEW: [
    { status: "INFORMATION_REQUESTED", label: "Request Information", progress: "Requesting information…", consequence: "The owner will be notified and must update and resubmit the application." },
    { status: "APPROVED", label: "Approve", progress: "Approving…", consequence: "The owner will receive approved-owner access and must sign in again." },
    { status: "REJECTED", label: "Reject", progress: "Rejecting…", consequence: "The application will be terminal and the owner will be notified.", destructive: true },
  ],
  INFORMATION_REQUESTED: [],
  APPROVED: [{ status: "SUSPENDED", label: "Suspend", progress: "Suspending…", consequence: "Approved-owner access will be suspended and active sessions invalidated.", destructive: true }],
  SUSPENDED: [{ status: "APPROVED", label: "Reinstate", progress: "Reinstating…", consequence: "Approved-owner access will be restored and the owner must sign in again." }],
  REJECTED: [],
};
const PAGE_LIMIT = 25;
const HISTORY_PAGE_LIMIT = 10;

function labelStatus(status: OwnerApplicationStatus) { return status.replaceAll("_", " "); }
function formatDate(value: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleString();
}
function displayValue(value: string | null | undefined) { return value?.trim() || "Not provided"; }
function formatAddress(value: unknown) {
  if (!value) return "Not provided";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).filter((part) => typeof part === "string" || typeof part === "number").join(", ") || "Not provided";
  }
  return String(value);
}
function safeWebsite(value: string | null) {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:" ? url.href : null; } catch { return null; }
}
function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return <div><div className="muted" style={{ fontSize: 12 }}>{label}</div><div style={{ overflowWrap: "anywhere" }}>{children}</div></div>;
}
function QuestionResponses({ value }: { value: unknown }) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return <p className="muted">No additional application questions were submitted.</p>;
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return <p className="muted">No additional application questions were submitted.</p>;
  return <dl className="owner-review-responses">{entries.map(([key, answer]) => <div key={key}><dt>{key.replaceAll("_", " ")}</dt><dd>{typeof answer === "object" ? <pre>{JSON.stringify(answer, null, 2)}</pre> : String(answer ?? "Not answered")}</dd></div>)}</dl>;
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
  const [detailReady, setDetailReady] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [history, setHistory] = useState<OwnerApplicationReviewHistoryEntry[]>([]);
  const [historyPagination, setHistoryPagination] = useState<PaginationMeta | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<OwnerApplicationStatus | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const reviewDialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const actionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const mutationInFlightRef = useRef(false);
  const selectedIdRef = useRef<string | null>(null);
  const detailRequestRef = useRef<AbortController | null>(null);
  const historyRequestRef = useRef<AbortController | null>(null);

  async function loadQueue(mode: "initial" | "refresh", signal?: AbortSignal) {
    if (mode === "initial") setLoading(true); else setRefreshing(true);
    setError(null);
    try {
      const response = await adminApi.getOwnerApplications({ ...(query ? { q: query } : {}), ...(status !== "ALL" ? { status } : {}), page, limit: PAGE_LIMIT }, signal);
      setRows(response.rows); setPagination(response.pagination);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setRows([]); setPagination(null); setError(err instanceof Error ? err.message : "Failed to load owner applications.");
    } finally { if (!signal?.aborted) { setLoading(false); setRefreshing(false); } }
  }
  useEffect(() => { const controller = new AbortController(); void loadQueue("initial", controller.signal); return () => controller.abort(); }, [query, status, page]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadHistory(applicationId: string, historyPage: number) {
    historyRequestRef.current?.abort();
    const controller = new AbortController();
    historyRequestRef.current = controller;
    setHistoryLoading(true); setHistoryError(null);
    try {
      const response = await adminApi.getOwnerApplicationReviewHistory(applicationId, { page: historyPage, limit: HISTORY_PAGE_LIMIT }, controller.signal);
      if (selectedIdRef.current !== applicationId || controller.signal.aborted) return;
      setHistory(response.rows); setHistoryPagination(response.pagination);
    } catch (err) {
      if (controller.signal.aborted || selectedIdRef.current !== applicationId) return;
      setHistory([]); setHistoryPagination(null); setHistoryError(err instanceof Error ? err.message : "Failed to load review history.");
    } finally { if (selectedIdRef.current === applicationId && !controller.signal.aborted) setHistoryLoading(false); }
  }
  async function loadDetail(id: string) {
    detailRequestRef.current?.abort();
    const controller = new AbortController();
    detailRequestRef.current = controller;
    setDetailLoading(true); setDetailReady(false); setDetailError(null); setUpdateError(null);
    try {
      const response = await adminApi.getOwnerApplication(id, controller.signal);
      if (selectedIdRef.current !== id || controller.signal.aborted) return;
      setSelected(response.application); setAdminNotes(response.application.adminNotes || "");
      setDetailReady(true);
    } catch (err) {
      if (controller.signal.aborted || selectedIdRef.current !== id) return;
      setDetailError(err instanceof Error ? err.message : "Failed to load application details.");
    } finally { if (selectedIdRef.current === id && !controller.signal.aborted) setDetailLoading(false); }
  }
  function selectApplication(application: AdminOwnerApplication, trigger?: HTMLElement) {
    selectedIdRef.current = application.id; triggerRef.current = trigger || triggerRef.current; setSelected(application); setDetailReady(false); setDetailError(null); setHistory([]); setHistoryPagination(null); setNotice(null); setConfirmStatus(null); setDecisionReason("");
    void Promise.all([loadDetail(application.id), loadHistory(application.id, 1)]);
  }
  function closeReview() {
    if (updating) return;
    detailRequestRef.current?.abort(); historyRequestRef.current?.abort(); selectedIdRef.current = null;
    setConfirmStatus(null); setSelected(null); setDetailReady(false); setDetailError(null); setUpdateError(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }
  function closeConfirmation() { setConfirmStatus(null); setUpdateError(null); requestAnimationFrame(() => actionTriggerRef.current?.focus()); }
  useEffect(() => {
    if (!selected) return;
    const previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => { document.body.style.overflow = previousOverflow; };
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); if (confirmStatus && !updating) closeConfirmation(); else closeReview(); return; }
      if (event.key !== "Tab") return;
      const root = confirmStatus ? document.querySelector<HTMLElement>("[data-owner-confirm]") : reviewDialogRef.current;
      const focusable = Array.from(root?.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]') || []);
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selected, confirmStatus, updating]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (confirmStatus) reasonRef.current?.focus(); }, [confirmStatus]);

  function submitSearch(event: FormEvent) { event.preventDefault(); setPage(1); setQuery(queryInput.trim()); }
  function clearFilters() { setQueryInput(""); setQuery(""); setStatus("ALL"); setPage(1); }
  function openConfirmation(next: OwnerApplicationStatus, trigger: HTMLButtonElement) { actionTriggerRef.current = trigger; setDecisionReason(""); setConfirmStatus(next); setUpdateError(null); }
  async function updateStatus() {
    if (!selected || !detailReady || detailLoading || detailError || !confirmStatus || updating || mutationInFlightRef.current) return;
    const reason = decisionReason.trim();
    if (!reason) { setUpdateError("A nonblank reason or review note is required."); reasonRef.current?.focus(); return; }
    const applicationId = selected.id; mutationInFlightRef.current = true; setUpdating(true); setUpdateError(null); setNotice(null);
    try {
      const response = await adminApi.updateOwnerApplicationStatus(applicationId, { status: confirmStatus, decisionReason: reason, ...(adminNotes.trim() ? { adminNotes: adminNotes.trim() } : {}) });
      setConfirmStatus(null); setDecisionReason("");
      await Promise.all([loadDetail(applicationId), loadHistory(applicationId, 1), loadQueue("refresh")]);
      setNotice(response.requiresOwnerReauthentication ? "Status updated. The owner must sign in again because their authentication was invalidated." : "Application status updated successfully.");
    } catch (err) { setUpdateError(err instanceof Error ? err.message : "The status update was rejected. Refresh the application and try again."); }
    finally { mutationInFlightRef.current = false; setUpdating(false); }
  }

  const counts = useMemo(() => Object.fromEntries(STATUSES.map((item) => [item, rows.filter((row) => row.status === item).length])) as Record<OwnerApplicationStatus, number>, [rows]);
  const selectedIndex = selected ? rows.findIndex((row) => row.id === selected.id) : -1;
  const actions = selected && detailReady && !detailLoading && !detailError ? ACTIONS[selected.status] || [] : [];
  const chosenAction = selected && detailReady && confirmStatus ? (ACTIONS[selected.status] || []).find((item) => item.status === confirmStatus) : undefined;
  const website = safeWebsite(selected?.websiteUrl ?? null);
  const incomplete = selected ? [
    ["Business name", selected.businessName], ["Business type", selected.businessType], ["Business email", selected.businessEmail], ["Business phone", selected.businessPhone],
    ["Business address", selected.businessAddress], ["Owner name", selected.owner?.name], ["Owner email", selected.owner?.email],
  ].filter(([, value]) => value === null || value === undefined || value === "") : [];

  return <AdminPageShell title="Owner Applications" subtitle="Review business details and make owner onboarding decisions." actions={<button className="btn btn-secondary" type="button" onClick={() => void loadQueue("refresh")} disabled={loading || refreshing || updating}>{refreshing ? "Refreshing…" : "Refresh"}</button>}>
    <form className="admin-control-bar" onSubmit={submitSearch}>
      <input className="admin-control-input" value={queryInput} onChange={(event) => setQueryInput(event.target.value)} placeholder="Search business or owner name/email" aria-label="Search applications" />
      <select className="admin-control-select" value={status} onChange={(event) => { setStatus(event.target.value as OwnerApplicationStatus | "ALL"); setPage(1); }} aria-label="Filter by status"><option value="ALL">All statuses</option>{STATUSES.map((item) => <option key={item} value={item}>{labelStatus(item)}</option>)}</select>
      <button className="btn btn-primary" type="submit" disabled={loading}>Search</button>
      <button className="btn btn-secondary" type="button" disabled={loading || (!query && status === "ALL")} onClick={clearFilters}>Clear Filters</button>
    </form>
    {error ? <div className="admin-notice danger" role="alert"><div>{error}</div><button className="btn btn-secondary" type="button" onClick={() => void loadQueue("refresh")}>Retry</button></div> : null}
    {!loading ? <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", marginBottom: 20 }}><div className="list-card"><div className="muted">Results</div><strong style={{ fontSize: 24 }}>{pagination?.total ?? rows.length}</strong></div>{STATUSES.map((item) => <div className="list-card" key={item}><div className="muted">{labelStatus(item)} on this page</div><strong style={{ fontSize: 24 }}>{counts[item]}</strong></div>)}</div> : null}
    <AdminTableShell rows={rows} loading={loading} error={null} config={{ key: "owner-applications", title: "Application queue", emptyMessage: "No owner applications match the current search and status filter.", rowKey: (row) => row.id, columns: [
      { key: "business", header: "Business", render: (row) => <><strong>{displayValue(row.businessName)}</strong><div className="muted">{displayValue(row.businessEmail)}</div></> },
      { key: "owner", header: "Owner", render: (row) => <>{displayValue(row.owner?.name)}<div className="muted">{displayValue(row.owner?.email)}</div></> },
      { key: "status", header: "Status", render: (row) => <span className="pill" aria-label={`Status: ${labelStatus(row.status)}`}>{labelStatus(row.status)}</span> },
      { key: "submitted", header: "Submitted", render: (row) => formatDate(row.submittedAt) },
      { key: "action", header: "Action", render: (row) => <button type="button" className="btn btn-secondary" onClick={(event) => selectApplication(row, event.currentTarget)} disabled={updating} aria-label={`Review ${displayValue(row.businessName)} application`}>Review</button> },
    ] }} />
    {pagination ? <div className="toolbar" style={{ marginTop: 16 }}><span className="muted">Page {pagination.page} of {pagination.totalPages} · {pagination.total} applications</span><div className="admin-action-row"><button className="btn btn-secondary" type="button" disabled={!pagination.hasPreviousPage || loading || updating} onClick={() => setPage((value) => value - 1)}>Previous</button><button className="btn btn-secondary" type="button" disabled={!pagination.hasNextPage || loading || updating} onClick={() => setPage((value) => value + 1)}>Next</button></div></div> : null}

    {selected ? <div className="admin-modal-backdrop owner-review-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeReview(); }}>
      <div className="admin-modal-card owner-review-dialog" role="dialog" aria-modal={confirmStatus ? undefined : "true"} aria-hidden={confirmStatus ? "true" : undefined} inert={confirmStatus ? true : undefined} aria-labelledby="owner-review-title" ref={reviewDialogRef}>
        <header className="admin-modal-header owner-review-header"><div><h2 className="admin-modal-title" id="owner-review-title">Review {displayValue(selected.businessName)}</h2><p className="admin-modal-subtitle">Application {selected.id} · <strong>{labelStatus(selected.status)}</strong></p></div><button ref={closeButtonRef} className="btn btn-secondary" type="button" onClick={closeReview} disabled={updating} aria-label="Close application review">Close</button></header>
        <div className="owner-review-navigation" aria-label="Application review navigation"><button className="btn btn-secondary" type="button" disabled={selectedIndex <= 0 || updating} onClick={() => selectApplication(rows[selectedIndex - 1])}>Previous Application</button><button className="btn btn-secondary" type="button" disabled={selectedIndex < 0 || selectedIndex >= rows.length - 1 || updating} onClick={() => selectApplication(rows[selectedIndex + 1])}>Next Application</button><button className="btn btn-secondary" type="button" disabled={detailLoading || historyLoading || updating} onClick={() => void Promise.all([loadDetail(selected.id), loadHistory(selected.id, 1)])}>{detailLoading ? "Refreshing…" : "Refresh Application"}</button></div>
        {detailLoading ? <p className="muted" role="status">Loading application details… Review actions are unavailable until loading completes.</p> : detailError || !detailReady ? <div className="admin-notice danger owner-review-detail-error" role="alert"><div><strong>Application details unavailable.</strong><div>{detailError || "The complete application has not been loaded."}</div><div>Review actions remain unavailable until a fresh detail request succeeds.</div></div><button className="btn btn-secondary" type="button" onClick={() => void Promise.all([loadDetail(selected.id), loadHistory(selected.id, 1)])}>Retry Application Details</button></div> : <>
          {updateError && !confirmStatus ? <div className="admin-notice danger" role="alert">{updateError}</div> : null}{notice ? <div className="admin-notice info" role="status">{notice}</div> : null}
          <div className="grid-2 owner-review-grid"><section className="list-card"><h3>Business information</h3><div className="stack"><DetailItem label="Business name">{displayValue(selected.businessName)}</DetailItem><DetailItem label="Business type">{displayValue(selected.businessType)}</DetailItem><DetailItem label="Email">{displayValue(selected.businessEmail)}</DetailItem><DetailItem label="Phone">{displayValue(selected.businessPhone)}</DetailItem><DetailItem label="Address and location">{formatAddress(selected.businessAddress)}</DetailItem><DetailItem label="Website">{website ? <a href={website} target="_blank" rel="noreferrer">{selected.websiteUrl}</a> : displayValue(selected.websiteUrl)}</DetailItem><DetailItem label="License">{displayValue(selected.licenseNumber)} ({displayValue(selected.licenseState)})</DetailItem></div></section>
          <section className="list-card"><h3>Owner and review</h3><div className="stack"><DetailItem label="Owner">{displayValue(selected.owner?.name)} · {displayValue(selected.owner?.email)}</DetailItem><DetailItem label="Owner account">{selected.owner?.isActive === false ? "Inactive" : "Active"}</DetailItem><DetailItem label="Application status">{labelStatus(selected.status)}</DetailItem><DetailItem label="Submitted">{formatDate(selected.submittedAt)}</DetailItem><DetailItem label="Last updated">{formatDate(selected.updatedAt)}</DetailItem><DetailItem label="Last status change">{formatDate(selected.statusChangedAt)}</DetailItem><DetailItem label="Current reviewer">{selected.reviewedBy ? `${displayValue(selected.reviewedBy.name)} · ${selected.reviewedBy.email} (${selected.reviewedBy.role})` : "Not assigned"}</DetailItem></div></section></div>
          <div className="grid-2 owner-review-grid"><section className="list-card"><h3>Application questions and responses</h3><QuestionResponses value={selected.applicationData} /></section><section className="list-card"><h3>Missing or incomplete information</h3>{incomplete.length ? <ul>{incomplete.map(([label]) => <li key={String(label)}>{String(label)}</li>)}</ul> : <p className="muted">No incomplete standard application fields were detected. The backend does not designate additional fields as required.</p>}</section></div>
          <section className="list-card"><h3>Current reviewer notes and decision</h3><div className="grid-2"><DetailItem label="Decision reason or information request">{displayValue(selected.decisionReason)}</DetailItem><DetailItem label="Administrator notes">{displayValue(selected.adminNotes)}</DetailItem></div></section>
          <section className="owner-application-audit list-card" aria-labelledby="owner-application-audit-title"><div className="toolbar"><div><h3 id="owner-application-audit-title" style={{ margin: 0 }}>Review history</h3><div className="muted">Administrator actions and applicant resubmissions appear in workflow order when recorded by the backend.</div></div><button className="btn btn-secondary" type="button" disabled={historyLoading || updating} onClick={() => void loadHistory(selected.id, historyPagination?.page || 1)}>{historyLoading ? "Loading…" : "Refresh history"}</button></div>
            {historyLoading ? <p className="owner-application-audit__state muted" role="status">Loading review history…</p> : historyError ? <div className="admin-notice danger owner-application-audit__state" role="alert"><div>{historyError}</div><button className="btn btn-secondary" type="button" onClick={() => void loadHistory(selected.id, historyPagination?.page || 1)}>Try again</button></div> : history.length === 0 ? <p className="owner-application-audit__state muted">No administrator review actions have been recorded yet.</p> : <><ol className="owner-application-audit__timeline">{history.map((entry) => <li className="owner-application-audit__entry" key={entry.id}><div className="owner-application-audit__heading"><strong>{labelStatus(entry.previousStatus)} → {labelStatus(entry.newStatus)}</strong><time dateTime={entry.reviewedAt || undefined}>{formatDate(entry.reviewedAt)}</time></div><div className="muted">{displayValue(entry.reviewer.name)} · {displayValue(entry.reviewer.email)} · {displayValue(entry.reviewer.role)}</div><dl className="owner-application-audit__details"><div><dt>Decision reason / request</dt><dd>{displayValue(entry.decisionReason)}</dd></div><div><dt>Administrator notes</dt><dd>{displayValue(entry.adminNotes)}</dd></div><div><dt>Audit reference</dt><dd>{entry.id}</dd></div></dl></li>)}</ol>{historyPagination ? <div className="owner-application-audit__pagination"><span className="muted">Page {historyPagination.page} of {historyPagination.totalPages} · {historyPagination.total} actions</span><div className="admin-action-row"><button className="btn btn-secondary" type="button" disabled={!historyPagination.hasPreviousPage || historyLoading} onClick={() => void loadHistory(selected.id, historyPagination.page - 1)}>Newer</button><button className="btn btn-secondary" type="button" disabled={!historyPagination.hasNextPage || historyLoading} onClick={() => void loadHistory(selected.id, historyPagination.page + 1)}>Older</button></div></div> : null}</>}
          </section>
          <section className="list-card"><h3>Available actions</h3>{selected.status === "INFORMATION_REQUESTED" ? <p className="admin-notice info" role="status"><strong>Waiting for owner response.</strong> Review actions will resume after the owner updates and resubmits the requested information. Resubmission automatically moves the application to IN REVIEW.</p> : null}{actions.length ? <div className="admin-action-row">{actions.map((action) => <button key={action.status} className={`btn ${action.destructive ? "btn-danger" : "btn-primary"}`} type="button" disabled={updating} onClick={(event) => openConfirmation(action.status, event.currentTarget)}>{action.label}</button>)}</div> : selected.status === "INFORMATION_REQUESTED" ? null : <p className="muted">This status is terminal. No status transitions are available.</p>}</section>
        </>}
        <footer className="admin-modal-footer"><button className="btn btn-secondary" type="button" onClick={closeReview} disabled={updating}>Back to Applications</button></footer>
      </div>
      {confirmStatus && chosenAction ? <div className="owner-confirm-backdrop"><form className="admin-modal-card owner-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="owner-confirm-title" data-owner-confirm onSubmit={(event) => { event.preventDefault(); void updateStatus(); }}>
        <h2 className="admin-modal-title" id="owner-confirm-title">Confirm {chosenAction.label}</h2><p><strong>Applicant:</strong> {displayValue(selected.owner?.name)} ({displayValue(selected.owner?.email)})</p><p><strong>Status:</strong> {labelStatus(selected.status)} → {labelStatus(confirmStatus)}</p><p>{chosenAction.consequence}</p>
        <label className="admin-form-label">Reason or review note (required)<textarea ref={reasonRef} className="admin-control-textarea" value={decisionReason} disabled={updating} onChange={(event) => { setDecisionReason(event.target.value); setUpdateError(null); }} aria-describedby="owner-confirm-help" /></label><div id="owner-confirm-help" className="muted">This text is recorded in review history and may be shown to the applicant for decision and information-request actions.</div>
        <label className="admin-form-label">Administrator notes (optional)<textarea className="admin-control-textarea" value={adminNotes} disabled={updating} onChange={(event) => setAdminNotes(event.target.value)} /></label>
        {updateError ? <div className="admin-notice danger" role="alert">{updateError}</div> : null}<div className="admin-modal-footer"><button className="btn btn-secondary" type="button" disabled={updating} onClick={closeConfirmation}>Cancel</button><button className={`btn ${chosenAction.destructive ? "btn-danger" : "btn-primary"}`} type="submit" disabled={updating}>{updating ? chosenAction.progress : `Confirm ${chosenAction.label}`}</button></div>
      </form></div> : null}
    </div> : null}
  </AdminPageShell>;
}
