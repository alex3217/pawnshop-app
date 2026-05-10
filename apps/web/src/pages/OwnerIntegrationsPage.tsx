// File: apps/web/src/pages/OwnerIntegrationsPage.tsx

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";
import {
  archiveInventoryIntegration,
  createInventoryIntegration,
  createInventoryIntegrationMapping,
  deleteInventoryIntegrationMapping,
  getInventoryIntegrationJobs,
  getInventoryIntegrationMappings,
  getOwnerIntegrationOverview,
  syncInventoryIntegration,
  testInventoryIntegration,
  type CreateInventoryIntegrationInput,
  type IntegrationAuthType,
  type IntegrationKind,
  type IntegrationStatus,
  type InventoryFieldMapping,
  type InventorySyncJob,
  type OwnerIntegrationConnector,
  type OwnerIntegrationOverview,
  type SavedInventoryIntegration,
} from "../services/integrations";

type IntegrationFormState = {
  shopId: string;
  name: string;
  type: IntegrationKind;
  provider: string;
  baseUrl: string;
  inventoryEndpoint: string;
  authType: IntegrationAuthType;
  apiKey: string;
  bearerToken: string;
  syncFrequencyMinutes: string;
};

type MappingFormState = {
  externalField: string;
  internalField: string;
  transformRule: string;
};

const EMPTY_FORM: IntegrationFormState = {
  shopId: "",
  name: "",
  type: "CSV_UPLOAD",
  provider: "",
  baseUrl: "",
  inventoryEndpoint: "",
  authType: "NONE",
  apiKey: "",
  bearerToken: "",
  syncFrequencyMinutes: "15",
};

const EMPTY_MAPPING_FORM: MappingFormState = {
  externalField: "",
  internalField: "title",
  transformRule: "",
};

const INTERNAL_MAPPING_FIELDS = [
  "externalId",
  "title",
  "description",
  "price",
  "currency",
  "category",
  "condition",
  "status",
  "images",
];

const INTEGRATION_TYPES: IntegrationKind[] = [
  "CSV_UPLOAD",
  "API_PULL",
  "WEBHOOK_PUSH",
  "SFTP_FEED",
  "POS_SYSTEM",
  "MOBILE_SCAN",
];

const AUTH_TYPES: IntegrationAuthType[] = [
  "NONE",
  "API_KEY",
  "BEARER_TOKEN",
  "BASIC",
  "CUSTOM_HEADER",
];

function statusLabel(status: IntegrationStatus | string) {
  if (status === "READY") return "Ready";
  if (status === "CONNECTED") return "Connected";
  if (status === "NEEDS_SETUP") return "Needs setup";
  if (status === "PAUSED") return "Paused";
  if (status === "ERROR") return "Error";
  if (status === "ARCHIVED") return "Archived";
  return "Planned";
}

function statusStyle(status: IntegrationStatus | string): CSSProperties {
  const base: CSSProperties = {
    alignSelf: "flex-start",
    borderRadius: 999,
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 900,
    border: "1px solid rgba(255,255,255,0.14)",
  };

  if (["READY", "CONNECTED"].includes(String(status))) {
    return {
      ...base,
      background: "rgba(34,197,94,0.12)",
      color: "#bbf7d0",
      borderColor: "rgba(74,222,128,0.28)",
    };
  }

  if (String(status) === "NEEDS_SETUP") {
    return {
      ...base,
      background: "rgba(245,158,11,0.12)",
      color: "#fde68a",
      borderColor: "rgba(251,191,36,0.28)",
    };
  }

  if (String(status) === "ERROR") {
    return {
      ...base,
      background: "rgba(248,113,113,0.12)",
      color: "#fecaca",
      borderColor: "rgba(248,113,113,0.28)",
    };
  }

  return {
    ...base,
    background: "rgba(148,163,184,0.1)",
    color: "#cbd5e1",
    borderColor: "rgba(148,163,184,0.24)",
  };
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function getJobSummary(job: InventorySyncJob) {
  const message = job.errorSummary?.message;
  return typeof message === "string" ? message : "Sync job recorded.";
}

export default function OwnerIntegrationsPage() {
  const [overview, setOverview] = useState<OwnerIntegrationOverview | null>(null);
  const [form, setForm] = useState<IntegrationFormState>(EMPTY_FORM);
  const [jobsByIntegration, setJobsByIntegration] = useState<
    Record<string, InventorySyncJob[]>
  >({});
  const [mappingsByIntegration, setMappingsByIntegration] = useState<
    Record<string, InventoryFieldMapping[]>
  >({});
  const [mappingForms, setMappingForms] = useState<Record<string, MappingFormState>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadOverview(signal?: AbortSignal) {
    setLoading(true);
    setError("");

    try {
      const data = await getOwnerIntegrationOverview(signal);
      setOverview(data);
      setForm((current) => ({
        ...current,
        shopId: current.shopId || data.shops[0]?.id || "",
      }));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load owner integrations.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadOverview(controller.signal);
    return () => controller.abort();
  }, []);

  const shopSummary = useMemo(() => {
    const shops = overview?.shops || [];
    if (shops.length === 0) return "No shops connected yet.";
    if (shops.length === 1) return `${shops[0]?.name || "1 shop"} ready for sync.`;
    return `${shops.length} shops ready for sync.`;
  }, [overview]);

  const connectors = overview?.connectors || [];
  const integrations = overview?.integrations || [];

  function updateForm<K extends keyof IntegrationFormState>(
    key: K,
    value: IntegrationFormState[K],
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateMappingForm(
    integrationId: string,
    key: keyof MappingFormState,
    value: string,
  ) {
    setMappingForms((current) => ({
      ...current,
      [integrationId]: {
        ...(current[integrationId] || EMPTY_MAPPING_FORM),
        [key]: value,
      },
    }));
  }

  async function loadMappings(integration: SavedInventoryIntegration) {
    const mappings = await getInventoryIntegrationMappings(integration.id);

    setMappingsByIntegration((current) => ({
      ...current,
      [integration.id]: mappings,
    }));

    return mappings;
  }

  async function handleCreateMapping(integration: SavedInventoryIntegration) {
    const mappingForm = mappingForms[integration.id] || EMPTY_MAPPING_FORM;

    setActionId(`mapping:${integration.id}`);
    setError("");
    setSuccess("");

    try {
      const mapping = await createInventoryIntegrationMapping(integration.id, {
        externalField: mappingForm.externalField,
        internalField: mappingForm.internalField,
        transformRule: mappingForm.transformRule,
      });

      setMappingsByIntegration((current) => ({
        ...current,
        [integration.id]: [
          ...(current[integration.id] || []),
          mapping,
        ],
      }));

      setMappingForms((current) => ({
        ...current,
        [integration.id]: EMPTY_MAPPING_FORM,
      }));

      setSuccess(`Mapping added for ${integration.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create mapping.");
    } finally {
      setActionId("");
    }
  }

  async function handleDeleteMapping(
    integration: SavedInventoryIntegration,
    mapping: InventoryFieldMapping,
  ) {
    setActionId(`delete-mapping:${mapping.id}`);
    setError("");
    setSuccess("");

    try {
      await deleteInventoryIntegrationMapping(integration.id, mapping.id);

      setMappingsByIntegration((current) => ({
        ...current,
        [integration.id]: (current[integration.id] || []).filter(
          (row) => row.id !== mapping.id,
        ),
      }));

      setSuccess(`Mapping removed for ${integration.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete mapping.");
    } finally {
      setActionId("");
    }
  }

  async function handleLoadMappings(integration: SavedInventoryIntegration) {
    setActionId(`mappings:${integration.id}`);
    setError("");
    setSuccess("");

    try {
      const mappings = await loadMappings(integration);
      setSuccess(`Loaded ${mappings.length} mappings for ${integration.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load mappings.");
    } finally {
      setActionId("");
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const payload: CreateInventoryIntegrationInput = {
        shopId: form.shopId,
        name: form.name,
        type: form.type,
        provider: form.provider,
        baseUrl: form.baseUrl,
        inventoryEndpoint: form.inventoryEndpoint,
        authType: form.authType,
        apiKey: form.apiKey,
        bearerToken: form.bearerToken,
        syncFrequencyMinutes: Number(form.syncFrequencyMinutes) || null,
        metadata: {
          createdFrom: "owner-integrations-page",
        },
      };

      const integration = await createInventoryIntegration(payload);
      setSuccess(`Integration created: ${integration.name}`);
      setForm((current) => ({
        ...EMPTY_FORM,
        shopId: current.shopId,
      }));
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create integration.");
    } finally {
      setSaving(false);
    }
  }

  async function runAction(
    integration: SavedInventoryIntegration,
    action: "test" | "sync" | "jobs" | "archive",
  ) {
    setActionId(`${action}:${integration.id}`);
    setError("");
    setSuccess("");

    try {
      if (action === "test") {
        const job = await testInventoryIntegration(integration.id);
        if (job) {
          setJobsByIntegration((current) => ({
            ...current,
            [integration.id]: [job, ...(current[integration.id] || [])],
          }));
        }
        setSuccess(`Test completed for ${integration.name}.`);
      }

      if (action === "sync") {
        const result = await syncInventoryIntegration(integration.id);
        const job = result.job;

        if (job) {
          setJobsByIntegration((current) => ({
            ...current,
            [integration.id]: [job, ...(current[integration.id] || [])],
          }));
        }

        setSuccess(`Sync completed for ${integration.name}.`);
        await loadOverview();
      }

      if (action === "jobs") {
        const jobs = await getInventoryIntegrationJobs(integration.id);
        setJobsByIntegration((current) => ({
          ...current,
          [integration.id]: jobs,
        }));
        setSuccess(`Loaded job history for ${integration.name}.`);
      }

      if (action === "archive") {
        await archiveInventoryIntegration(integration.id);
        setSuccess(`Archived ${integration.name}.`);
        await loadOverview();
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Failed to ${action} integration.`,
      );
    } finally {
      setActionId("");
    }
  }

  return (
    <div style={styles.page}>
      <section style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>Owner tools</div>
          <h1 style={styles.title}>Owner Integrations</h1>
          <p style={styles.subtitle}>
            Connect inventory sources, create saved connector records, test
            configuration, run sync jobs, import CSV files, and scan items from
            mobile.
          </p>
        </div>

        <div style={styles.heroActions}>
          <Link to="/owner/bulk-upload" style={styles.primaryLink}>
            Upload inventory
          </Link>
          <Link to="/owner/scan-console" style={styles.secondaryLink}>
            Open scanner
          </Link>
        </div>
      </section>

      {error ? (
        <div style={styles.errorCard}>
          <strong>Integrations action failed</strong>
          <p style={styles.messageText}>{error}</p>
        </div>
      ) : null}

      {success ? (
        <div style={styles.successCard}>
          <strong>{success}</strong>
        </div>
      ) : null}

      <section style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Shops available</div>
          <div style={styles.statValue}>{overview?.shops.length ?? "—"}</div>
          <div style={styles.statHelper}>{shopSummary}</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Saved integrations</div>
          <div style={styles.statValue}>{overview?.savedCount ?? "—"}</div>
          <div style={styles.statHelper}>Database-backed connector records.</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Ready tools</div>
          <div style={styles.statValue}>{overview?.readyCount ?? "—"}</div>
          <div style={styles.statHelper}>CSV upload, scan, API/webhook records.</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Planned sync options</div>
          <div style={styles.statValue}>{overview?.plannedCount ?? "—"}</div>
          <div style={styles.statHelper}>SFTP and named POS implementation.</div>
        </div>
      </section>

      <section style={styles.panel}>
        <div>
          <div style={styles.sectionLabel}>Create integration</div>
          <h2 style={styles.sectionTitle}>Add connector record</h2>
          <p style={styles.sectionText}>
            Save a connector configuration for one of your shops. This prepares
            the system for live API/webhook/SFTP sync while keeping CSV import
            and mobile scanning active today.
          </p>
        </div>

        <form onSubmit={handleCreate} style={styles.formGrid}>
          <label style={styles.label}>
            Shop
            <select
              value={form.shopId}
              onChange={(event) => updateForm("shopId", event.target.value)}
              style={styles.input}
            >
              <option value="">Choose shop</option>
              {(overview?.shops || []).map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name}
                  {shop.address ? ` — ${shop.address}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label style={styles.label}>
            Name
            <input
              value={form.name}
              onChange={(event) => updateForm("name", event.target.value)}
              placeholder="Downtown Pawn API Sync"
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            Type
            <select
              value={form.type}
              onChange={(event) =>
                updateForm("type", event.target.value as IntegrationKind)
              }
              style={styles.input}
            >
              {INTEGRATION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label style={styles.label}>
            Provider
            <input
              value={form.provider}
              onChange={(event) => updateForm("provider", event.target.value)}
              placeholder="internal_csv, custom_pos, vendor_feed..."
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            Base URL
            <input
              value={form.baseUrl}
              onChange={(event) => updateForm("baseUrl", event.target.value)}
              placeholder="https://example-pos.com/api"
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            Inventory endpoint
            <input
              value={form.inventoryEndpoint}
              onChange={(event) =>
                updateForm("inventoryEndpoint", event.target.value)
              }
              placeholder="/inventory"
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            Auth type
            <select
              value={form.authType}
              onChange={(event) =>
                updateForm("authType", event.target.value as IntegrationAuthType)
              }
              style={styles.input}
            >
              {AUTH_TYPES.map((authType) => (
                <option key={authType} value={authType}>
                  {authType}
                </option>
              ))}
            </select>
          </label>

          <label style={styles.label}>
            API key / token
            <input
              value={form.authType === "BEARER_TOKEN" ? form.bearerToken : form.apiKey}
              onChange={(event) => {
                if (form.authType === "BEARER_TOKEN") {
                  updateForm("bearerToken", event.target.value);
                } else {
                  updateForm("apiKey", event.target.value);
                }
              }}
              placeholder="Stored as masked credential hint"
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            Sync frequency minutes
            <input
              value={form.syncFrequencyMinutes}
              onChange={(event) =>
                updateForm("syncFrequencyMinutes", event.target.value)
              }
              placeholder="15"
              style={styles.input}
            />
          </label>

          <div style={styles.formActions}>
            <button
              type="submit"
              disabled={saving || loading}
              style={{
                ...styles.primaryButton,
                ...(saving || loading ? styles.disabledButton : {}),
              }}
            >
              {saving ? "Creating..." : "Create integration"}
            </button>
          </div>
        </form>
      </section>

      <section style={styles.panel}>
        <div>
          <div style={styles.sectionLabel}>Saved integrations</div>
          <h2 style={styles.sectionTitle}>Database-backed connectors</h2>
        </div>

        {loading ? (
          <div style={styles.loadingCard}>Loading integrations...</div>
        ) : integrations.length === 0 ? (
          <div style={styles.loadingCard}>
            No saved integrations yet. Create your first connector above.
          </div>
        ) : (
          <div style={styles.connectorGrid}>
            {integrations.map((integration) => {
              const jobs = jobsByIntegration[integration.id] || [];
              const isBusy = actionId.endsWith(integration.id);

              return (
                <article key={integration.id} style={styles.connectorCard}>
                  <div style={styles.connectorHeader}>
                    <div>
                      <div style={styles.connectorKind}>{integration.type}</div>
                      <h3 style={styles.connectorTitle}>{integration.name}</h3>
                    </div>

                    <span style={statusStyle(integration.status)}>
                      {statusLabel(integration.status)}
                    </span>
                  </div>

                  <div style={styles.metaGrid}>
                    <div>
                      <span>Shop</span>
                      <strong>{integration.shopName || integration.shopId}</strong>
                    </div>
                    <div>
                      <span>Provider</span>
                      <strong>{integration.provider || "—"}</strong>
                    </div>
                    <div>
                      <span>Auth</span>
                      <strong>
                        {integration.authType || "NONE"}
                        {integration.credentialHint
                          ? ` · ${integration.credentialHint}`
                          : ""}
                      </strong>
                    </div>
                    <div>
                      <span>Last sync</span>
                      <strong>{formatDate(integration.lastSyncAt)}</strong>
                    </div>
                  </div>

                  <div style={styles.cardActions}>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void runAction(integration, "test")}
                      style={styles.secondaryButton}
                    >
                      Test
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void runAction(integration, "sync")}
                      style={styles.secondaryButton}
                    >
                      Sync now
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void runAction(integration, "jobs")}
                      style={styles.secondaryButton}
                    >
                      Jobs
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleLoadMappings(integration)}
                      style={styles.secondaryButton}
                    >
                      Mappings
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void runAction(integration, "archive")}
                      style={styles.dangerButton}
                    >
                      Archive
                    </button>
                  </div>

                  <div style={styles.mappingPanel}>
                    <div style={styles.mappingHeader}>
                      <strong>Field mappings</strong>
                      <span>
                        {(mappingsByIntegration[integration.id] || []).length} saved
                      </span>
                    </div>

                    <div style={styles.mappingForm}>
                      <input
                        value={
                          (mappingForms[integration.id] || EMPTY_MAPPING_FORM)
                            .externalField
                        }
                        onChange={(event) =>
                          updateMappingForm(
                            integration.id,
                            "externalField",
                            event.target.value,
                          )
                        }
                        placeholder="External field: extTitle"
                        style={styles.input}
                      />

                      <select
                        value={
                          (mappingForms[integration.id] || EMPTY_MAPPING_FORM)
                            .internalField
                        }
                        onChange={(event) =>
                          updateMappingForm(
                            integration.id,
                            "internalField",
                            event.target.value,
                          )
                        }
                        style={styles.input}
                      >
                        {INTERNAL_MAPPING_FIELDS.map((field) => (
                          <option key={field} value={field}>
                            {field}
                          </option>
                        ))}
                      </select>

                      <input
                        value={
                          (mappingForms[integration.id] || EMPTY_MAPPING_FORM)
                            .transformRule
                        }
                        onChange={(event) =>
                          updateMappingForm(
                            integration.id,
                            "transformRule",
                            event.target.value,
                          )
                        }
                        placeholder="Optional transform"
                        style={styles.input}
                      />

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleCreateMapping(integration)}
                        style={styles.secondaryButton}
                      >
                        Add mapping
                      </button>
                    </div>

                    {(mappingsByIntegration[integration.id] || []).length > 0 ? (
                      <div style={styles.mappingList}>
                        {(mappingsByIntegration[integration.id] || []).map(
                          (mapping) => (
                            <div key={mapping.id} style={styles.mappingItem}>
                              <span>
                                <strong>{mapping.externalField}</strong> →{" "}
                                <strong>{mapping.internalField}</strong>
                              </span>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() =>
                                  void handleDeleteMapping(integration, mapping)
                                }
                                style={styles.dangerMiniButton}
                              >
                                Remove
                              </button>
                            </div>
                          ),
                        )}
                      </div>
                    ) : null}
                  </div>

                  {jobs.length > 0 ? (
                    <div style={styles.jobList}>
                      {jobs.slice(0, 3).map((job) => (
                        <div key={job.id} style={styles.jobItem}>
                          <strong>{job.status}</strong>
                          <span>
                            Created {job.createdCount || 0} · Updated{" "}
                            {job.updatedCount || 0} · Errors {job.errorCount || 0}
                          </span>
                          <small>{getJobSummary(job)}</small>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section style={styles.panel}>
        <div>
          <div style={styles.sectionLabel}>Connection options</div>
          <h2 style={styles.sectionTitle}>Integration tools</h2>
          <p style={styles.sectionText}>
            CSV imports and mobile scanning are active now. API/webhook
            connector records can now be saved, tested, synced, and audited.
          </p>
        </div>

        <div style={styles.connectorGrid}>
          {connectors.map((connector: OwnerIntegrationConnector) => (
            <article key={connector.id} style={styles.connectorCard}>
              <div style={styles.connectorHeader}>
                <div>
                  <div style={styles.connectorKind}>{connector.kind}</div>
                  <h3 style={styles.connectorTitle}>{connector.name}</h3>
                </div>

                <span style={statusStyle(connector.status)}>
                  {statusLabel(connector.status)}
                </span>
              </div>

              <p style={styles.connectorDescription}>{connector.description}</p>

              <ul style={styles.bulletList}>
                {connector.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>

              <div style={styles.cardActions}>
                <Link
                  to={connector.primaryHref}
                  style={
                    connector.status === "READY"
                      ? styles.primaryLinkSmall
                      : styles.secondaryLinkSmall
                  }
                >
                  {connector.primaryActionLabel}
                </Link>

                {connector.secondaryHref && connector.secondaryActionLabel ? (
                  <Link
                    to={connector.secondaryHref}
                    style={styles.secondaryLinkSmall}
                  >
                    {connector.secondaryActionLabel}
                  </Link>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: { display: "grid", gap: 20 },
  hero: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    opacity: 0.72,
    marginBottom: 8,
  },
  title: {
    margin: 0,
    fontSize: "clamp(2rem, 5vw, 3rem)",
    fontWeight: 900,
  },
  subtitle: {
    margin: "10px 0 0",
    maxWidth: 860,
    color: "rgba(238,242,255,0.78)",
    lineHeight: 1.6,
  },
  heroActions: { display: "flex", gap: 10, flexWrap: "wrap" },
  primaryLink: {
    display: "inline-flex",
    textDecoration: "none",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "#eef2ff",
    color: "#0f172a",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 900,
  },
  secondaryLink: {
    display: "inline-flex",
    textDecoration: "none",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "#eef2ff",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 800,
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
  },
  statCard: {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    padding: 18,
  },
  statLabel: {
    color: "rgba(238,242,255,0.68)",
    fontSize: 13,
    fontWeight: 800,
  },
  statValue: { marginTop: 8, fontSize: 34, fontWeight: 900 },
  statHelper: {
    marginTop: 6,
    color: "rgba(238,242,255,0.66)",
    fontSize: 13,
  },
  panel: {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    padding: 18,
    display: "grid",
    gap: 18,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.09em",
    textTransform: "uppercase",
    color: "rgba(147,197,253,0.9)",
  },
  sectionTitle: { margin: "6px 0 0", fontSize: 24, fontWeight: 900 },
  sectionText: {
    margin: "8px 0 0",
    maxWidth: 860,
    color: "rgba(238,242,255,0.72)",
    lineHeight: 1.55,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
    gap: 12,
  },
  label: {
    display: "grid",
    gap: 8,
    fontSize: 13,
    fontWeight: 800,
    color: "rgba(238,242,255,0.82)",
  },
  input: {
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(15,23,42,0.92)",
    color: "#eef2ff",
    borderRadius: 12,
    padding: "11px 12px",
    width: "100%",
  },
  formActions: { display: "flex", alignItems: "end", gap: 10 },
  primaryButton: {
    border: "1px solid rgba(255,255,255,0.18)",
    background: "#eef2ff",
    color: "#0f172a",
    borderRadius: 12,
    padding: "10px 14px",
    fontWeight: 900,
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "#eef2ff",
    borderRadius: 12,
    padding: "9px 12px",
    fontWeight: 800,
    cursor: "pointer",
  },
  dangerButton: {
    border: "1px solid rgba(248,113,113,0.34)",
    background: "rgba(248,113,113,0.12)",
    color: "#fecaca",
    borderRadius: 12,
    padding: "9px 12px",
    fontWeight: 800,
    cursor: "pointer",
  },
  disabledButton: { opacity: 0.55, cursor: "not-allowed" },
  loadingCard: {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(15,23,42,0.48)",
    borderRadius: 14,
    padding: 16,
  },
  connectorGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 14,
  },
  connectorCard: {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(15,23,42,0.54)",
    borderRadius: 16,
    padding: 16,
    display: "grid",
    gap: 14,
  },
  connectorHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
  },
  connectorKind: {
    color: "rgba(147,197,253,0.86)",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: "0.08em",
  },
  connectorTitle: { margin: "4px 0 0", fontSize: 19, fontWeight: 900 },
  connectorDescription: {
    margin: 0,
    color: "rgba(238,242,255,0.72)",
    lineHeight: 1.5,
  },
  bulletList: {
    margin: 0,
    paddingLeft: 20,
    color: "rgba(238,242,255,0.74)",
    lineHeight: 1.7,
  },
  cardActions: { display: "flex", flexWrap: "wrap", gap: 10 },
  primaryLinkSmall: {
    display: "inline-flex",
    textDecoration: "none",
    borderRadius: 12,
    padding: "9px 12px",
    background: "#eef2ff",
    color: "#0f172a",
    fontWeight: 900,
  },
  secondaryLinkSmall: {
    display: "inline-flex",
    textDecoration: "none",
    borderRadius: 12,
    padding: "9px 12px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "#eef2ff",
    fontWeight: 800,
  },
  metaGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 10,
    color: "rgba(238,242,255,0.72)",
  },
  jobList: {
    borderTop: "1px solid rgba(255,255,255,0.08)",
    paddingTop: 12,
    display: "grid",
    gap: 8,
  },
  jobItem: {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    padding: 10,
    display: "grid",
    gap: 4,
    color: "rgba(238,242,255,0.76)",
  },
  mappingPanel: {
    borderTop: "1px solid rgba(255,255,255,0.08)",
    paddingTop: 12,
    display: "grid",
    gap: 10,
  },
  mappingHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    color: "rgba(238,242,255,0.78)",
  },
  mappingForm: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 8,
  },
  mappingList: {
    display: "grid",
    gap: 8,
  },
  mappingItem: {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    padding: 10,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    color: "rgba(238,242,255,0.76)",
  },
  dangerMiniButton: {
    border: "1px solid rgba(248,113,113,0.34)",
    background: "rgba(248,113,113,0.12)",
    color: "#fecaca",
    borderRadius: 10,
    padding: "6px 9px",
    fontWeight: 800,
    cursor: "pointer",
  },
  errorCard: {
    border: "1px solid rgba(248,113,113,0.3)",
    background: "rgba(248,113,113,0.1)",
    color: "#fecaca",
    borderRadius: 18,
    padding: 16,
  },
  successCard: {
    border: "1px solid rgba(74,222,128,0.28)",
    background: "rgba(34,197,94,0.1)",
    color: "#bbf7d0",
    borderRadius: 18,
    padding: 16,
  },
  messageText: { margin: "6px 0 0" },
};
