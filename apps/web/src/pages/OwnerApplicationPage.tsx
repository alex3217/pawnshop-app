import { useEffect, useState, type FormEvent } from "react";
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
  { label: string; next: string }
> = {
  PENDING: {
    label: "Pending",
    next: "No action is needed. Your application is waiting to be reviewed.",
  },
  IN_REVIEW: {
    label: "In review",
    next: "No action is needed while the review team checks your submission.",
  },
  INFORMATION_REQUESTED: {
    label: "Corrections required",
    next: "Update the requested details below, save your corrections, then resubmit.",
  },
  APPROVED: {
    label: "Approved",
    next: "Your owner workspace is available.",
  },
  REJECTED: {
    label: "Not approved",
    next: "Review the decision reason below. This application cannot be resubmitted.",
  },
  SUSPENDED: {
    label: "Suspended",
    next: "Owner business access is paused. Follow the instructions below or contact support.",
  },
};

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

  return (
    <main className="owner-application">
      <header>
        <p className="owner-application__eyebrow">Owner verification</p>
        <h1>Your application</h1>
        <span className={`owner-application__status status-${application.status.toLowerCase()}`}>
          {copy.label}
        </span>
      </header>

      <section className="owner-application__summary" aria-label="Application timeline">
        <div><span>Submitted</span><strong>{formatDate(application.submittedAt)}</strong></div>
        <div><span>Latest review</span><strong>{formatDate(application.reviewedAt)}</strong></div>
      </section>

      <section className="owner-application__next">
        <h2>What happens next</h2>
        <p>{copy.next}</p>
        {application.decisionReason ? (
          <div className="owner-application__request">
            <strong>
              {application.status === "INFORMATION_REQUESTED"
                ? "Information requested"
                : "Decision reason"}
            </strong>
            <p>{application.decisionReason}</p>
          </div>
        ) : null}
      </section>

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
    </main>
  );
}
