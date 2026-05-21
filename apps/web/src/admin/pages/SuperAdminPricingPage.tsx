import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  adminApi,
  type PlatformPricingRuleRow,
  type PlatformPricingRuleStatus,
  type SavePlatformPricingRuleInput,
} from "../services/adminApi";
import { exportCsv } from "../utils/exportCsv";

type PricingForm = SavePlatformPricingRuleInput;

const defaultForm: PricingForm = {
  key: "",
  label: "",
  description: "",
  category: "PLATFORM_FEES",
  appliesTo: "PLATFORM",
  feeType: "FIXED_CENTS",
  amountCents: 0,
  percentBps: null,
  minCents: null,
  maxCents: null,
  currency: "USD",
  status: "DRAFT",
  stripePriceId: "",
  effectiveStartAt: "",
  effectiveEndAt: "",
};

const categories = [
  "SUBSCRIPTIONS",
  "PLATFORM_FEES",
  "AUCTIONS",
  "LISTINGS",
  "INTEGRATIONS",
  "SETTLEMENTS",
];

const appliesToOptions = [
  "BUYER",
  "SELLER",
  "PLATFORM",
  "AUCTION",
  "LISTING",
  "SETTLEMENT",
  "INTEGRATION",
];

const feeTypes = ["FIXED_CENTS", "PERCENT_BPS", "HYBRID"];
const statuses: PlatformPricingRuleStatus[] = ["ACTIVE", "DRAFT", "DISABLED", "ARCHIVED"];

function statusLabel(status: string) {
  if (status === "ACTIVE") return "Active";
  if (status === "DRAFT") return "Draft";
  if (status === "DISABLED") return "Disabled";
  if (status === "ARCHIVED") return "Archived";
  return status || "Unknown";
}

function statusClass(status: string) {
  if (status === "ACTIVE") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "DRAFT") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "DISABLED") return "bg-slate-100 text-slate-700 border-slate-200";
  return "bg-red-50 text-red-700 border-red-200";
}

function formatMoney(cents?: number | null) {
  return (Number(cents || 0) / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
}

function formatPercentBps(bps?: number | null) {
  const value = Number(bps || 0);
  return `${(value / 100).toFixed(2)}%`;
}

function displayRuleValue(rule: PlatformPricingRuleRow) {
  if (rule.feeType === "PERCENT_BPS") return formatPercentBps(rule.percentBps);
  if (rule.feeType === "HYBRID") {
    return `${formatMoney(rule.amountCents)} + ${formatPercentBps(rule.percentBps)}`;
  }
  return formatMoney(rule.amountCents);
}

function normalizeForm(rule: PlatformPricingRuleRow): PricingForm {
  return {
    key: rule.key,
    label: rule.label,
    description: rule.description || "",
    category: rule.category || "PLATFORM_FEES",
    appliesTo: rule.appliesTo || "PLATFORM",
    feeType: rule.feeType || "FIXED_CENTS",
    amountCents: rule.amountCents ?? 0,
    percentBps: rule.percentBps ?? null,
    minCents: rule.minCents ?? null,
    maxCents: rule.maxCents ?? null,
    currency: rule.currency || "USD",
    status: rule.status || "DRAFT",
    stripePriceId: rule.stripePriceId || "",
    effectiveStartAt: rule.effectiveStartAt || "",
    effectiveEndAt: rule.effectiveEndAt || "",
  };
}

export default function SuperAdminPricingPage() {
  const [rules, setRules] = useState<PlatformPricingRuleRow[]>([]);
  const [form, setForm] = useState<PricingForm>(defaultForm);
  const [editingId, setEditingId] = useState("");
  const [query, setQuery] = useState("");
  const [areaFilter, setAreaFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadRules() {
    setLoading(true);
    setError("");

    try {
      const rows = await adminApi.getSuperAdminPricingRules();
      setRules(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pricing rules.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRules();
  }, []);

  const areas = useMemo(
    () => ["ALL", ...Array.from(new Set(rules.map((item) => item.category)))],
    [rules],
  );

  const filteredRules = useMemo(() => {
    const q = query.trim().toLowerCase();

    return rules.filter((item) => {
      const matchesQuery =
        !q ||
        [
          item.key,
          item.label,
          item.description,
          item.category,
          item.appliesTo,
          item.feeType,
          item.status,
          item.stripePriceId,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);

      const matchesArea = areaFilter === "ALL" || item.category === areaFilter;
      const matchesStatus = statusFilter === "ALL" || item.status === statusFilter;

      return matchesQuery && matchesArea && matchesStatus;
    });
  }, [areaFilter, query, rules, statusFilter]);

  const stats = useMemo(() => {
    return {
      total: rules.length,
      active: rules.filter((item) => item.status === "ACTIVE").length,
      draft: rules.filter((item) => item.status === "DRAFT").length,
      filtered: filteredRules.length,
    };
  }, [filteredRules.length, rules]);

  function updateForm<K extends keyof PricingForm>(key: K, value: PricingForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setEditingId("");
    setForm(defaultForm);
  }

  function editRule(rule: PlatformPricingRuleRow) {
    setEditingId(rule.id);
    setForm(normalizeForm(rule));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveRule() {
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const payload: PricingForm = {
        ...form,
        key: form.key.trim(),
        label: form.label.trim(),
        description: form.description?.trim() || "",
        stripePriceId: form.stripePriceId?.trim() || null,
        amountCents: Number(form.amountCents ?? 0),
        percentBps: form.percentBps === null || form.percentBps === undefined
          ? null
          : Number(form.percentBps),
        minCents: form.minCents === null || form.minCents === undefined
          ? null
          : Number(form.minCents),
        maxCents: form.maxCents === null || form.maxCents === undefined
          ? null
          : Number(form.maxCents),
      };

      const response = editingId
        ? await adminApi.updateSuperAdminPricingRule(editingId, payload)
        : await adminApi.createSuperAdminPricingRule(payload);

      setRules((current) => {
        const next = response.pricingRule;
        const exists = current.some((item) => item.id === next.id);
        return exists
          ? current.map((item) => (item.id === next.id ? next : item))
          : [next, ...current];
      });

      setNotice(editingId ? "Pricing rule updated." : "Pricing rule created.");
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save pricing rule.");
    } finally {
      setSaving(false);
    }
  }

  async function setRuleStatus(rule: PlatformPricingRuleRow, status: PlatformPricingRuleStatus) {
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await adminApi.updateSuperAdminPricingRule(rule.id, { status });
      setRules((current) =>
        current.map((item) => (item.id === rule.id ? response.pricingRule : item)),
      );
      setNotice(`Pricing rule marked ${statusLabel(status).toLowerCase()}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update pricing rule.");
    } finally {
      setSaving(false);
    }
  }

  function exportPricingControlCsv() {
    exportCsv(
      "super-admin-pricing-rules.csv",
      filteredRules.map((item) => ({
        key: item.key,
        label: item.label,
        category: item.category,
        appliesTo: item.appliesTo,
        feeType: item.feeType,
        value: displayRuleValue(item),
        amountCents: item.amountCents,
        percentBps: item.percentBps,
        minCents: item.minCents,
        maxCents: item.maxCents,
        status: item.status,
        stripePriceId: item.stripePriceId,
        effectiveStartAt: item.effectiveStartAt,
        effectiveEndAt: item.effectiveEndAt,
      })),
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-background p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Super Admin Pricing
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Pricing Control Center
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Database-backed control center for every subscription, commission, service fee,
              auction fee, listing fee, payout fee, settlement fee, Stripe price ID,
              effective date, and platform-fee workflow across the application.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="button min-h-11" type="button" onClick={exportPricingControlCsv}>
              Export CSV
            </button>
            <button className="button min-h-11" type="button" onClick={() => void loadRules()} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <Link className="button min-h-11" to="/super-admin/platform-settings">
              Platform Settings
            </Link>
            <Link className="button min-h-11" to="/super-admin/revenue">
              Revenue Dashboard
            </Link>
          </div>
        </div>
      </section>

      {error ? (
        <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </section>
      ) : null}

      {notice ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {notice}
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border bg-background p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">Total pricing rules</div>
          <div className="mt-2 text-2xl font-semibold">{stats.total}</div>
          <p className="mt-2 text-xs text-muted-foreground">Database-backed rules loaded from API.</p>
        </div>

        <div className="rounded-2xl border bg-background p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">Active rules</div>
          <div className="mt-2 text-2xl font-semibold">{stats.active}</div>
          <p className="mt-2 text-xs text-muted-foreground">Currently active pricing controls.</p>
        </div>

        <div className="rounded-2xl border bg-background p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">Draft rules</div>
          <div className="mt-2 text-2xl font-semibold">{stats.draft}</div>
          <p className="mt-2 text-xs text-muted-foreground">Configured but not active yet.</p>
        </div>

        <div className="rounded-2xl border bg-background p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">Filtered results</div>
          <div className="mt-2 text-2xl font-semibold">{stats.filtered}</div>
          <p className="mt-2 text-xs text-muted-foreground">Currently visible pricing rules.</p>
        </div>
      </section>

      <section className="rounded-2xl border bg-background p-5 shadow-sm">
        <h2 className="text-lg font-semibold">
          {editingId ? "Edit pricing rule" : "Create pricing rule"}
        </h2>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium">
            Rule key
            <input className="min-h-11 rounded-xl border bg-background px-3" value={form.key} onChange={(event) => updateForm("key", event.target.value)} placeholder="buyer_service_fee" disabled={Boolean(editingId)} />
          </label>

          <label className="grid gap-1 text-sm font-medium">
            Label
            <input className="min-h-11 rounded-xl border bg-background px-3" value={form.label} onChange={(event) => updateForm("label", event.target.value)} placeholder="Buyer service fee" />
          </label>

          <label className="grid gap-1 text-sm font-medium">
            Category
            <select className="min-h-11 rounded-xl border bg-background px-3" value={form.category} onChange={(event) => updateForm("category", event.target.value)}>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>

          <label className="grid gap-1 text-sm font-medium">
            Applies to
            <select className="min-h-11 rounded-xl border bg-background px-3" value={form.appliesTo} onChange={(event) => updateForm("appliesTo", event.target.value)}>
              {appliesToOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>

          <label className="grid gap-1 text-sm font-medium">
            Fee type
            <select className="min-h-11 rounded-xl border bg-background px-3" value={form.feeType} onChange={(event) => updateForm("feeType", event.target.value)}>
              {feeTypes.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>

          <label className="grid gap-1 text-sm font-medium">
            Status
            <select className="min-h-11 rounded-xl border bg-background px-3" value={form.status} onChange={(event) => updateForm("status", event.target.value as PlatformPricingRuleStatus)}>
              {statuses.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}
            </select>
          </label>

          <label className="grid gap-1 text-sm font-medium">
            Fixed amount cents
            <input className="min-h-11 rounded-xl border bg-background px-3" type="number" value={form.amountCents ?? 0} onChange={(event) => updateForm("amountCents", Number(event.target.value))} />
          </label>

          <label className="grid gap-1 text-sm font-medium">
            Percent bps
            <input className="min-h-11 rounded-xl border bg-background px-3" type="number" value={form.percentBps ?? ""} onChange={(event) => updateForm("percentBps", event.target.value === "" ? null : Number(event.target.value))} placeholder="250 = 2.50%" />
          </label>

          <label className="grid gap-1 text-sm font-medium">
            Min cents
            <input className="min-h-11 rounded-xl border bg-background px-3" type="number" value={form.minCents ?? ""} onChange={(event) => updateForm("minCents", event.target.value === "" ? null : Number(event.target.value))} />
          </label>

          <label className="grid gap-1 text-sm font-medium">
            Max cents
            <input className="min-h-11 rounded-xl border bg-background px-3" type="number" value={form.maxCents ?? ""} onChange={(event) => updateForm("maxCents", event.target.value === "" ? null : Number(event.target.value))} />
          </label>

          <label className="grid gap-1 text-sm font-medium">
            Stripe price ID
            <input className="min-h-11 rounded-xl border bg-background px-3" value={form.stripePriceId || ""} onChange={(event) => updateForm("stripePriceId", event.target.value)} placeholder="price_..." />
          </label>

          <label className="grid gap-1 text-sm font-medium">
            Currency
            <input className="min-h-11 rounded-xl border bg-background px-3" value={form.currency || "USD"} onChange={(event) => updateForm("currency", event.target.value)} />
          </label>
        </div>

        <label className="mt-3 grid gap-1 text-sm font-medium">
          Description
          <textarea className="min-h-24 rounded-xl border bg-background p-3" value={form.description || ""} onChange={(event) => updateForm("description", event.target.value)} />
        </label>

        <div className="mt-4 flex flex-wrap gap-2">
          <button className="button min-h-11" type="button" disabled={saving} onClick={() => void saveRule()}>
            {saving ? "Saving..." : editingId ? "Save pricing rule" : "Create pricing rule"}
          </button>
          <button className="button min-h-11" type="button" onClick={resetForm}>
            Clear form
          </button>
        </div>
      </section>

      <section className="rounded-2xl border bg-background p-5 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px]">
          <label className="grid gap-1 text-sm font-medium">
            Search pricing rules
            <input className="min-h-11 rounded-xl border bg-background px-3" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search subscription, commission, service fee, payout..." />
          </label>

          <label className="grid gap-1 text-sm font-medium">
            Category
            <select className="min-h-11 rounded-xl border bg-background px-3" value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)}>
              {areas.map((area) => <option key={area} value={area}>{area === "ALL" ? "All categories" : area}</option>)}
            </select>
          </label>

          <label className="grid gap-1 text-sm font-medium">
            Status
            <select className="min-h-11 rounded-xl border bg-background px-3" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="ALL">All statuses</option>
              {statuses.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="grid gap-4">
        {loading ? (
          <article className="rounded-2xl border bg-muted/20 p-5 text-sm text-muted-foreground">
            Loading pricing rules...
          </article>
        ) : filteredRules.length === 0 ? (
          <article className="rounded-2xl border bg-background p-5 shadow-sm">
            No pricing rules found. Create a database-backed rule for subscriptions, commission,
            service fee, auction fee, payout fee, settlement fee, or Stripe price ID tracking.
          </article>
        ) : (
          filteredRules.map((item) => (
            <article key={item.id} className="rounded-2xl border bg-background p-5 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border bg-muted/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.category}</span>
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(item.status)}`}>{statusLabel(item.status)}</span>
                    <span className="rounded-full border bg-muted/40 px-3 py-1 text-xs font-semibold">{item.appliesTo}</span>
                  </div>
                  <h2 className="mt-3 text-lg font-semibold">{item.label}</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{item.description || "No description."}</p>
                  <p className="mt-3 text-sm"><span className="font-semibold">Value:</span> {displayRuleValue(item)}</p>
                  <p className="mt-1 text-sm"><span className="font-semibold">Stripe:</span> {item.stripePriceId || "—"}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button className="button min-h-11" type="button" onClick={() => editRule(item)}>Edit</button>
                  <button className="button min-h-11" type="button" disabled={saving} onClick={() => void setRuleStatus(item, item.status === "ACTIVE" ? "DISABLED" : "ACTIVE")}>
                    {item.status === "ACTIVE" ? "Disable" : "Activate"}
                  </button>
                  <Link className="button min-h-11" to={`/super-admin/audit?targetType=PLATFORM_PRICING_RULE&targetId=${item.id}`}>Audit history</Link>
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
