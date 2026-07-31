import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  getMyOwnerApplication,
  resubmitMyOwnerApplication,
  updateMyOwnerApplication,
  type OwnerApplication,
  type OwnerApplicationUpdate,
} from "../services/ownerApplications";
import "../styles/owner-application.css";

const STATUS_COPY: Record<
  OwnerApplication["status"],
  { label: string; heading: string; next: string }
> = {
  PENDING: {
    label: "Pending",
    heading: "Application pending",
    next: "No action is needed. Your application is waiting to be reviewed.",
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
    businessAddress: application.businessAddress || {
      line1: "",
      line2: "",
      city: "",
      state: "",
      postalCode: "",
      country: "US",
    },
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
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const updated = await updateMyOwnerApplication(form);
      setApplication(updated);
      setForm(valuesFrom(updated));
      setMessage("Corrections saved. Review them, then resubmit for review.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save corrections.");
    } finally {
      setSaving(false);
    }
  }

  async function resubmit() {
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
  const address = form.businessAddress;
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
          <h2>Make requested corrections</h2>
          <div className="owner-application__grid">
            {([
              ["businessName", "Business name", "text"],
              ["businessType", "Business type", "text"],
              ["businessEmail", "Business email", "email"],
              ["businessPhone", "Business phone", "tel"],
              ["websiteUrl", "Website", "url"],
              ["licenseNumber", "License number", "text"],
              ["licenseState", "License state", "text"],
            ] as const).map(([key, label, type]) => (
              <label key={key}>
                <span>{label}</span>
                <input
                  type={type}
                  value={(form[key] as string | null) || ""}
                  maxLength={key === "websiteUrl" ? 500 : 254}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, [key]: event.target.value }))
                  }
                />
              </label>
            ))}
            {([
              ["line1", "Address"],
              ["line2", "Address line 2"],
              ["city", "City"],
              ["state", "State"],
              ["postalCode", "Postal code"],
              ["country", "Country"],
            ] as const).map(([key, label]) => (
              <label key={key}>
                <span>{label}</span>
                <input
                  value={address?.[key] || ""}
                  maxLength={160}
                  required={key !== "line2"}
                  onChange={(event) => updateAddress(key, event.target.value)}
                />
              </label>
            ))}
          </div>
          <div className="owner-application__actions">
            <button className="btn btn-secondary" disabled={disabled} type="submit">
              {saving ? "Saving…" : "Save corrections"}
            </button>
            <button
              className="btn btn-primary"
              disabled={disabled}
              type="button"
              onClick={() => void resubmit()}
            >
              {resubmitting ? "Resubmitting…" : "Resubmit for review"}
            </button>
          </div>
          </form>
        ) : null}
      </article>
    </main>
  );
}
