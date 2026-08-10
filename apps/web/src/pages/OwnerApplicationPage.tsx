import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  getMyOwnerApplication,
  resubmitMyOwnerApplication,
  updateMyOwnerApplication,
  type OwnerApplication,
  type OwnerApplicationUpdate,
} from "../services/ownerApplications";
import "../styles/owner-application.css";
import OwnerApplicationFields from "../components/OwnerApplicationFields";
import { blankAddress, normalizePhone, normalizeWebsite, validateOwnerApplication, type FieldErrors } from "../utils/ownerApplicationFields";

const STATUS_COPY: Record<
  OwnerApplication["status"],
  { label: string; heading: string; next: string }
> = {
  PENDING: {
    label: "Pending",
    heading: "Application pending",
    next: "Complete your business details. Your application will remain pending while the review team checks it.",
  },
  IN_REVIEW: {
    label: "In review",
    heading: "Application in review",
    next: "No action is needed while the review team checks your submission.",
  },
  INFORMATION_REQUESTED: {
    label: "Corrections required",
    heading: "Application needs updates",
    next: "Update the requested details below, save your corrections, then resubmit.",
  },
  APPROVED: {
    label: "Approved",
    heading: "Application approved",
    next: "Your PawnLoop owner account has been approved. You can now complete your shop setup and prepare your storefront.",
  },
  REJECTED: {
    label: "Not approved",
    heading: "Application not approved",
    next: "Review the decision reason below. This application cannot be resubmitted.",
  },
  SUSPENDED: {
    label: "Suspended",
    heading: "Owner access suspended",
    next: "Owner business access is paused. Follow the instructions below or contact support.",
  },
};

const OWNER_VISIBLE_REASON_STATUSES = new Set<OwnerApplication["status"]>([
  "INFORMATION_REQUESTED",
  "REJECTED",
  "SUSPENDED",
]);

const INTERNAL_MIGRATION_REASON =
  "existing owner approved during owner-application migration";

function formatDate(value: string | null) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function valuesFrom(application: OwnerApplication): OwnerApplicationUpdate {
  return {
    businessName: application.businessName || "",
    businessType: application.businessType || "",
    businessEmail: application.businessEmail || "",
    businessPhone: application.businessPhone || "",
    websiteUrl: application.websiteUrl || "",
    licenseNumber: application.licenseNumber || "",
    licenseState: application.licenseState || "",
    businessAddress: application.businessAddress || blankAddress(),
  };
}

export default function OwnerApplicationPage() {
  const [application, setApplication] = useState<OwnerApplication | null>(null);
  const [form, setForm] = useState<OwnerApplicationUpdate>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resubmitting, setResubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [customBusinessType, setCustomBusinessType] = useState("");
  const initialForm = useMemo(() => application ? JSON.stringify(valuesFrom(application)) : "", [application]);
  const dirty = !!application && JSON.stringify(form) !== initialForm;

  function load() {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    getMyOwnerApplication(controller.signal)
      .then((next) => {
        setApplication(next);
        setForm(valuesFrom(next));
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setError(
            reason instanceof Error ? reason.message : "Unable to load your application.",
          );
        }
      })
      .finally(() => setLoading(false));
    return controller;
  }

  useEffect(() => {
    const controller = load();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (Object.keys(fieldErrors).length) document.getElementById("owner-application-errors")?.focus();
  }, [fieldErrors]);

  function updateAddress(key: string, value: string) {
    setForm((current) => ({
      ...current,
      businessAddress: {
        line1: "",
        city: "",
        state: "",
        postalCode: "",
        country: "US",
        ...(current.businessAddress || {}),
        [key]: value,
      },
    }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const errors = validateOwnerApplication(form, customBusinessType);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const updated = await updateMyOwnerApplication({ ...form, businessType: form.businessType === "Other" ? customBusinessType.trim() : form.businessType, businessPhone: normalizePhone(form.businessPhone || ""), websiteUrl: normalizeWebsite(form.websiteUrl || "") });
      setApplication(updated);
      setForm(valuesFrom(updated));
      setMessage(application.status === "PENDING" ? "Business information saved." : "Corrections saved. Review them, then resubmit for review.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save corrections.");
    } finally {
      setSaving(false);
    }
  }

  async function resubmit() {
    if (!window.confirm("Resubmit this application for administrator review? You will not be able to edit it while it is in review.")) return;
    setResubmitting(true);
    setError("");
    setMessage("");
    try {
      const updated = await resubmitMyOwnerApplication();
      setApplication(updated);
      setMessage("Your corrected application was resubmitted for review.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to resubmit.");
    } finally {
      setResubmitting(false);
    }
  }

  if (loading) {
    return <p className="owner-application-state" aria-live="polite">Loading application status…</p>;
  }
  if (error && !application) {
    return (
      <section className="owner-application-state" role="alert">
        <h1>We could not load your application</h1>
        <p>{error}</p>
        <button type="button" className="btn btn-primary" onClick={load}>Try again</button>
      </section>
    );
  }
  if (!application) {
    return <section className="owner-application-state"><h1>No owner application found</h1></section>;
  }

  const copy = STATUS_COPY[application.status];
  const disabled = saving || resubmitting;
  const isApproved = application.status === "APPROVED";
  const visibleReason =
    OWNER_VISIBLE_REASON_STATUSES.has(application.status) &&
    !application.decisionReason
      ?.trim()
      .toLowerCase()
      .includes(INTERNAL_MIGRATION_REASON)
      ? application.decisionReason?.trim()
      : null;

  return (
    <main className="owner-application">
      <article className={`owner-application__panel${isApproved ? " is-approved" : ""}`}>
        <header className="owner-application__header">
          <div className="owner-application__title">
            <span className="owner-application__icon" aria-hidden="true">
              {isApproved ? "✓" : "i"}
            </span>
            <div>
              <p className="owner-application__eyebrow">Owner verification</p>
              <h1>{copy.heading}</h1>
            </div>
          </div>
          <span className={`owner-application__status status-${application.status.toLowerCase()}`}>
            {copy.label}
          </span>
        </header>

        <p className="owner-application__description">{copy.next}</p>

        <section className="owner-application__summary" aria-label="Application timeline">
          <div><span>Submitted</span><strong>{formatDate(application.submittedAt)}</strong></div>
          <div>
            <span>{isApproved ? "Approved" : "Latest review"}</span>
            <strong>{formatDate(application.reviewedAt)}</strong>
          </div>
        </section>

        {isApproved ? (
          <>
            <section className="owner-application__next">
              <h2>What happens next?</h2>
              <ul>
                <li>Complete your shop profile</li>
                <li>Add location and business information</li>
                <li>Connect payments</li>
                <li>Add your first inventory item</li>
              </ul>
            </section>
            <div className="owner-application__actions">
              <Link className="btn btn-primary" to="/owner/onboarding">
                Continue Shop Setup
              </Link>
              <Link className="btn btn-secondary" to="/owner">
                Open Owner Dashboard
              </Link>
            </div>
          </>
        ) : (
          <section className="owner-application__next">
            <h2>What happens next?</h2>
            {visibleReason ? (
              <div className="owner-application__request">
                <strong>
                  {application.status === "INFORMATION_REQUESTED"
                    ? "Information requested"
                    : "Decision reason"}
                </strong>
                <p>{visibleReason}</p>
              </div>
            ) : null}
          </section>
        )}

        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {message ? <p className="form-success" role="status">{message}</p> : null}

        {application.canEdit ? (
          <form className="owner-application__form" onSubmit={save}>
          <h2>{application.status === "PENDING" ? "Complete business information" : "Make requested corrections"}</h2>
          {Object.keys(fieldErrors).length ? <section id="owner-application-errors" className="owner-application__error-summary" role="alert" aria-labelledby="owner-error-heading" tabIndex={-1}><h3 id="owner-error-heading">Please correct these fields</h3><ul>{Object.entries(fieldErrors).map(([key, value]) => <li key={key}><a href={`#${key}-error`}>{value}</a></li>)}</ul></section> : null}
          <OwnerApplicationFields value={form} errors={fieldErrors} customBusinessType={customBusinessType} disabled={disabled} onChange={setForm} onCustomBusinessTypeChange={setCustomBusinessType} onCountryChange={(country) => {
            const savedRegion = form.businessAddress?.state?.trim();
            if (savedRegion && !window.confirm("Changing country may make the saved state or region incompatible. Keep it until you select a replacement?")) return;
            updateAddress("country", country);
          }} />
          <div className="owner-application__actions">
            <button className="btn btn-secondary" disabled={disabled} type="submit">
              {saving ? "Saving…" : "Save corrections"}
            </button>
            {application.canResubmit ? <button
              className="btn btn-primary"
              disabled={disabled}
              type="button"
              onClick={() => void resubmit()}
            >
              {resubmitting ? "Resubmitting…" : "Resubmit for review"}
            </button> : null}
          </div>
          </form>
        ) : null}
      </article>
    </main>
  );
}
