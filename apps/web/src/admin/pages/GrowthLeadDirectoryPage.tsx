import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import AdminPageShell from "../components/AdminPageShell";
import AdminTableShell from "../components/AdminTableShell";
import { growthCenterApi } from "../services/growthCenterApi";
import type { GrowthPagination, LeadListQuery, PawnShopLead } from "../types/growthCenter";

const EMPTY_PAGE: GrowthPagination = { page: 1, limit: 25, total: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false };
const date = (value?: string | null) => value ? new Date(value).toLocaleDateString() : "—";

export default function GrowthLeadDirectoryPage() {
  const [rows, setRows] = useState<PawnShopLead[]>([]);
  const [pagination, setPagination] = useState(EMPTY_PAGE);
  const [query, setQuery] = useState<LeadListQuery>({ page: 1, limit: 25 });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    growthCenterApi.list(query, controller.signal)
      .then((response) => { setRows(response.rows); setPagination(response.pagination); })
      .catch((reason) => {
        if (reason?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "Unable to load leads.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [query]);
  function submit(event: FormEvent) {
    event.preventDefault();
    setQuery((current) => ({ ...current, search: search.trim() || undefined, page: 1 }));
  }
  const filter = (key: keyof LeadListQuery, value: string) =>
    setQuery((current) => ({ ...current, [key]: value || undefined, page: 1 }));
  return (
    <AdminPageShell title="Master Pawn Shop Directory" subtitle="Private Super Admin lead and qualification workspace.">
      <form onSubmit={submit} className="toolbar" style={{ margin: "18px 0", gap: 10, flexWrap: "wrap" }}>
        <label>Search <input aria-label="Search leads" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Business, city, phone, email, license" /></label>
        <label>State <input aria-label="Filter by state" value={query.state || ""} onChange={(event) => filter("state", event.target.value)} /></label>
        <label>Verification <select aria-label="Filter by verification status" value={query.verificationStatus || ""} onChange={(event) => filter("verificationStatus", event.target.value)}><option value="">All</option>{["UNVERIFIED","PENDING","VERIFIED","REJECTED"].map((v) => <option key={v}>{v}</option>)}</select></label>
        <label>Outreach <select aria-label="Filter by outreach status" value={query.outreachStatus || ""} onChange={(event) => filter("outreachStatus", event.target.value)}><option value="">All</option>{["NOT_CONTACTED","CONTACTED","INTERESTED","DEMO_SCHEDULED","APPLICATION_STARTED","ONBOARDING","LIVE","DECLINED","DO_NOT_CONTACT"].map((v) => <option key={v}>{v}</option>)}</select></label>
        <label>Business <select aria-label="Filter by business status" value={query.businessStatus || ""} onChange={(event) => filter("businessStatus", event.target.value)}><option value="">All</option>{["DISCOVERED","ACTIVE","INACTIVE","CLOSED"].map((v) => <option key={v}>{v}</option>)}</select></label>
        <label>Contact permission <select aria-label="Filter by contact permission" value={query.doNotContact === undefined ? "" : String(query.doNotContact)} onChange={(event) => setQuery((current) => ({ ...current, doNotContact: event.target.value === "" ? undefined : event.target.value === "true", page: 1 }))}><option value="">All</option><option value="false">Contactable</option><option value="true">Do not contact</option></select></label>
        <button className="button" type="submit">Search</button>
      </form>
      <AdminTableShell
        loading={loading}
        error={error}
        rows={rows}
        config={{
          key: "growth-leads", title: "Leads", emptyMessage: "No pawn shop leads match these filters.",
          rowKey: (row) => row.id,
          columns: [
            { key: "business", header: "Business", render: (row) => <Link to={`/super-admin/growth/leads/${row.id}`}>{row.businessName}</Link> },
            { key: "location", header: "City/State", render: (row) => `${row.city}, ${row.state}` },
            { key: "phone", header: "Phone", render: (row) => row.phone || "—" },
            { key: "verification", header: "Verification", render: (row) => row.verificationStatus },
            { key: "outreach", header: "Outreach status", render: (row) => row.outreachStatus },
            { key: "score", header: "Lead score", render: (row) => row.leadScore },
            { key: "assigned", header: "Assigned user", render: (row) => row.assignedUser?.name || row.assignedUser?.email || "—" },
            { key: "last", header: "Last activity", render: (row) => date(row.latestActivity?.occurredAt) },
            { key: "next", header: "Next follow-up", render: (row) => date(row.nextFollowUp) },
            { key: "dnc", header: "Do not contact", render: (row) => row.doNotContact ? "Yes" : "No" },
            { key: "updated", header: "Updated", render: (row) => date(row.updatedAt) },
          ],
        }}
      />
      <div className="toolbar" style={{ marginTop: 16, justifyContent: "space-between" }}>
        <button className="button" disabled={!pagination.hasPreviousPage} onClick={() => setQuery((current) => ({ ...current, page: pagination.page - 1 }))}>Previous</button>
        <span className="muted">Page {pagination.page} of {pagination.totalPages} · {pagination.total} leads</span>
        <button className="button" disabled={!pagination.hasNextPage} onClick={() => setQuery((current) => ({ ...current, page: pagination.page + 1 }))}>Next</button>
      </div>
    </AdminPageShell>
  );
}
