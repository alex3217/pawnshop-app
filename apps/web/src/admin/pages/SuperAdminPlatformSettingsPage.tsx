import { useEffect, useMemo, useState } from "react";
import { adminApi, type PlatformSettingRow } from "../services/adminApi";
import { Link } from "react-router-dom";

type SettingDraft = {
  key: string;
  label: string;
  description: string;
  value: string;
};

const DEFAULT_SETTINGS: SettingDraft[] = [
  {
    key: "platform.maintenanceMode",
    label: "Maintenance Mode",
    description: "Set to true to show the platform as temporarily unavailable.",
    value: "false",
  },
  {
    key: "marketplace.auctionsEnabled",
    label: "Auctions Enabled",
    description: "Controls whether auction features are available.",
    value: "true",
  },
  {
    key: "marketplace.offersEnabled",
    label: "Offers Enabled",
    description: "Controls whether buyers can send offers.",
    value: "true",
  },
  {
    key: "seller.defaultPlan",
    label: "Default Seller Plan",
    description: "Default plan assigned to new shops.",
    value: "FREE",
  },
  {
    key: "billing.platformCommissionBps",
    label: "Platform Commission BPS",
    description: "Commission in basis points. 500 = 5%.",
    value: "500",
  },
  {
    key: "foundingShop.programEnabled",
    label: "Founding Shop Program Enabled",
    description: "Turn the 60-day founding shop trial offer on or off.",
    value: "true",
  },
  {
    key: "foundingShop.trialDays",
    label: "Founding Shop Trial Days",
    description: "Number of free trial days offered to founding pawn shops.",
    value: "60",
  },
  {
    key: "foundingShop.shopLimit",
    label: "Founding Shop Limit",
    description: "Maximum number of shops eligible for the founding offer.",
    value: "25",
  },
  {
    key: "foundingShop.minimumLiveItems",
    label: "Minimum Live Items",
    description: "Minimum live inventory count before the trial should begin.",
    value: "10",
  },
  {
    key: "foundingShop.freeUploadCount",
    label: "Free Upload Count",
    description: "How many initial items PawnLoop helps upload during onboarding.",
    value: "25",
  },
  {
    key: "foundingShop.starterMonthlyPrice",
    label: "Starter Monthly Price",
    description: "Monthly starter plan price after the founding trial.",
    value: "49",
  },
  {
    key: "foundingShop.proMonthlyPrice",
    label: "Pro Monthly Price",
    description: "Monthly pro plan price after the founding trial.",
    value: "99",
  },
  {
    key: "foundingShop.premiumMonthlyPrice",
    label: "Premium Monthly Price",
    description: "Monthly premium plan price after the founding trial.",
    value: "199",
  },
  {
    key: "foundingShop.headline",
    label: "Founding Shop Headline",
    description: "Headline shown on owner registration and subscription pages.",
    value: "60-Day Founding Shop Trial",
  },
  {
    key: "foundingShop.subtitle",
    label: "Founding Shop Subtitle",
    description: "Supporting copy shown with the founding shop offer.",
    value: "We help pawn shops build inventory before buyer traffic scales.",
  },
];

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function SuperAdminPlatformSettingsPage() {
  const [settings, setSettings] = useState<PlatformSettingRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [customKey, setCustomKey] = useState("");
  const [customValue, setCustomValue] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  async function loadSettings() {
    setLoading(true);
    setError("");

    try {
      const rows = await adminApi.getPlatformSettings();
      setSettings(rows);

      const nextDrafts: Record<string, string> = {};
      for (const item of rows) {
        nextDrafts[item.key] = item.value ?? "";
      }
      setDrafts(nextDrafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  const mergedSettings = useMemo(() => {
    const existingByKey = new Map(settings.map((item) => [item.key, item]));

    const defaults = DEFAULT_SETTINGS.map((item) => {
      const existing = existingByKey.get(item.key);
      return {
        ...item,
        value: drafts[item.key] ?? existing?.value ?? item.value,
        existing,
      };
    });

    const custom = settings
      .filter((item) => !DEFAULT_SETTINGS.some((def) => def.key === item.key))
      .map((item) => ({
        key: item.key,
        label: item.key,
        description: "Custom platform setting.",
        value: drafts[item.key] ?? item.value ?? "",
        existing: item,
      }));

    const all = [...defaults, ...custom];
    const q = query.trim().toLowerCase();

    if (!q) return all;

    return all.filter((item) =>
      [item.key, item.label, item.description, item.value]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [drafts, query, settings]);

  async function saveSetting(key: string, value: string) {
    setSavingKey(key);
    setError("");

    try {
      await adminApi.updatePlatformSetting({ key, value });
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save setting.");
    } finally {
      setSavingKey(null);
    }
  }

  async function createCustomSetting() {
    const key = customKey.trim();
    if (!key) {
      setError("Setting key is required.");
      return;
    }

    await saveSetting(key, customValue);
    setCustomKey("");
    setCustomValue("");
  }

  return (
    <div className="space-y-6">
      <section className="super-admin-control-panel">
        <div className="super-admin-control-header">
          <div>
            <div className="super-admin-control-kicker">Soft-Code Control Center</div>
            <h2 className="super-admin-control-title">Platform Settings & Feature Rules</h2>
            <p className="super-admin-control-subtitle">
              This is where the app should become configurable without hard-coding:
              feature flags, commission rules, listing rules, auction rules, and plan controls.
            </p>
          </div>
          <div className="super-admin-control-actions">
            <button className="btn btn-primary" type="button">
              Add Setting
            </button>
            <button className="btn btn-secondary" type="button">
              Export Settings
            </button>
            <Link className="btn btn-secondary" to="/super-admin/audit">
              View Audit
            </Link>
          </div>
        </div>

        <ul className="super-admin-control-list">
          <li>Feature flags: turn features on/off without changing code.</li>
          <li>Commission rules: configure platform fees and seller plan rules.</li>
          <li>Listing rules: control categories, statuses, conditions, and moderation behavior.</li>
          <li>Auction and offer rules: configure bidding windows, extensions, statuses, and review flows.</li>
        </ul>
      </section>

      <section className="super-admin-command-grid">
        <article className="super-admin-command-card primary">
          <h3 className="super-admin-command-title">Feature Flags</h3>
          <p className="super-admin-command-description">Control which app features are enabled globally.</p>
          <button className="btn btn-secondary" type="button">Manage Feature Flags</button>
        </article>

        <article className="super-admin-command-card primary">
          <h3 className="super-admin-command-title">Commission Rules</h3>
          <p className="super-admin-command-description">Configure marketplace fee rules and future commission logic.</p>
          <button className="btn btn-secondary" type="button">Manage Commission Rules</button>
        </article>

        <article className="super-admin-command-card primary">
          <h3 className="super-admin-command-title">Listing Rules</h3>
          <p className="super-admin-command-description">Control listing categories, statuses, conditions, and moderation rules.</p>
          <button className="btn btn-secondary" type="button">Manage Listing Rules</button>
        </article>

        <article className="super-admin-command-card primary">
          <h3 className="super-admin-command-title">Auction Rules</h3>
          <p className="super-admin-command-description">Configure auction statuses, review rules, and bidding behavior.</p>
          <button className="btn btn-secondary" type="button">Manage Auction Rules</button>
        </article>
      </section>


      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Platform Settings
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage marketplace feature flags, pricing controls, and system-wide
            configuration.
          </p>
        </div>

        <button className="button" onClick={loadSettings} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="rounded-2xl border bg-background p-4 shadow-sm">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search settings..."
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
      </div>

      <div className="rounded-2xl border bg-background p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Create Custom Setting</h2>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <input
            value={customKey}
            onChange={(event) => setCustomKey(event.target.value)}
            placeholder="example: marketplace.featureName"
            className="rounded-lg border px-3 py-2 text-sm"
          />

          <input
            value={customValue}
            onChange={(event) => setCustomValue(event.target.value)}
            placeholder="value"
            className="rounded-lg border px-3 py-2 text-sm"
          />

          <button className="button" onClick={createCustomSetting}>
            Save
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-background shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="p-3 font-medium">Setting</th>
                <th className="p-3 font-medium">Value</th>
                <th className="p-3 font-medium">Updated</th>
                <th className="p-3 font-medium text-right">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-muted-foreground">
                    Loading settings...
                  </td>
                </tr>
              ) : mergedSettings.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-muted-foreground">
                    No settings found.
                  </td>
                </tr>
              ) : (
                mergedSettings.map((setting) => {
                  const isSaving = savingKey === setting.key;

                  return (
                    <tr key={setting.key} className="border-b last:border-b-0">
                      <td className="p-3">
                        <div className="font-medium">{setting.label}</div>
                        <div className="text-muted-foreground">{setting.key}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {setting.description}
                        </div>
                      </td>

                      <td className="p-3">
                        <input
                          value={setting.value}
                          disabled={isSaving}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [setting.key]: event.target.value,
                            }))
                          }
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                        />
                      </td>

                      <td className="p-3 text-muted-foreground">
                        {formatDate(setting.existing?.updatedAt)}
                      </td>

                      <td className="p-3 text-right">
                        <button
                          className="button"
                          disabled={isSaving}
                          onClick={() => saveSetting(setting.key, setting.value)}
                        >
                          {isSaving ? "Saving..." : "Save"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
