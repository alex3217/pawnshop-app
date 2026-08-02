import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";

import {
  getBuyerPreferences,
  patchBuyerPreferences,
  type BuyerPreferences,
} from "../services/buyerPreferences";
import {
  clearRecentlyViewed,
  readRecentlyViewed,
  RECENTLY_VIEWED_ENABLED_KEY,
} from "../services/recentlyViewed.mjs";
import "../styles/buyer-account.css";

const toggles: Array<
  [keyof BuyerPreferences, string]
> = [
  [
    "savedSearchNotifications",
    "Saved-search notifications",
  ],
  ["priceDropAlerts", "Price-drop alerts"],
  ["auctionAlerts", "Auction alerts"],
  ["followedShopAlerts", "Followed-shop alerts"],
  [
    "marketingCommunications",
    "Marketing communications",
  ],
  [
    "recentlyViewedEnabled",
    "Store recently viewed items in this browser",
  ],
];

function editableSnapshot(
  value: BuyerPreferences | null,
) {
  if (!value) return "";

  return JSON.stringify({
    displayName: value.displayName,
    phone: value.phone,
    locationLabel: value.locationLabel,
    searchRadiusMiles: value.searchRadiusMiles,
    savedSearchNotifications:
      value.savedSearchNotifications,
    priceDropAlerts: value.priceDropAlerts,
    auctionAlerts: value.auctionAlerts,
    followedShopAlerts:
      value.followedShopAlerts,
    marketingCommunications:
      value.marketingCommunications,
    recentlyViewedEnabled:
      value.recentlyViewedEnabled,
  });
}

function formatSavedAt(
  value: string | null | undefined,
) {
  if (!value) return "Not saved yet";

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Saved previously";
  }

  return parsed.toLocaleString();
}

export default function BuyerSettingsPage() {
  const [form, setForm] =
    useState<BuyerPreferences | null>(null);
  const [savedForm, setSavedForm] =
    useState<BuyerPreferences | null>(null);
  const [recentlyViewedCount, setRecentlyViewedCount] =
    useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);

  const dirty = useMemo(
    () =>
      editableSnapshot(form) !==
      editableSnapshot(savedForm),
    [form, savedForm],
  );

  useEffect(() => {
    const controller = new AbortController();

    try {
      setRecentlyViewedCount(
        readRecentlyViewed().length,
      );
    } catch {
      setRecentlyViewedCount(0);
    }

    void getBuyerPreferences(controller.signal)
      .then((preferences) => {
        setForm(preferences);
        setSavedForm(preferences);
      })
      .catch((cause) => {
        if (cause?.name === "AbortError") return;

        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to load account settings.",
        );
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (error || notice) {
      statusRef.current?.focus();
    }
  }, [error, notice]);

  useEffect(() => {
    if (!dirty) return;

    const warnBeforeUnload = (
      event: BeforeUnloadEvent,
    ) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener(
      "beforeunload",
      warnBeforeUnload,
    );

    return () => {
      window.removeEventListener(
        "beforeunload",
        warnBeforeUnload,
      );
    };
  }, [dirty]);

  function updateForm(
    patch: Partial<BuyerPreferences>,
  ) {
    setForm((current) =>
      current
        ? {
            ...current,
            ...patch,
          }
        : current,
    );

    setError("");
    setNotice("");
  }

  function discardChanges() {
    if (!savedForm) return;

    setForm({
      ...savedForm,
    });
    setError("");
    setNotice("Unsaved changes were discarded.");
  }

  function clearBrowserHistory() {
    const count = recentlyViewedCount;

    clearRecentlyViewed();
    setRecentlyViewedCount(0);
    setError("");

    setNotice(
      count > 0
        ? `Cleared ${count} recently viewed ${
            count === 1 ? "item" : "items"
          } from this browser.`
        : "Recently viewed history is already empty.",
    );
  }

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!form || !dirty) return;

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const updated =
        await patchBuyerPreferences({
          displayName: form.displayName,
          phone: form.phone,
          locationLabel: form.locationLabel,
          searchRadiusMiles: Number(
            form.searchRadiusMiles,
          ),
          savedSearchNotifications:
            form.savedSearchNotifications,
          priceDropAlerts: form.priceDropAlerts,
          auctionAlerts: form.auctionAlerts,
          followedShopAlerts:
            form.followedShopAlerts,
          marketingCommunications:
            form.marketingCommunications,
          recentlyViewedEnabled:
            form.recentlyViewedEnabled,
        });

      setForm(updated);
      setSavedForm(updated);

      try {
        localStorage.setItem(
          RECENTLY_VIEWED_ENABLED_KEY,
          String(updated.recentlyViewedEnabled),
        );
      } catch {
        // The preference remains server-backed.
      }

      setNotice("Buyer settings saved.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to save buyer settings.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="buyer-settings-page">
      <header className="buyer-settings-header">
        <p className="section-eyebrow">
          ACCOUNT
        </p>
        <h1>Account Settings</h1>
        <p>
          Manage buyer profile, discovery,
          communication, security shortcuts, and
          browser-history preferences.
        </p>
      </header>

      <div
        ref={statusRef}
        tabIndex={-1}
        className="buyer-settings-status"
        aria-live="polite"
      >
        {error ? (
          <p role="alert" className="error-text">
            {error}
          </p>
        ) : notice ? (
          <p>{notice}</p>
        ) : null}
      </div>

      {!form && !error ? (
        <p className="buyer-settings-loading">
          Loading account settings…
        </p>
      ) : null}

      {form ? (
        <form
          className="buyer-settings-form"
          onSubmit={submit}
        >
          <section
            className="buyer-settings-card list-card"
            aria-labelledby="account-overview-heading"
          >
            <h2 id="account-overview-heading">
              Account overview
            </h2>

            <div className="buyer-settings-summary-grid">
              <article className="buyer-settings-summary-card">
                <span>Account type</span>
                <strong>Buyer</strong>
              </article>

              <article className="buyer-settings-summary-card">
                <span>Email on file</span>
                <strong>{form.email}</strong>
              </article>

              <article className="buyer-settings-summary-card">
                <span>Last saved</span>
                <strong>
                  {formatSavedAt(savedForm?.updatedAt)}
                </strong>
              </article>
            </div>

            <div className="buyer-settings-link-grid">
              <Link to="/buyer/subscription">
                <strong>Buyer Subscription</strong>
                <span>
                  Compare plans and manage billing.
                </span>
              </Link>

              <Link to="/account/payment-methods">
                <strong>Payment Methods</strong>
                <span>
                  Manage Stripe payment methods.
                </span>
              </Link>

              <Link to="/marketplace/purchases">
                <strong>My Purchases</strong>
                <span>
                  Review orders and fulfillment.
                </span>
              </Link>

              <Link to="/forgot-password">
                <strong>Reset Password</strong>
                <span>
                  Use the verified password-reset flow.
                </span>
              </Link>

              <Link to="/buyer/help">
                <strong>Help Center</strong>
                <span>
                  Get assistance with your account.
                </span>
              </Link>
            </div>
          </section>

          <section className="buyer-settings-card list-card">
            <h2>Profile and search defaults</h2>

            <div className="buyer-settings-profile-grid">
              <label>
                Display name
                <input
                  required
                  maxLength={120}
                  value={form.displayName}
                  onChange={(event) =>
                    updateForm({
                      displayName:
                        event.target.value,
                    })
                  }
                />
              </label>

              <label>
                Email
                <input
                  value={form.email}
                  readOnly
                  aria-describedby="email-help"
                />
              </label>

              <p
                id="email-help"
                className="buyer-settings-email-help"
              >
                Email changes require a verified
                workflow and are not available here.
              </p>

              <label>
                Phone
                <input
                  type="tel"
                  maxLength={30}
                  autoComplete="tel"
                  value={form.phone || ""}
                  onChange={(event) =>
                    updateForm({
                      phone:
                        event.target.value || null,
                    })
                  }
                />
              </label>

              <label>
                Default city, state, or location
                <input
                  maxLength={120}
                  autoComplete="address-level2"
                  value={form.locationLabel || ""}
                  onChange={(event) =>
                    updateForm({
                      locationLabel:
                        event.target.value || null,
                    })
                  }
                />
              </label>

              <label>
                Search radius
                <span className="buyer-settings-radius-control">
                  <input
                    type="number"
                    min={1}
                    max={250}
                    value={form.searchRadiusMiles}
                    onChange={(event) =>
                      updateForm({
                        searchRadiusMiles: Number(
                          event.target.value,
                        ),
                      })
                    }
                  />
                  <span aria-hidden="true">
                    miles
                  </span>
                </span>
              </label>
            </div>
          </section>

          <section className="buyer-settings-card list-card">
            <h2>
              Alerts, communications, and privacy
            </h2>

            <div className="buyer-settings-toggle-list">
              {toggles.map(([key, label]) => (
                <label
                  className="buyer-settings-toggle"
                  key={key}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(form[key])}
                    onChange={(event) =>
                      updateForm({
                        [key]: event.target.checked,
                      })
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            <div className="buyer-settings-history-control">
              <div>
                <h3>Recently Viewed history</h3>
                <p>
                  {recentlyViewedCount}{" "}
                  {recentlyViewedCount === 1
                    ? "item"
                    : "items"}{" "}
                  stored in this browser. This history
                  is never synchronized across devices.
                </p>
              </div>

              <button
                type="button"
                className="btn btn-secondary"
                disabled={recentlyViewedCount === 0}
                onClick={clearBrowserHistory}
              >
                Clear recently viewed history
              </button>
            </div>

            <p className="buyer-settings-privacy-note">
              Review how PawnLoop handles account and
              marketplace data in the{" "}
              <Link to="/privacy">
                Privacy Policy
              </Link>
              .
            </p>
          </section>

          <div
            className={`buyer-settings-save-state${
              dirty ? " is-dirty" : ""
            }`}
            role="status"
            aria-live="polite"
          >
            <div>
              <strong>
                {dirty
                  ? "You have unsaved changes."
                  : "All settings are saved."}
              </strong>
              <span>
                Last saved:{" "}
                {formatSavedAt(savedForm?.updatedAt)}
              </span>
            </div>

            <div className="buyer-settings-actions">
              <button
                className="btn btn-primary"
                disabled={saving || !dirty}
              >
                {saving
                  ? "Saving…"
                  : "Save settings"}
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                disabled={saving || !dirty}
                onClick={discardChanges}
              >
                Discard changes
              </button>
            </div>
          </div>
        </form>
      ) : null}
    </main>
  );
}
