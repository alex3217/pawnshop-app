import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  adminApi,
  type PlatformConfigurationRow,
  type PlatformPricingRuleRow,
  type PlatformSettingRow,
} from "../services/adminApi";

type Area = "feature-flags" | "commission-rules" | "listing-rules" | "auction-rules";
type ConfigArea = Exclude<Area, "commission-rules">;
const AREAS: Array<{ id: Area; title: string; description: string }> = [
  { id: "feature-flags", title: "Feature Flags", description: "Control feature availability, rollout, and targeting." },
  { id: "commission-rules", title: "Commission Rules", description: "Configure marketplace fees and seller-plan overrides." },
  { id: "listing-rules", title: "Listing Rules", description: "Control listing eligibility, limits, and moderation." },
  { id: "auction-rules", title: "Auction Rules", description: "Configure bidding, payment, cancellation, and review behavior." },
];

const inputClass = "w-full rounded-lg border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600";
const list = (value: FormDataEntryValue | null) => String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
const number = (value: FormDataEntryValue | null) => Number(value || 0);
const checked = (form: FormData, key: string) => form.get(key) === "on";
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleString() : "—";
function settingValue(value?: string | null) {
  if (value == null) return "";
  try { const parsed = JSON.parse(value); return typeof parsed === "string" ? parsed : JSON.stringify(parsed); } catch { return value; }
}

function Field({ label, name, defaultValue, type = "text", required = false, min, max, step }: { label: string; name: string; defaultValue?: string | number; type?: string; required?: boolean; min?: number; max?: number; step?: number }) {
  return <label className="grid gap-1 text-sm font-medium">{label}<input className={inputClass} name={name} type={type} defaultValue={defaultValue} required={required} min={min} max={max} step={step} /></label>;
}
function Check({ label, name, defaultChecked = false }: { label: string; name: string; defaultChecked?: boolean }) {
  return <label className="flex items-center gap-2 text-sm font-medium"><input name={name} type="checkbox" defaultChecked={defaultChecked} className="h-4 w-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" />{label}</label>;
}

export default function SuperAdminPlatformSettingsPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get("section") as Area | null;
  const area = AREAS.some((item) => item.id === requested) ? requested : null;
  const [settings, setSettings] = useState<PlatformSettingRow[]>([]);
  const [rows, setRows] = useState<PlatformConfigurationRow[]>([]);
  const [commissions, setCommissions] = useState<PlatformPricingRuleRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<PlatformConfigurationRow | PlatformPricingRuleRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showSettingForm, setShowSettingForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const settingFormRef = useRef<HTMLFormElement>(null);

  async function load() {
    setLoading(true); setError("");
    try {
      const base = await adminApi.getPlatformSettings();
      setSettings(base); setDrafts(Object.fromEntries(base.map((row) => [row.key, settingValue(row.value)])));
      if (area === "commission-rules") {
        const values = await adminApi.getSuperAdminPricingRules();
        setCommissions(values.filter((row) => row.category === "MARKETPLACE_COMMISSION"));
      } else if (area) setRows(await adminApi.getPlatformConfigurations(area));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load platform settings."); }
    finally { setLoading(false); }
  }
  useEffect(() => { setEditing(null); setShowForm(false); void load(); }, [area]); // eslint-disable-line react-hooks/exhaustive-deps

  function openArea(next: Area) { setParams({ section: next }); }
  function notify(message: string) { setSuccess(message); window.setTimeout(() => setSuccess(""), 4000); }

  async function saveSetting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const form = new FormData(event.currentTarget); const key = String(form.get("key") || "").trim();
    if (!key) { setError("Setting key is required."); setSaving(false); return; }
    try { await adminApi.updatePlatformSetting({ key, value: String(form.get("value") || ""), expectedUpdatedAt: settings.find((row) => row.key === key)?.updatedAt }); setShowSettingForm(false); notify("Platform setting saved."); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save setting."); } finally { setSaving(false); }
  }

  async function exportSettings() {
    setError("");
    try {
      const [flags, listings, auctions, pricing] = await Promise.all([
        adminApi.getPlatformConfigurations("feature-flags"), adminApi.getPlatformConfigurations("listing-rules"),
        adminApi.getPlatformConfigurations("auction-rules"), adminApi.getSuperAdminPricingRules(),
      ]);
      const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), settings, featureFlags: flags, commissionRules: pricing.filter((item) => item.category === "MARKETPLACE_COMMISSION"), listingRules: listings, auctionRules: auctions }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `platform-settings-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url); notify("Settings export downloaded.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to export settings."); }
  }

  async function saveConfiguration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!area || area === "commission-rules") return;
    setSaving(true); setError(""); const form = new FormData(event.currentTarget);
    const common: Record<string, unknown> = { key: form.get("key"), displayName: form.get("displayName"), description: form.get("description"), enabled: checked(form, "enabled"), archived: false };
    let input: Record<string, unknown> = common;
    if (area === "feature-flags") input = { ...common, environment: form.get("environment"), rolloutPercentage: number(form.get("rolloutPercentage")), targetRoles: list(form.get("targetRoles")), targetPlans: list(form.get("targetPlans")) };
    if (area === "listing-rules") input = { ...common, category: form.get("category"), allowedConditions: list(form.get("allowedConditions")), allowedStatuses: list(form.get("allowedStatuses")), listingLimit: number(form.get("listingLimit")), requiredFields: list(form.get("requiredFields")), requiredPhotos: number(form.get("requiredPhotos")), moderationRequired: checked(form, "moderationRequired"), prohibitedItemControls: list(form.get("prohibitedItemControls")), planOverrides: JSON.parse(String(form.get("planOverrides") || "{}")) };
    if (area === "auction-rules") input = { ...common, allowedDurations: list(form.get("allowedDurations")).map(Number), minimumBidIncrementCents: number(form.get("minimumBidIncrementCents")), reservePriceAllowed: checked(form, "reservePriceAllowed"), reservePriceRequired: checked(form, "reservePriceRequired"), buyNowAllowed: checked(form, "buyNowAllowed"), buyNowEndsOnBid: checked(form, "buyNowEndsOnBid"), antiSnipingWindowMinutes: number(form.get("antiSnipingWindowMinutes")), antiSnipingExtensionMinutes: number(form.get("antiSnipingExtensionMinutes")), paymentDeadlineHours: number(form.get("paymentDeadlineHours")), cancellationRules: form.get("cancellationRules"), moderationRequired: checked(form, "moderationRequired"), reviewRequired: checked(form, "reviewRequired") };
    try {
      if (editing) await adminApi.updatePlatformConfiguration(area, editing.id, { ...input, expectedUpdatedAt: editing.updatedAt }); else await adminApi.createPlatformConfiguration(area, input);
      setEditing(null); setShowForm(false); notify(`${editing ? "Updated" : "Created"} ${AREAS.find((item) => item.id === area)?.title.toLowerCase()}.`); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save configuration. Check the form values."); } finally { setSaving(false); }
  }

  async function changeConfiguration(row: PlatformConfigurationRow, changes: Record<string, unknown>, confirmation: string) {
    if (!window.confirm(confirmation)) return;
    if (!area || area === "commission-rules") return;
    setSaving(true); setError("");
    try { await adminApi.updatePlatformConfiguration(area, row.id, { ...row, ...changes, expectedUpdatedAt: row.updatedAt }); notify("Configuration updated and recorded in the audit log."); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update configuration."); } finally { setSaving(false); }
  }

  async function saveCommission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); const form = new FormData(event.currentTarget);
    const percentage = number(form.get("percentage")); const fixed = number(form.get("fixedFee")); const feeType = String(form.get("feeType"));
    const input = { key: String(form.get("key")), label: String(form.get("label")), description: String(form.get("description")), category: "MARKETPLACE_COMMISSION", appliesTo: String(form.get("appliesTo")), feeType, percentBps: feeType === "FIXED_CENTS" ? null : Math.round(percentage * 100), amountCents: feeType === "PERCENT_BPS" ? null : Math.round(fixed * 100), minCents: Math.round(number(form.get("minimumFee")) * 100), maxCents: Math.round(number(form.get("maximumFee")) * 100) || null, status: String(form.get("status")) as "ACTIVE" | "DRAFT" | "DISABLED" | "ARCHIVED", effectiveStartAt: String(form.get("effectiveStartAt") || "") || null, effectiveEndAt: String(form.get("effectiveEndAt") || "") || null, metadata: { priority: number(form.get("priority")), sellerPlan: String(form.get("sellerPlan")) }, ...(editing ? { expectedUpdatedAt: editing.updatedAt } : {}) };
    try { if (editing) await adminApi.updateSuperAdminPricingRule(editing.id, input); else await adminApi.createSuperAdminPricingRule(input); setEditing(null); setShowForm(false); notify("Commission rule saved and recorded in the audit log."); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save commission rule."); } finally { setSaving(false); }
  }

  const visibleSettings = useMemo(() => settings.filter((row) => !row.key.startsWith("platform.featureFlag.") && !row.key.startsWith("platform.listingRule.") && !row.key.startsWith("platform.auctionRule.")), [settings]);
  return <div className="space-y-6">
    <section className="super-admin-control-panel"><div className="super-admin-control-header"><div><div className="super-admin-control-kicker">Soft-Code Control Center</div><h1 className="super-admin-control-title">Platform Settings & Feature Rules</h1><p className="super-admin-control-subtitle">Manage platform behavior with protected, audited controls.</p></div><div className="super-admin-control-actions">
      <button className="btn btn-primary focus-visible:ring-2 focus-visible:ring-blue-600" type="button" onClick={() => { setShowSettingForm(true); window.setTimeout(() => settingFormRef.current?.querySelector("input")?.focus(), 0); }}>Add Setting</button>
      <button className="btn btn-secondary focus-visible:ring-2 focus-visible:ring-blue-600" type="button" onClick={() => void exportSettings()}>Export Settings</button>
      <Link className="btn btn-secondary focus-visible:ring-2 focus-visible:ring-blue-600" to="/super-admin/audit?q=PLATFORM_SETTING">View Audit</Link>
    </div></div></section>
    {error && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
    {success && <div role="status" className="rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-800">{success}</div>}
    <section className="super-admin-command-grid" aria-label="Platform management areas">{AREAS.map((item) => <article key={item.id} className="super-admin-command-card primary"><h2 className="super-admin-command-title">{item.title}</h2><p className="super-admin-command-description">{item.description}</p><button className="btn btn-secondary focus-visible:ring-2 focus-visible:ring-blue-600" type="button" onClick={() => openArea(item.id)}>Manage {item.title}</button></article>)}</section>

    {showSettingForm && <form ref={settingFormRef} onSubmit={saveSetting} className="rounded-2xl border bg-background p-5 shadow-sm" aria-label="Add platform setting"><h2 className="text-lg font-semibold">Add Setting</h2><div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]"><Field label="Setting key" name="key" required /><Field label="Value" name="value" /><button className="button self-end" disabled={saving}>{saving ? "Saving…" : "Save setting"}</button></div></form>}

    {area && <section className="rounded-2xl border bg-background p-5 shadow-sm" aria-labelledby="management-title"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="management-title" className="text-xl font-semibold">{AREAS.find((item) => item.id === area)?.title}</h2><p className="text-sm text-muted-foreground">{AREAS.find((item) => item.id === area)?.description}</p></div><div className="flex gap-2"><button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true); }}>{area === "feature-flags" ? "Create flag" : "Create rule"}</button><button className="btn btn-secondary" onClick={() => setParams({})}>Close</button></div></div>
      {showForm && (area === "commission-rules" ? <CommissionForm row={editing as PlatformPricingRuleRow | null} saving={saving} onSubmit={saveCommission} onCancel={() => { setEditing(null); setShowForm(false); }} /> : <ConfigurationForm area={area} row={editing as PlatformConfigurationRow | null} saving={saving} onSubmit={saveConfiguration} onCancel={() => { setEditing(null); setShowForm(false); }} />)}
      <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b text-left"><th className="p-3">Name</th><th className="p-3">Scope</th><th className="p-3">Status</th><th className="p-3">Updated</th><th className="p-3 text-right">Actions</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={5} className="p-6 text-center">Loading…</td></tr> : area === "commission-rules" ? (commissions.length ? commissions.map((row) => <CommissionRow key={row.id} row={row} saving={saving} onEdit={() => { setEditing(row); setShowForm(true); }} onStatus={async (status) => { if (!window.confirm(`Change this platform-wide commission rule to ${status}?`)) return; setSaving(true); try { await adminApi.updateSuperAdminPricingRule(row.id, { status, expectedUpdatedAt: row.updatedAt } as never); notify("Commission status updated."); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update rule."); } finally { setSaving(false); } }} />) : <Empty area={area} />) : (rows.length ? rows.map((row) => <ConfigurationRow key={row.id} row={row} area={area} saving={saving} onEdit={() => { setEditing(row); setShowForm(true); }} onChange={changeConfiguration} />) : <Empty area={area} />)}
      </tbody></table></div>
    </section>}

    <section className="rounded-2xl border bg-background p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold">Platform Settings</h2><p className="text-sm text-muted-foreground">Existing key/value settings remain available and unchanged.</p></div><button className="button" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b text-left"><th className="p-3">Key</th><th className="p-3">Value</th><th className="p-3">Updated</th><th className="p-3">Action</th></tr></thead><tbody>{loading ? <tr><td colSpan={4} className="p-6 text-center">Loading settings…</td></tr> : visibleSettings.length ? visibleSettings.map((row) => <tr key={row.key} className="border-b"><td className="p-3 font-medium">{row.key}</td><td className="p-3"><input aria-label={`${row.key} value`} className={inputClass} value={drafts[row.key] ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [row.key]: event.target.value }))} /></td><td className="p-3">{formatDate(row.updatedAt)}</td><td className="p-3"><button className="button" onClick={async () => { setSaving(true); try { await adminApi.updatePlatformSetting({ key: row.key, value: drafts[row.key] }); notify("Setting saved."); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save setting."); } finally { setSaving(false); } }} disabled={saving}>Save</button></td></tr>) : <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No platform settings configured.</td></tr>}</tbody></table></div></section>
  </div>;
}

function Empty({ area }: { area: Area }) { return <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No {AREAS.find((item) => item.id === area)?.title.toLowerCase()} configured. Create one to get started.</td></tr>; }
function ConfigurationRow({ row, area, saving, onEdit, onChange }: { row: PlatformConfigurationRow; area: ConfigArea; saving: boolean; onEdit: () => void; onChange: (row: PlatformConfigurationRow, changes: Record<string, unknown>, message: string) => void }) { return <tr className="border-b"><td className="p-3"><div className="font-medium">{row.displayName}</div><div className="text-xs text-muted-foreground">{row.key}</div></td><td className="p-3">{area === "feature-flags" ? `${row.environment} · ${row.rolloutPercentage}%` : area === "listing-rules" ? String(row.category) : `${(row.allowedDurations as number[])?.join(", ")} hours`}</td><td className="p-3">{row.archived ? "Archived" : row.enabled ? "Enabled" : "Disabled"}</td><td className="p-3">{formatDate(row.updatedAt)}</td><td className="p-3"><div className="flex justify-end gap-2"><button className="btn btn-secondary" onClick={onEdit}>Edit</button><button className="btn btn-secondary" disabled={saving || row.archived} onClick={() => onChange(row, { enabled: !row.enabled }, `${row.enabled ? "Disable" : "Enable"} ${row.displayName}? This change affects platform behavior.`)}>{row.enabled ? "Disable" : "Enable"}</button><button className="btn btn-secondary" disabled={saving || row.archived} onClick={() => onChange(row, { archived: true, enabled: false }, `Archive ${row.displayName}? It will remain in audit history.`)}>Archive</button></div></td></tr>; }
function CommissionRow({ row, saving, onEdit, onStatus }: { row: PlatformPricingRuleRow; saving: boolean; onEdit: () => void; onStatus: (status: "ACTIVE" | "DISABLED" | "ARCHIVED") => void }) { const fee = row.feeType === "FIXED_CENTS" ? `$${((row.amountCents || 0) / 100).toFixed(2)}` : `${((row.percentBps || 0) / 100).toFixed(2)}%`; return <tr className="border-b"><td className="p-3"><div className="font-medium">{row.label}</div><div className="text-xs text-muted-foreground">{row.key}</div></td><td className="p-3">{row.appliesTo} · {fee}</td><td className="p-3">{row.status}</td><td className="p-3">{formatDate(row.updatedAt)}</td><td className="p-3"><div className="flex justify-end gap-2"><button className="btn btn-secondary" onClick={onEdit}>Edit</button><button className="btn btn-secondary" disabled={saving || row.status === "ARCHIVED"} onClick={() => onStatus(row.status === "ACTIVE" ? "DISABLED" : "ACTIVE")}>{row.status === "ACTIVE" ? "Disable" : "Enable"}</button><button className="btn btn-secondary" disabled={saving || row.status === "ARCHIVED"} onClick={() => onStatus("ARCHIVED")}>Archive</button></div></td></tr>; }

function ConfigurationForm({ area, row, saving, onSubmit, onCancel }: { area: ConfigArea; row: PlatformConfigurationRow | null; saving: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void }) { return <form className="mt-5 rounded-xl border p-4" onSubmit={onSubmit}><div className="grid gap-3 md:grid-cols-2"><Field label="Key" name="key" defaultValue={row?.key} required /><Field label="Display name" name="displayName" defaultValue={row?.displayName} required /><Field label="Description" name="description" defaultValue={row?.description} /><Check label="Enabled" name="enabled" defaultChecked={row?.enabled ?? true} />
  {area === "feature-flags" && <><label className="grid gap-1 text-sm font-medium">Environment<select className={inputClass} name="environment" defaultValue={String(row?.environment || "PRODUCTION")}><option>DEVELOPMENT</option><option>STAGING</option><option>PRODUCTION</option><option>ALL</option></select></label><Field label="Rollout percentage" name="rolloutPercentage" type="number" min={0} max={100} defaultValue={Number(row?.rolloutPercentage ?? 100)} required /><Field label="Target roles (comma separated)" name="targetRoles" defaultValue={(row?.targetRoles as string[] | undefined)?.join(", ")} /><Field label="Target plans (comma separated)" name="targetPlans" defaultValue={(row?.targetPlans as string[] | undefined)?.join(", ")} /></>}
  {area === "listing-rules" && <><Field label="Category (or ALL)" name="category" defaultValue={String(row?.category || "ALL")} required /><Field label="Allowed conditions" name="allowedConditions" defaultValue={(row?.allowedConditions as string[] | undefined)?.join(", ")} required /><Field label="Allowed statuses" name="allowedStatuses" defaultValue={(row?.allowedStatuses as string[] | undefined)?.join(", ")} required /><Field label="Listing limit" name="listingLimit" type="number" min={0} defaultValue={Number(row?.listingLimit || 0)} required /><Field label="Required fields" name="requiredFields" defaultValue={(row?.requiredFields as string[] | undefined)?.join(", ")} /><Field label="Required photos" name="requiredPhotos" type="number" min={0} defaultValue={Number(row?.requiredPhotos || 0)} /><Field label="Prohibited-item controls" name="prohibitedItemControls" defaultValue={(row?.prohibitedItemControls as string[] | undefined)?.join(", ")} /><Field label="Plan overrides (JSON)" name="planOverrides" defaultValue={JSON.stringify(row?.planOverrides || {})} /><Check label="Moderation required" name="moderationRequired" defaultChecked={Boolean(row?.moderationRequired)} /></>}
  {area === "auction-rules" && <><Field label="Allowed durations (hours)" name="allowedDurations" defaultValue={(row?.allowedDurations as number[] | undefined)?.join(", ")} required /><Field label="Minimum bid increment (cents)" name="minimumBidIncrementCents" type="number" min={1} defaultValue={Number(row?.minimumBidIncrementCents || 100)} required /><Field label="Anti-sniping window (minutes)" name="antiSnipingWindowMinutes" type="number" min={0} defaultValue={Number(row?.antiSnipingWindowMinutes || 0)} /><Field label="Extension (minutes)" name="antiSnipingExtensionMinutes" type="number" min={0} defaultValue={Number(row?.antiSnipingExtensionMinutes || 0)} /><Field label="Payment deadline (hours)" name="paymentDeadlineHours" type="number" min={1} defaultValue={Number(row?.paymentDeadlineHours || 24)} required /><Field label="Cancellation rules" name="cancellationRules" defaultValue={String(row?.cancellationRules || "")} required /><Check label="Reserve price allowed" name="reservePriceAllowed" defaultChecked={Boolean(row?.reservePriceAllowed)} /><Check label="Reserve price required" name="reservePriceRequired" defaultChecked={Boolean(row?.reservePriceRequired)} /><Check label="Buy now allowed" name="buyNowAllowed" defaultChecked={Boolean(row?.buyNowAllowed)} /><Check label="Buy now ends on first bid" name="buyNowEndsOnBid" defaultChecked={Boolean(row?.buyNowEndsOnBid)} /><Check label="Moderation required" name="moderationRequired" defaultChecked={Boolean(row?.moderationRequired)} /><Check label="Review required" name="reviewRequired" defaultChecked={Boolean(row?.reviewRequired)} /></>}
  </div><div className="mt-4 flex gap-2"><button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : row ? "Save changes" : "Create"}</button><button className="btn btn-secondary" type="button" onClick={onCancel}>Cancel</button></div></form>; }

function CommissionForm({ row, saving, onSubmit, onCancel }: { row: PlatformPricingRuleRow | null; saving: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void }) { const metadata = row?.metadata || {}; return <form className="mt-5 rounded-xl border p-4" onSubmit={onSubmit}><div className="grid gap-3 md:grid-cols-2"><Field label="Key" name="key" defaultValue={row?.key} required /><Field label="Display name" name="label" defaultValue={row?.label} required /><Field label="Description" name="description" defaultValue={row?.description || ""} /><label className="grid gap-1 text-sm font-medium">Seller plan<select className={inputClass} name="sellerPlan" defaultValue={String(metadata.sellerPlan || "ALL")}><option>ALL</option><option>FREE</option><option>PRO</option><option>PREMIUM</option><option>ULTRA</option></select></label><Field label="Applies to" name="appliesTo" defaultValue={row?.appliesTo || "MARKETPLACE_SALE"} required /><label className="grid gap-1 text-sm font-medium">Fee type<select className={inputClass} name="feeType" defaultValue={row?.feeType || "PERCENT_BPS"}><option value="PERCENT_BPS">Percentage</option><option value="FIXED_CENTS">Fixed fee</option><option value="HYBRID">Percentage + fixed</option></select></label><Field label="Percentage (%)" name="percentage" type="number" min={0} max={100} step={0.01} defaultValue={(row?.percentBps || 0) / 100} /><Field label="Fixed fee ($)" name="fixedFee" type="number" min={0} step={0.01} defaultValue={(row?.amountCents || 0) / 100} /><Field label="Minimum fee ($)" name="minimumFee" type="number" min={0} step={0.01} defaultValue={(row?.minCents || 0) / 100} /><Field label="Maximum fee ($, 0 for none)" name="maximumFee" type="number" min={0} step={0.01} defaultValue={(row?.maxCents || 0) / 100} /><Field label="Priority" name="priority" type="number" min={0} defaultValue={Number(metadata.priority || 0)} /><label className="grid gap-1 text-sm font-medium">Status<select className={inputClass} name="status" defaultValue={row?.status || "DRAFT"}><option>DRAFT</option><option>ACTIVE</option><option>DISABLED</option><option>ARCHIVED</option></select></label><Field label="Effective start" name="effectiveStartAt" type="datetime-local" defaultValue={row?.effectiveStartAt?.slice(0, 16)} /><Field label="Effective end" name="effectiveEndAt" type="datetime-local" defaultValue={row?.effectiveEndAt?.slice(0, 16)} /></div><div className="mt-4 flex gap-2"><button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : row ? "Save changes" : "Create"}</button><button className="btn btn-secondary" type="button" onClick={onCancel}>Cancel</button></div></form>; }
