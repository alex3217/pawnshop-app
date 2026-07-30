import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import AdminPageShell from "../components/AdminPageShell";
import { growthCenterApi } from "../services/growthCenterApi";
import type { PawnShopLead } from "../types/growthCenter";

const value = (input?: string | number | null) => input === null || input === undefined || input === "" ? "—" : String(input);
const when = (input?: string | null) => input ? new Date(input).toLocaleString() : "—";

export default function GrowthLeadDetailPage() {
  const { leadId = "" } = useParams();
  const [lead, setLead] = useState<PawnShopLead | null>(null);
  const [error, setError] = useState("");
  const [activity, setActivity] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [saving, setSaving] = useState(false);
  const load = useCallback(
    () => growthCenterApi.detail(leadId).then((response) => setLead(response.lead)),
    [leadId],
  );
  useEffect(() => {
    setError("");
    load().catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load lead."));
  }, [load]);
  async function addActivity(event: FormEvent) {
    event.preventDefault();
    if (!activity.trim()) return;
    setSaving(true); setError("");
    try {
      await growthCenterApi.addActivity(leadId, { activityType: "NOTE", channel: "INTERNAL", direction: "INTERNAL", notes: activity.trim(), nextFollowUpAt: followUp ? new Date(followUp).toISOString() : null });
      setActivity(""); setFollowUp(""); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to add activity."); }
    finally { setSaving(false); }
  }
  async function suppress() {
    const reason = window.prompt("Reason for do-not-contact suppression:");
    if (!reason?.trim()) return;
    try { await growthCenterApi.suppress(leadId, { reason: reason.trim() }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to suppress lead."); }
  }
  if (error && !lead) return <AdminPageShell title="Pawn Shop Lead"><div role="alert" className="error-text">{error}</div></AdminPageShell>;
  if (!lead) return <AdminPageShell title="Pawn Shop Lead"><p className="muted">Loading lead…</p></AdminPageShell>;
  const section = (title: string, entries: [string, unknown][]) => (
    <section className="list-card"><h2>{title}</h2><dl>{entries.map(([label, entry]) => <div key={label} style={{ marginBottom: 8 }}><dt className="muted">{label}</dt><dd>{value(entry as string | number | null)}</dd></div>)}</dl></section>
  );
  return (
    <AdminPageShell title={lead.businessName} subtitle={`${lead.city}, ${lead.state}`} actions={<Link className="button" to="/super-admin/growth/leads">Back to directory</Link>}>
      {error ? <div role="alert" className="error-text">{error}</div> : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginTop: 18 }}>
        {section("Business information", [["Legal name", lead.legalName], ["Address", `${lead.addressLine1}${lead.addressLine2 ? `, ${lead.addressLine2}` : ""}`], ["Location", `${lead.city}, ${lead.state} ${lead.postalCode}`], ["Country", lead.country], ["Business status", lead.businessStatus]])}
        {section("Public contact information", [["Phone", lead.phone], ["Public email", lead.publicEmail], ["Website", lead.website]])}
        {section("Licensing information", [["License number", lead.licenseNumber], ["Authority", lead.licenseAuthority], ["Status", lead.licenseStatus], ["Expiration", when(lead.licenseExpirationDate)]])}
        {section("Lead status and score", [["Verification", lead.verificationStatus], ["Outreach", lead.outreachStatus], ["Lead score", lead.leadScore], ["Assigned user", lead.assignedUser?.name || lead.assignedUser?.email], ["Next follow-up", when(lead.nextFollowUp)]])}
      </div>
      <section className="list-card" style={{ marginTop: 14 }}>
        <div className="toolbar" style={{ justifyContent: "space-between" }}><h2>Suppression / contact permission</h2><button className="button" disabled={lead.doNotContact} onClick={suppress}>{lead.doNotContact ? "Do not contact" : "Suppress contact"}</button></div>
        <p>{lead.doNotContact ? "Outreach is prohibited for this lead." : "No do-not-contact suppression is active."}</p>
        {lead.suppressions?.map((item) => <p key={item.id} className="muted">{when(item.suppressedAt)} · {item.reason} ({item.source})</p>)}
      </section>
      <section className="list-card" style={{ marginTop: 14 }}><h2>Contacts</h2>{lead.contacts?.length ? lead.contacts.map((contact) => <div key={contact.id}><strong>{contact.name || contact.contactType}</strong> · {value(contact.title)} · {value(contact.email)} · {value(contact.phone)} {contact.isPrimary ? "· Primary" : ""}</div>) : <p className="muted">No contacts recorded.</p>}</section>
      <section className="list-card" style={{ marginTop: 14 }}><h2>Activity timeline</h2>
        <form onSubmit={addActivity} style={{ display: "grid", gap: 8, marginBottom: 14 }}><label>Internal activity note<textarea aria-label="Internal activity note" value={activity} onChange={(event) => setActivity(event.target.value)} required /></label><label>Next follow-up<input aria-label="Next follow-up" type="datetime-local" value={followUp} onChange={(event) => setFollowUp(event.target.value)} /></label><button className="button" disabled={saving}>{saving ? "Saving…" : "Add activity"}</button></form>
        {lead.activities?.length ? lead.activities.map((item) => <article key={item.id} style={{ borderTop: "1px solid rgba(255,255,255,.1)", padding: "10px 0" }}><strong>{item.activityType}</strong> · {when(item.occurredAt)}<div>{value(item.subject || item.notes)}</div>{item.nextFollowUpAt ? <div className="muted">Follow up: {when(item.nextFollowUpAt)}</div> : null}</article>) : <p className="muted">No activity recorded.</p>}
      </section>
      <section className="list-card" style={{ marginTop: 14 }}><h2>Source provenance</h2>{lead.sources?.length ? lead.sources.map((source) => <div key={source.id}><strong>{source.sourceName}</strong> · {source.sourceType} · collected {when(source.collectedAt)}{source.sourceUrl ? <> · <a href={source.sourceUrl} target="_blank" rel="noreferrer">Source</a></> : null}</div>) : <p className="muted">{lead.sourceName || lead.sourceType}</p>}</section>
    </AdminPageShell>
  );
}
