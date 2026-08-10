import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import {
  adminApi,
  type SellerPlanImpact,
  type SellerPlanSummary,
} from "../services/adminApi";
import "../../styles/super-admin-seller-plans.css";

type EditorMode = "edit" | "schedule";

const money = (cents = 0) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);

const limit = (value?: number | null) =>
  value == null ? "Unlimited" : String(value);

function download(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function tomorrowLocalDateTime() {
  const value = new Date(Date.now() + 24 * 60 * 60 * 1000);
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 16);
}

export default function SuperAdminSellerPlansPage() {
  const [plans, setPlans] = useState<SellerPlanSummary[]>([]);
  const [yearly, setYearly] = useState(false);
  const [compare, setCompare] = useState(false);
  const [selected, setSelected] = useState<SellerPlanSummary | null>(null);
  const [ownerPreview, setOwnerPreview] = useState<SellerPlanSummary | null>(null);
  const [editing, setEditing] = useState<SellerPlanSummary | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>("edit");
  const [impact, setImpact] = useState<SellerPlanImpact | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load(showNotice = false) {
    setLoading(true);
    setError("");
    try {
      setPlans(await adminApi.getSellerPlans());
      if (showNotice) setNotice("Seller plans refreshed.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load seller plans.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  useEffect(() => {
    const dialogOpen = Boolean(editing || selected || ownerPreview);
    if (!dialogOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [editing, selected, ownerPreview]);

  const summary = useMemo(
    () => ({
      shops: plans.reduce(
        (sum, plan) => sum + Number(plan.subscribedShops || 0),
        0,
      ),
      mrr: plans.reduce((sum, plan) => sum + Number(plan.mrrCents || 0), 0),
      missing: plans.filter(
        (plan) => plan.stripeSyncStatus === "MISSING_REFERENCES",
      ).length,
    }),
    [plans],
  );

  function openEditor(plan: SellerPlanSummary, mode: EditorMode = "edit") {
    setEditing(plan);
    setEditorMode(mode);
    setSelected(null);
    setOwnerPreview(null);
    setImpact(null);
    setDirty(false);
    setError("");
    setNotice(
      mode === "schedule"
        ? "Choose a future effective date, review the impact, and publish the scheduled change."
        : "",
    );
  }

  function closeEditor() {
    if (dirty && !window.confirm("Discard unsaved seller-plan changes?")) return;
    setEditing(null);
    setDirty(false);
    setImpact(null);
    setError("");
  }

  function validateReferences(plan: SellerPlanSummary) {
    setError("");
    if (!plan.isPaid) {
      setNotice(`${plan.code} is a free plan and does not require Stripe prices.`);
      return;
    }

    const missing = [
      !plan.stripeMonthlyPriceId ? "monthly Price ID" : "",
      !plan.stripeYearlyPriceId ? "yearly Price ID" : "",
    ].filter(Boolean);

    if (missing.length) {
      setNotice("");
      setError(
        `${plan.code} is missing its ${missing.join(" and ")}. Select Edit plan to add the Stripe references.`,
      );
      return;
    }

    setNotice(
      `${plan.code} has valid-looking monthly and yearly Stripe Price IDs.`,
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;

    const form = new FormData(event.currentTarget);
    const input: Record<string, unknown> = {
      label: form.get("label"),
      monthlyPriceCents: Math.round(Number(form.get("monthlyPrice")) * 100),
      yearlyPriceCents: Math.round(Number(form.get("yearlyPrice")) * 100),
      stripeProductId: form.get("stripeProductId") || null,
      stripeMonthlyPriceId: form.get("stripeMonthlyPriceId") || null,
      stripeYearlyPriceId: form.get("stripeYearlyPriceId") || null,
      trialEligible: form.get("trialEligible") === "on",
      trialDays: Number(form.get("trialDays")),
      maxActiveListings:
        form.get("maxActiveListings") === ""
          ? null
          : Number(form.get("maxActiveListings")),
      trialMaxActiveListings:
        form.get("trialMaxActiveListings") === ""
          ? null
          : Number(form.get("trialMaxActiveListings")),
      maxLocations:
        form.get("maxLocations") === ""
          ? null
          : Number(form.get("maxLocations")),
      maxStaffUsers:
        form.get("maxStaffUsers") === ""
          ? null
          : Number(form.get("maxStaffUsers")),
      canCreateAuctions: form.get("canCreateAuctions") === "on",
      canFeatureListings: form.get("canFeatureListings") === "on",
      analyticsLevel: form.get("analyticsLevel"),
      commissionBps: Number(form.get("commissionBps")),
      supportLevel: form.get("supportLevel"),
      status: form.get("status"),
      scheduledMigrationAt: form.get("scheduledMigrationAt") || null,
      grandfatherExisting: form.get("grandfatherExisting") === "on",
      expectedVersion: editing.version,
      features: editing.features || [],
    };

    setSaving(true);
    setError("");
    try {
      const preview = await adminApi.previewSellerPlanImpact(
        editing.code,
        input,
      );
      setImpact(preview.impact);
      const confirmed = window.confirm(
        `Publish ${editing.code} changes? ${preview.impact.affectedShops} shops and ${preview.impact.affectedSubscriptions} subscriptions are affected. Estimated MRR change: ${money(preview.impact.mrrDeltaCents)}.`,
      );
      if (!confirmed) return;

      await adminApi.updateSellerPlan(editing.code, input);
      const wasScheduled = Boolean(input.scheduledMigrationAt);
      setEditing(null);
      setDirty(false);
      setImpact(null);
      setNotice(
        wasScheduled
          ? "Seller-plan change saved with its future effective date and audit record."
          : "Seller plan updated. Existing subscribers were preserved and the change was audited.",
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to update seller plan.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="seller-plan-control">
      <section className="seller-plan-hero">
        <div>
          <div className="seller-plan-kicker">Plans &amp; Billing · Seller</div>
          <h1>Seller Plan Control</h1>
          <p>
            Seller pricing, entitlements, Stripe references, subscriber impact,
            and publication controls.
          </p>
        </div>
        <div className="seller-plan-toolbar" aria-label="Seller plan actions">
          <Link className="btn btn-secondary" to="/super-admin/seller-subscriptions">
            Seller Subscriptions
          </Link>
          <button
            className="btn btn-secondary"
            type="button"
            aria-expanded={compare}
            onClick={() => setCompare((value) => !value)}
          >
            {compare ? "Hide comparison" : "Compare plans"}
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => {
              download("seller-plans.json", plans);
              setNotice("Seller-plan catalog exported.");
            }}
            disabled={loading || plans.length === 0}
          >
            Export plans
          </button>
          <Link
            className="btn btn-secondary"
            to="/super-admin/audit?q=SELLER_PLAN"
          >
            View audit history
          </Link>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => void load(true)}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </section>

      {error ? (
        <div role="alert" className="seller-plan-notice seller-plan-notice--error">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div role="status" className="seller-plan-notice seller-plan-notice--success">
          {notice}
        </div>
      ) : null}

      <section className="seller-plan-summary" aria-label="Seller plan summary">
        {[
          ["Subscribed shops", summary.shops],
          ["Seller MRR", money(summary.mrr)],
          ["Seller ARR", money(summary.mrr * 12)],
          ["Stripe references missing", summary.missing],
        ].map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      <div className="seller-plan-billing-toggle" aria-label="Displayed billing period">
        <span className={!yearly ? "is-active" : ""}>Monthly</span>
        <button
          type="button"
          role="switch"
          aria-checked={yearly}
          onClick={() => setYearly((value) => !value)}
        >
          <span aria-hidden="true" />
          <span className="sr-only">
            Show {yearly ? "monthly" : "yearly"} pricing
          </span>
        </button>
        <span className={yearly ? "is-active" : ""}>Yearly</span>
      </div>

      {loading ? (
        <div className="seller-plan-state">Loading seller plans…</div>
      ) : plans.length === 0 ? (
        <div className="seller-plan-state">No seller plans configured.</div>
      ) : (
        <section className="seller-plan-grid" aria-label="Seller plans">
          {plans.map((plan) => (
            <PlanCard
              key={plan.code}
              plan={plan}
              yearly={yearly}
              onDetails={() => setSelected(plan)}
              onEdit={() => openEditor(plan)}
              onPreview={() => setOwnerPreview(plan)}
              onDuplicate={() => {
                download(`${plan.code.toLowerCase()}-seller-plan-draft.json`, {
                  ...plan,
                  code: `${plan.code}_COPY`,
                  status: "DRAFT",
                });
                setNotice(
                  `${plan.code} duplicate draft exported. Only approved seller-plan codes can be published.`,
                );
              }}
              onSchedule={() => openEditor(plan, "schedule")}
              onValidate={() => validateReferences(plan)}
            />
          ))}
        </section>
      )}

      {compare ? <Comparison plans={plans} /> : null}

      {selected ? (
        <DetailsDialog plan={selected} onClose={() => setSelected(null)} />
      ) : null}

      {ownerPreview ? (
        <OwnerPreviewDialog
          plan={ownerPreview}
          onClose={() => setOwnerPreview(null)}
        />
      ) : null}

      {editing ? (
        <Editor
          plan={editing}
          mode={editorMode}
          dirty={dirty}
          saving={saving}
          impact={impact}
          error={error}
          onDirty={() => setDirty(true)}
          onSubmit={submit}
          onClose={closeEditor}
        />
      ) : null}
    </main>
  );
}

function PlanCard({
  plan,
  yearly,
  onDetails,
  onEdit,
  onPreview,
  onDuplicate,
  onSchedule,
  onValidate,
}: {
  plan: SellerPlanSummary;
  yearly: boolean;
  onDetails: () => void;
  onEdit: () => void;
  onPreview: () => void;
  onDuplicate: () => void;
  onSchedule: () => void;
  onValidate: () => void;
}) {
  const stripeClass =
    plan.stripeSyncStatus === "CONFIGURED"
      ? "seller-plan-stripe--configured"
      : plan.stripeSyncStatus === "MISSING_REFERENCES"
        ? "seller-plan-stripe--missing"
        : "";

  return (
    <article className="seller-plan-card">
      <header>
        <div>
          <div className="seller-plan-card__eyebrow">SELLER</div>
          <h2>{plan.code}</h2>
          <div className="seller-plan-card__price">
            {money(yearly ? plan.yearlyPriceCents : plan.monthlyPriceCents)}
            <span>/{yearly ? "year" : "month"}</span>
          </div>
        </div>
        <span className="seller-plan-status">{plan.status || "ACTIVE"}</span>
      </header>

      <dl className="seller-plan-metrics">
        <Metric label="Listings" value={limit(plan.maxActiveListings)} />
        <Metric label="Trial listings" value={limit(plan.trialMaxActiveListings)} />
        <Metric
          label="Commission"
          value={`${((plan.commissionBps || 0) / 100).toFixed(2)}%`}
        />
        <Metric
          label="Subscribers / MRR"
          value={`${plan.subscribedShops || 0} / ${money(plan.mrrCents)}`}
        />
        <Metric
          label="Stripe"
          value={plan.stripeSyncStatus || "UNKNOWN"}
          valueClassName={stripeClass}
        />
        <Metric
          label="Last changed"
          value={
            plan.updatedAt
              ? new Date(plan.updatedAt).toLocaleString()
              : "Config default"
          }
        />
      </dl>

      <div className="seller-plan-card__actions">
        <button className="btn btn-secondary" type="button" onClick={onDetails}>
          View details
        </button>
        <button className="btn btn-primary" type="button" onClick={onEdit}>
          Edit plan
        </button>
        <button className="btn btn-secondary" type="button" onClick={onPreview}>
          Preview owner-facing plan
        </button>
        <button className="btn btn-secondary" type="button" onClick={onDuplicate}>
          Duplicate plan
        </button>
        <button className="btn btn-secondary" type="button" onClick={onSchedule}>
          Schedule future change
        </button>
        <button className="btn btn-secondary" type="button" onClick={onValidate}>
          Validate Stripe references
        </button>
      </div>
    </article>
  );
}

function Metric({
  label,
  value,
  valueClassName = "",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={valueClassName}>{value}</dd>
    </div>
  );
}

function Comparison({ plans }: { plans: SellerPlanSummary[] }) {
  const rows: Array<[string, (plan: SellerPlanSummary) => string]> = [
    ["Monthly", (plan) => money(plan.monthlyPriceCents)],
    ["Yearly", (plan) => money(plan.yearlyPriceCents)],
    ["Listings", (plan) => limit(plan.maxActiveListings)],
    ["Trial listings", (plan) => limit(plan.trialMaxActiveListings)],
    ["Locations", (plan) => limit(plan.maxLocations)],
    ["Staff", (plan) => limit(plan.maxStaffUsers)],
    ["Auctions", (plan) => (plan.canCreateAuctions ? "Yes" : "No")],
    ["Featured", (plan) => (plan.canFeatureListings ? "Yes" : "No")],
    ["Analytics", (plan) => plan.analyticsLevel || "none"],
  ];

  return (
    <section className="seller-plan-comparison">
      <h2>Seller plan comparison</h2>
      <div>
        <table>
          <thead>
            <tr>
              <th scope="col">Entitlement</th>
              {plans.map((plan) => (
                <th scope="col" key={plan.code}>
                  {plan.code}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, render]) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                {plans.map((plan) => (
                  <td key={plan.code}>{render(plan)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DetailsDialog({
  plan,
  onClose,
}: {
  plan: SellerPlanSummary;
  onClose: () => void;
}) {
  return (
    <Dialog title={`${plan.code} seller-plan details`} onClose={onClose}>
      <dl className="seller-plan-detail-list">
        <Metric label="Display name" value={plan.label} />
        <Metric label="Monthly price" value={money(plan.monthlyPriceCents)} />
        <Metric label="Yearly price" value={money(plan.yearlyPriceCents)} />
        <Metric label="Monthly Stripe Price ID" value={plan.stripeMonthlyPriceId || "Not configured"} />
        <Metric label="Yearly Stripe Price ID" value={plan.stripeYearlyPriceId || "Not configured"} />
        <Metric label="Stripe Product ID" value={plan.stripeProductId || "Optional / not configured"} />
        <Metric label="Active listings" value={limit(plan.maxActiveListings)} />
        <Metric label="Locations" value={limit(plan.maxLocations)} />
        <Metric label="Staff seats" value={limit(plan.maxStaffUsers)} />
        <Metric label="Support" value={plan.supportLevel || "STANDARD"} />
      </dl>
    </Dialog>
  );
}

function OwnerPreviewDialog({
  plan,
  onClose,
}: {
  plan: SellerPlanSummary;
  onClose: () => void;
}) {
  return (
    <Dialog title={`${plan.label} owner-facing preview`} onClose={onClose}>
      <article className="seller-plan-owner-preview">
        <span>Seller plan</span>
        <h3>{plan.label}</h3>
        <div>
          <strong>{money(plan.monthlyPriceCents)}</strong>/month
          <small>or {money(plan.yearlyPriceCents)}/year</small>
        </div>
        <ul>
          {(plan.features || []).map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
        <button className="btn btn-primary" type="button" disabled>
          Owner checkout preview
        </button>
        <p>No subscription is created from this preview.</p>
      </article>
    </Dialog>
  );
}

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="seller-plan-dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <section className="seller-plan-dialog" tabIndex={-1}>
        <header>
          <h2>{title}</h2>
          <button className="btn btn-secondary" type="button" onClick={onClose} autoFocus>
            Close
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function Editor({
  plan,
  mode,
  dirty,
  saving,
  impact,
  error,
  onDirty,
  onSubmit,
  onClose,
}: {
  plan: SellerPlanSummary;
  mode: EditorMode;
  dirty: boolean;
  saving: boolean;
  impact: SellerPlanImpact | null;
  error: string;
  onDirty: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  const paid = Boolean(plan.isPaid);
  const focusMonthly = paid && !plan.stripeMonthlyPriceId && mode === "edit";

  return (
    <div
      className="seller-plan-dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-seller-plan"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !saving) onClose();
      }}
    >
      <form
        onSubmit={onSubmit}
        onChange={onDirty}
        className="seller-plan-dialog seller-plan-editor"
      >
        <header>
          <div>
            <h2 id="edit-seller-plan">
              {mode === "schedule" ? "Schedule changes for" : "Edit"} {plan.code}
            </h2>
            <p>
              Saving first previews subscriber impact, then asks for confirmation.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Close
          </button>
        </header>

        {error ? (
          <div role="alert" className="seller-plan-notice seller-plan-notice--error">
            {error}
          </div>
        ) : null}

        <fieldset className="seller-plan-editor__section seller-plan-editor__stripe">
          <legend>Stripe billing references</legend>
          <p>
            Enter Stripe test-mode <code>price_…</code> IDs. Paid active plans require
            both monthly and yearly Price IDs. The Product ID is optional.
          </p>
          <div className="seller-plan-form-grid">
            <Field
              name="stripeMonthlyPriceId"
              label="Monthly Stripe Price ID"
              value={plan.stripeMonthlyPriceId || ""}
              required={paid}
              disabled={!paid}
              pattern="^price_[A-Za-z0-9]+$"
              placeholder="price_..."
              autoFocus={focusMonthly}
            />
            <Field
              name="stripeYearlyPriceId"
              label="Yearly Stripe Price ID"
              value={plan.stripeYearlyPriceId || ""}
              required={paid}
              disabled={!paid}
              pattern="^price_[A-Za-z0-9]+$"
              placeholder="price_..."
              autoFocus={paid && !focusMonthly && !plan.stripeYearlyPriceId && mode === "edit"}
            />
            <Field
              name="stripeProductId"
              label="Stripe Product ID (optional)"
              value={plan.stripeProductId || ""}
              disabled={!paid}
              pattern="^prod_[A-Za-z0-9]+$"
              placeholder="prod_..."
            />
          </div>
          {!paid ? <small>FREE does not use Stripe Checkout references.</small> : null}
        </fieldset>

        <fieldset className="seller-plan-editor__section">
          <legend>Pricing and plan details</legend>
          <div className="seller-plan-form-grid">
            <Field name="label" label="Display name" value={plan.label} required />
            <Field
              name="monthlyPrice"
              label="Monthly price ($)"
              type="number"
              value={(plan.monthlyPriceCents || 0) / 100}
              required
            />
            <Field
              name="yearlyPrice"
              label="Yearly price ($)"
              type="number"
              value={(plan.yearlyPriceCents || 0) / 100}
              required
            />
            <Field
              name="trialDays"
              label="Trial days"
              type="number"
              value={plan.trialDays ?? 60}
              required
            />
            <Field
              name="maxActiveListings"
              label="Active listings (blank = unlimited)"
              type="number"
              value={plan.maxActiveListings ?? ""}
            />
            <Field
              name="trialMaxActiveListings"
              label="Trial listings"
              type="number"
              value={plan.trialMaxActiveListings ?? 50}
            />
            <Field
              name="maxLocations"
              label="Locations (blank = unlimited)"
              type="number"
              value={plan.maxLocations ?? ""}
            />
            <Field
              name="maxStaffUsers"
              label="Staff seats (blank = unlimited)"
              type="number"
              value={plan.maxStaffUsers ?? ""}
            />
            <Field
              name="commissionBps"
              label="Commission basis points"
              type="number"
              value={plan.commissionBps || 0}
              required
            />
            <Field
              name="analyticsLevel"
              label="Analytics level"
              value={plan.analyticsLevel || "none"}
            />
            <Field
              name="supportLevel"
              label="Support level"
              value={plan.supportLevel || "STANDARD"}
            />
            <label className="seller-plan-field">
              Status
              <select name="status" defaultValue={plan.status || "ACTIVE"}>
                <option value="ACTIVE">ACTIVE</option>
                <option value="DRAFT">DRAFT</option>
                <option value="DISABLED">DISABLED</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset className="seller-plan-editor__section">
          <legend>Entitlements and change timing</legend>
          <div className="seller-plan-form-grid seller-plan-form-grid--checks">
            <Check
              name="trialEligible"
              label="Trial eligible"
              value={plan.trialEligible !== false}
            />
            <Check
              name="canCreateAuctions"
              label="Auction access"
              value={Boolean(plan.canCreateAuctions)}
            />
            <Check
              name="canFeatureListings"
              label="Featured-listing access"
              value={Boolean(plan.canFeatureListings)}
            />
            <Check
              name="grandfatherExisting"
              label="Grandfather existing subscribers"
              value={false}
            />
            <Field
              name="scheduledMigrationAt"
              label="Future effective date"
              type="datetime-local"
              value={mode === "schedule" ? tomorrowLocalDateTime() : ""}
              required={mode === "schedule"}
              autoFocus={mode === "schedule"}
            />
          </div>
        </fieldset>

        {impact ? (
          <div className="seller-plan-impact">
            Impact: {impact.affectedShops} shops; {impact.affectedSubscriptions}{" "}
            subscriptions; MRR change {money(impact.mrrDeltaCents)}.
          </div>
        ) : null}

        <footer>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? "Publishing…" : "Preview impact and publish"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancel{dirty ? " (unsaved changes)" : ""}
          </button>
        </footer>
      </form>
    </div>
  );
}

function Field({
  name,
  label,
  value,
  type = "text",
  required = false,
  disabled = false,
  pattern,
  placeholder,
  autoFocus = false,
}: {
  name: string;
  label: string;
  value: string | number;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  pattern?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="seller-plan-field">
      {label}
      <input
        name={name}
        type={type}
        min={type === "number" ? 0 : undefined}
        step={name.toLowerCase().includes("price") ? 0.01 : 1}
        defaultValue={value}
        required={required}
        disabled={disabled}
        pattern={pattern}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
      />
    </label>
  );
}

function Check({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value: boolean;
}) {
  return (
    <label className="seller-plan-check">
      <input name={name} type="checkbox" defaultChecked={value} />
      <span>{label}</span>
    </label>
  );
}
