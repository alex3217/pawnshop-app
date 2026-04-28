import { useEffect, useMemo, useState } from "react";
import { adminApi, type PlatformSettingRow } from "../services/adminApi";

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
